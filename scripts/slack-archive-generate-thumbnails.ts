/*
 * Makes the small preview images the Slack archive's photo album shows in
 * its grid (/portal/slack-archive/album), so browsing the album doesn't
 * mean downloading every full-size phone photo.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/slack-archive-generate-thumbnails.ts [--dry-run] [--force]
 *
 * For every stored photo and video attachment, checks whether its preview
 * exists (at thumbnailPathFor(storage_path) in the same private bucket —
 * see lib/slack-archive/album.ts) and, if not, renders one: photos through
 * sharp (EXIF-rotated, first frame for animations), videos by grabbing a
 * frame with ffmpeg. The album falls back to originals (photos) and a
 * placeholder tile (videos) for anything this hasn't reached yet, so it's
 * safe to run at any time and simply picks up where it left off.
 *
 * If a file can't be decoded here — typically an iPhone HEIC, which neither
 * sharp's nor ffmpeg's bundled builds read — it falls back to the preview
 * Slack generated for that file (via the url in the message's stored `raw`
 * payload), when the file is still available in Slack and SLACK_BOT_TOKEN
 * is set.
 *
 *   --dry-run  report how many previews are missing without making any
 *   --force    remake every preview, even ones that already exist
 *
 * Runs nightly in GitHub Actions (.github/workflows/slack-archive-
 * thumbnails.yml), and on demand from the album's "Make previews now"
 * button. Never part of the Vercel sync path: sharp and ffmpeg are heavy
 * native dependencies with no business in the app's serverless bundles.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase/admin";
import { albumMediaKind, thumbnailPathFor, type AlbumMediaKind } from "../lib/slack-archive/album";
import { ARCHIVE_FILES_BUCKET, signArchiveFileUrls, type ArchivedFile } from "../lib/slack-archive/files";
import { PREVIEW_CONTENT_TYPE, renderPreview, renderVideoPreview } from "./lib/slack-archive-thumbnails";

const PAGE_SIZE = 1000;
// Originals are downloaded and decoded in memory; a few at a time keeps a
// batch of 50MB videos comfortably inside a GitHub runner's RAM.
const CONCURRENCY = 3;

interface Candidate {
  messageId: string;
  fileId: string;
  kind: AlbumMediaKind;
  name: string;
  storagePath: string;
  thumbPath: string;
}

interface SlackFileThumbs {
  id: string;
  thumb_1024?: string;
  thumb_720?: string;
  thumb_480?: string;
  thumb_360?: string;
  thumb_video?: string;
}

async function collectCandidates(admin: SupabaseClient): Promise<{ candidates: Candidate[]; scanned: number }> {
  const byPath = new Map<string, Candidate>();
  let scanned = 0;
  let lastId: string | null = null;
  for (;;) {
    const base = admin
      .from("slack_archive_messages")
      .select("id, files")
      .neq("files", "[]")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const { data, error } = await (lastId ? base.gt("id", lastId) : base);
    if (error) throw new Error(`message scan failed: ${error.message}`);
    const rows = (data ?? []) as { id: string; files: ArchivedFile[] | null }[];
    scanned += rows.length;
    for (const row of rows) {
      for (const file of row.files ?? []) {
        if (!file?.storage_path || file.error) continue;
        const kind = albumMediaKind(file);
        if (!kind || byPath.has(file.storage_path)) continue;
        byPath.set(file.storage_path, {
          messageId: row.id,
          fileId: file.id,
          kind,
          name: file.name || "file",
          storagePath: file.storage_path,
          thumbPath: thumbnailPathFor(file.storage_path),
        });
      }
    }
    if (rows.length < PAGE_SIZE) break;
    lastId = rows[rows.length - 1].id;
  }
  return { candidates: [...byPath.values()], scanned };
}

async function downloadOriginal(admin: SupabaseClient, storagePath: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(ARCHIVE_FILES_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

// Slack's own rendition of the file (a JPEG, even for HEIC originals), for
// files we can't decode ourselves. Only works while the file still exists in
// Slack; the url needs the bot token.
async function fetchSlackPreview(admin: SupabaseClient, c: Candidate, token: string | undefined): Promise<Buffer | null> {
  if (!token) return null;
  const { data, error } = await admin
    .from("slack_archive_messages")
    .select("raw_files:raw->files")
    .eq("id", c.messageId)
    .maybeSingle();
  if (error) return null;
  const rawFiles = ((data as { raw_files?: SlackFileThumbs[] | null } | null)?.raw_files ?? []) as SlackFileThumbs[];
  const raw = rawFiles.find((f) => f?.id === c.fileId);
  if (!raw) return null;
  const urls = c.kind === "video" ? [raw.thumb_video] : [raw.thumb_1024, raw.thumb_720, raw.thumb_480, raw.thumb_360];
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      // Slack answers an unauthorized or expired file with a 200 HTML page,
      // so the content type is the real success check.
      if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch {
      // try the next size
    }
  }
  return null;
}

async function makePreview(admin: SupabaseClient, c: Candidate, token: string | undefined): Promise<{ bytes: Buffer; source: "original" | "slack" }> {
  let firstError: unknown;
  try {
    const original = await downloadOriginal(admin, c.storagePath);
    const bytes = c.kind === "video" ? await renderVideoPreview(original, c.name) : await renderPreview(original);
    return { bytes, source: "original" };
  } catch (err) {
    firstError = err;
  }
  const slack = await fetchSlackPreview(admin, c, token);
  if (slack) return { bytes: await renderPreview(slack), source: "slack" };
  throw firstError instanceof Error ? firstError : new Error(String(firstError));
}

async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  // Named up front, all at once, for the same reason as the compression
  // script: in GitHub Actions a failure email is the only feedback. The
  // Slack token is optional — it only enables the HEIC fallback.
  const missingEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error(
      `[thumbnails] missing environment variable${missingEnv.length === 1 ? "" : "s"}: ${missingEnv.join(", ")}. ` +
        "Locally these come from .env.local; in GitHub Actions they must be added as repository secrets " +
        "(repo Settings → Secrets and variables → Actions).",
    );
    process.exit(1);
  }
  const token = process.env.SLACK_BOT_TOKEN || undefined;
  if (!token) console.warn("[thumbnails] SLACK_BOT_TOKEN not set — files that can't be decoded here (e.g. HEIC) will be skipped.");

  const admin = createAdminClient();
  const { candidates, scanned } = await collectCandidates(admin);

  // A thumbnail path that signs is a thumbnail that exists — one batched
  // Storage call per thousand files instead of a lookup each.
  const existing = force
    ? new Map<string, string>()
    : await signArchiveFileUrls(admin, candidates.map((c) => c.thumbPath), 60);
  const todo = candidates.filter((c) => !existing.has(c.thumbPath));

  console.log(
    `[thumbnails] scanned ${scanned} messages: ${candidates.length} photos and videos, ` +
      `${candidates.length - todo.length} already have previews, ${todo.length} to make${dryRun ? " (dry run — making none)" : ""}.`,
  );
  if (dryRun || todo.length === 0) return;

  let made = 0;
  let fromSlack = 0;
  let bytesOut = 0;
  const failures: string[] = [];
  await forEachLimited(todo, CONCURRENCY, async (c) => {
    try {
      const { bytes, source } = await makePreview(admin, c, token);
      const { error } = await admin.storage
        .from(ARCHIVE_FILES_BUCKET)
        .upload(c.thumbPath, bytes, { contentType: PREVIEW_CONTENT_TYPE, upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(`upload failed: ${error.message}`);
      made += 1;
      bytesOut += bytes.byteLength;
      if (source === "slack") fromSlack += 1;
      if (made % 50 === 0) console.log(`[thumbnails] ${made}/${todo.length}…`);
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      failures.push(`${c.storagePath}: ${message}`);
    }
  });

  for (const f of failures) console.warn(`[thumbnails] could not make a preview for ${f}`);
  console.log(
    `[thumbnails] done. made ${made} preview${made === 1 ? "" : "s"} (${(bytesOut / 1024 / 1024).toFixed(1)}MB total` +
      `${fromSlack > 0 ? `, ${fromSlack} from Slack's copy` : ""}), ${failures.length} failed.`,
  );
}

main().catch((err) => {
  console.error("[thumbnails] fatal:", err);
  process.exit(1);
});
