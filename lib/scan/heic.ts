// iPhone photos (HEIC, a kind of HEIF). Safari opens them; Chrome, Edge and
// Firefox can't, so the scanner converts them to JPEG in the browser with
// heic-to (libheif). The converter is a few MB, so it's only fetched when a
// HEIC photo actually turns up. Safe to import from client components.

// By type, or by name when the computer doesn't know the type (Windows
// often reports an empty one).
export function looksLikeHeic(file: { name: string; type: string }): boolean {
  if (/^image\/hei[cf](-sequence)?$/i.test(file.type)) return true;
  return /\.hei[cf]$/i.test(file.name);
}

// The photo as a JPEG. Rejects when it isn't a HEIC photo after all, or is
// damaged.
export async function heicToJpeg(file: Blob): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

// "IMG_0001.HEIC" → "IMG_0001.jpg".
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "") || "Photo";
  return `${base}.jpg`;
}
