// Page text and pictures on the public site: the shapes Settings → Website
// saves in site_content, and the checks on them. The spots themselves are
// listed in ./slots.ts. Safe to import from client components.

export type SlotKind = "text" | "markdown" | "image";

// A picture uploaded for the site, as saved in site_content.value (JSON).
export interface SiteImageValue {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export const SITE_IMAGES_BUCKET = "site-images";
export const SITE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SITE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const SITE_TEXT_MAX = 20000;
export const SITE_ALT_MAX = 300;

// The only addresses a saved picture may point at: the site-images bucket of
// this project's Supabase storage.
export function siteImageUrlPrefix(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${SITE_IMAGES_BUCKET}/`;
}

export function parseImageValue(value: string | null | undefined): SiteImageValue | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<SiteImageValue>;
    if (
      typeof v.url === "string" &&
      typeof v.width === "number" &&
      typeof v.height === "number" &&
      v.width > 0 &&
      v.height > 0
    ) {
      return { url: v.url, width: Math.round(v.width), height: Math.round(v.height), alt: typeof v.alt === "string" ? v.alt : "" };
    }
  } catch {
    // Not JSON: treat as unset.
  }
  return null;
}

// Checks a picture before it's saved. `prefix` is siteImageUrlPrefix().
export function cleanImageValue(
  v: SiteImageValue,
  prefix: string | null,
): { value: SiteImageValue } | { error: string } {
  if (!prefix || !v.url.startsWith(prefix) || v.url.includes("..")) {
    return { error: "Upload the picture here rather than linking to one elsewhere." };
  }
  if (!(v.width > 0 && v.height > 0 && v.width <= 20000 && v.height <= 20000)) {
    return { error: "Couldn't read that picture's size. Try a different file." };
  }
  const alt = v.alt.trim();
  if (alt.length > SITE_ALT_MAX) return { error: `Keep the description to ${SITE_ALT_MAX} characters or fewer.` };
  return { value: { url: v.url, width: Math.round(v.width), height: Math.round(v.height), alt } };
}

// Checks text before it's saved: required, and not absurdly long. `max` is
// the spot's own limit for short one-line spots.
export function cleanText(raw: string, max = SITE_TEXT_MAX): { value: string } | { error: string } {
  const value = raw.replace(/\r\n?/g, "\n").trim();
  if (!value) return { error: "Type something, or use Reset to put the original words back." };
  if (value.length > max) return { error: `Keep it to ${max.toLocaleString()} characters or fewer.` };
  return { value };
}

// Single line breaks the editor typed show as line breaks on the page, the
// way people expect, rather than running together as markdown normally does.
export function keepLineBreaks(md: string): string {
  return md.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}
