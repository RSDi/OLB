// Family upload page for a Directory team. Absolute URL only — never includes
// the team code (codes are hashed and shown once, separately).

export function filmUploadUrl(origin: string, slug: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  const path = slug.trim().toLowerCase();
  if (!base || !path) return "";
  return `${base}/t/${path}`;
}
