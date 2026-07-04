/*
 * One-off sweep to shrink oversized video attachments that failed to
 * archive because they exceeded Supabase Storage's max upload size (the
 * "Upload failed: The object exceeded the maximum allowed size" entries
 * visible on the Slack archive's exceptions page).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/slack-archive-compress-large-files.ts
 *
 * For every already-archived message with a video file over 50MB that
 * failed to store, this re-downloads the original from Slack (via the
 * url_private captured in that message's `raw` payload — no re-sync
 * needed), transcodes it down with ffmpeg, and uploads the result in place
 * of the failed attempt.
 *
 * Deliberately NOT wired into lib/slack-archive/files.ts's normal sync path
 * (used by both the nightly cron and scripts/slack-archive-backfill.ts):
 *   - Vercel's serverless functions have no ffmpeg binary and a 60s
 *     duration cap — nowhere near enough for video transcoding, and the
 *     `@ffmpeg-installer/ffmpeg` binary this script uses is ~65MB, which
 *     would bloat every function that imports files.ts (including the
 *     channel-viewer page, which only needs it to sign URLs) if it were a
 *     static import there instead of only here.
 * So this only ever runs locally, on demand — re-run it after a backfill
 * or whenever the exceptions page shows new oversized videos.
 *
 * Requires `@ffmpeg-installer/ffmpeg` (devDependency — installs a static
 * ffmpeg binary via npm, nothing to install system-wide).
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createAdminClient } from "../lib/supabase/admin";
import { downloadAndStoreSlackFile, type ArchivedFile, type FileTransformResult } from "../lib/slack-archive/files";
import type { SlackFile, SlackMessage } from "../lib/slack-archive/slack-api";

const SIZE_THRESHOLD_BYTES = 50 * 1024 * 1024;
const TARGET_BYTES = 45 * 1024 * 1024; // comfortable margin under the 50MB trigger
const PAGE_SIZE = 1000;

// Escalating compression passes — each one re-encodes the ORIGINAL download
// (not the previous pass's output, to avoid stacking lossy re-encodes).
// Stops at the first pass that lands under TARGET_BYTES, or the last pass
// if none do (still much smaller than the source, even if not under target).
const COMPRESSION_LADDER = [
  { width: 1280, crf: 28 },
  { width: 960, crf: 32 },
  { width: 640, crf: 36 },
];

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, args);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function compressVideo(bytes: ArrayBuffer, file: SlackFile): Promise<FileTransformResult | null> {
  if (!file.mimetype.startsWith("video/") || bytes.byteLength <= SIZE_THRESHOLD_BYTES) return null;

  const workDir = await mkdtemp(join(tmpdir(), "slack-archive-compress-"));
  const inputPath = join(workDir, `input${extname(file.name) || ".bin"}`);
  const outputPath = join(workDir, "output.mp4");
  try {
    await writeFile(inputPath, Buffer.from(bytes));

    let lastOutputBytes: Buffer | null = null;
    for (const [i, pass] of COMPRESSION_LADDER.entries()) {
      await runFfmpeg([
        "-y",
        "-i", inputPath,
        "-vf", `scale='min(${pass.width},iw)':-2`,
        "-c:v", "libx264",
        "-crf", String(pass.crf),
        "-preset", "veryfast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath,
      ]);
      const outputBytes = await readFile(outputPath);
      lastOutputBytes = outputBytes;
      const isLastPass = i === COMPRESSION_LADDER.length - 1;
      if (outputBytes.byteLength <= TARGET_BYTES || isLastPass) break;
    }

    if (!lastOutputBytes) return null;
    return {
      bytes: lastOutputBytes,
      mimetype: "video/mp4",
      name: file.name.replace(/\.\w+$/, "") + ".mp4",
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

interface MessageRow {
  id: string;
  channel_id: string;
  ts: string;
  files: ArchivedFile[];
  raw: SlackMessage;
}

function needsCompression(f: ArchivedFile): boolean {
  return Boolean(f.error) && f.mimetype.startsWith("video/") && f.size > SIZE_THRESHOLD_BYTES;
}

async function main() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error("[compress-large-files] SLACK_BOT_TOKEN not set");
    process.exit(1);
  }
  const admin = createAdminClient();

  let lastId: string | null = null;
  let scanned = 0;
  let attempted = 0;
  let succeeded = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (;;) {
    const base = admin
      .from("slack_archive_messages")
      .select("id, channel_id, ts, files, raw")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const { data, error } = await (lastId ? base.gt("id", lastId) : base);
    if (error) {
      console.error("[compress-large-files] query failed:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as MessageRow[];
    if (rows.length === 0) break;
    scanned += rows.length;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      const candidates = (row.files ?? []).filter(needsCompression);
      if (candidates.length === 0) continue;

      let updatedFiles = row.files;
      for (const candidate of candidates) {
        const rawFile = (row.raw.files ?? []).find((f) => f.id === candidate.id);
        if (!rawFile?.url_private) {
          console.warn(`[compress-large-files] ${row.channel_id}/${row.ts} file ${candidate.id}: no url_private in raw payload, skipping`);
          continue;
        }
        attempted += 1;
        const result = await downloadAndStoreSlackFile(admin, rawFile, row.channel_id, row.ts, token, {
          transform: compressVideo,
        });
        updatedFiles = updatedFiles.map((f) => (f.id === candidate.id ? result : f));
        if (result.storage_path) {
          succeeded += 1;
          bytesBefore += candidate.size;
          bytesAfter += result.size;
          const pct = Math.round((1 - result.size / candidate.size) * 100);
          console.log(
            `[compress-large-files] ${row.channel_id}/${row.ts} ${candidate.name}: ` +
              `${(candidate.size / 1024 / 1024).toFixed(1)}MB -> ${(result.size / 1024 / 1024).toFixed(1)}MB (${pct}% smaller)`,
          );
        } else {
          console.warn(`[compress-large-files] ${row.channel_id}/${row.ts} ${candidate.name}: still failed — ${result.error}`);
        }
      }

      if (updatedFiles !== row.files) {
        const { error: updateError } = await admin
          .from("slack_archive_messages")
          .update({ files: updatedFiles })
          .eq("id", row.id);
        if (updateError) {
          console.error(`[compress-large-files] failed to save updated files for message ${row.id}:`, updateError.message);
        }
      }
    }
  }

  console.log(
    `[compress-large-files] done. scanned ${scanned} messages, attempted ${attempted} files, ` +
      `${succeeded} succeeded (${(bytesBefore / 1024 / 1024).toFixed(0)}MB -> ${(bytesAfter / 1024 / 1024).toFixed(0)}MB).`,
  );
}

main().catch((err) => {
  console.error("[compress-large-files] fatal:", err);
  process.exit(1);
});
