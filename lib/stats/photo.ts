// Server-only: an iPhone photo (HEIC) of the scorebook, as a JPEG.
// Most browsers can't open HEIC, so the page uploads it as it is and the
// server converts it here before Claude reads it. heic-convert decodes in
// plain JavaScript (sharp's own HEIF support covers AVIF only); sharp then
// shrinks it to the size the page sends for every other photo.

import convert from "heic-convert";
import sharp from "sharp";
import { PHOTO_MAX_PX } from "./types.ts";

export async function heicToJpeg(heic: Uint8Array): Promise<Uint8Array> {
  const full = await convert({ buffer: heic, format: "JPEG", quality: 0.92 });
  const small = await sharp(Buffer.from(full))
    .rotate()
    .resize({ width: PHOTO_MAX_PX, height: PHOTO_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return new Uint8Array(small);
}

export function isHeicPath(path: string): boolean {
  return /\.hei[cf]$/i.test(path);
}
