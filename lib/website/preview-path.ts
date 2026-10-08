// Where preview sends the editor: a page on this site, never elsewhere (no
// open redirect). Safe to import anywhere.
export function previewPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\s\0]/.test(raw)) return "/";
  if (raw.startsWith("/api/") || raw.startsWith("/portal")) return "/";
  return raw;
}
