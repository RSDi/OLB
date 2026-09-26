// Preview rendering for the Slack archive photo album, used by
// scripts/slack-archive-generate-thumbnails.ts. Lives under scripts/ (not
// lib/) for the same reason as the compression script's ffmpeg code: sharp
// and the bundled ffmpeg binary are heavy native dependencies that no app
// route should ever pull into its bundle.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";

// Grid tiles top out around 190 CSS px, so a 480px short edge stays sharp
// at 2x and on 3x phones; the aspect ratio is kept (not cropped square) so
// the viewer can show the preview, letterboxed, while the original loads.
const PREVIEW_SHORT_EDGE = 480;
const PREVIEW_QUALITY = 72;

export const PREVIEW_CONTENT_TYPE = "image/webp";

// Any still image sharp can decode → preview. rotate() with no argument
// applies the EXIF orientation (phone photos are often stored sideways);
// animated GIF/WebP contribute their first frame.
export async function renderPreview(image: Buffer): Promise<Buffer> {
  return sharp(image, { failOn: "none" })
    .rotate()
    .resize({ width: PREVIEW_SHORT_EDGE, height: PREVIEW_SHORT_EDGE, fit: "outside", withoutEnlargement: true })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();
}

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
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

// One frame of a video, as PNG. A second in skips the black or fading-in
// first frame most phone clips open on; anything shorter falls back to the
// very first frame. ffmpeg applies the rotation phones record in metadata.
export async function extractVideoFrame(video: Buffer, fileName: string): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "slack-archive-thumb-"));
  const inputPath = join(workDir, `input${extname(fileName) || ".mp4"}`);
  const framePath = join(workDir, "frame.png");
  try {
    await writeFile(inputPath, video);
    let lastError: unknown = null;
    for (const seek of ["1", "0"]) {
      try {
        await rm(framePath, { force: true });
        await runFfmpeg(["-y", "-ss", seek, "-i", inputPath, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", framePath]);
        const frame = await readFile(framePath);
        if (frame.byteLength > 0) return frame;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("ffmpeg produced no frame");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function renderVideoPreview(video: Buffer, fileName: string): Promise<Buffer> {
  return renderPreview(await extractVideoFrame(video, fileName));
}
