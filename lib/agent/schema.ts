// Safe "is this column/table missing?" checks. Used instead of information_schema
// so a failed probe cannot dump catalog rows. PostgREST 400s when a select
// names a column the live schema doesn't have.

export function playlistColumnsMissing(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("youtube_playlist_id") || m.includes("youtube_playlist_status");
}

export function relationMissing(message: string | null | undefined, relation: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const rel = relation.toLowerCase();
  if (!m.includes(rel)) return false;
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find");
}

export function columnMissing(message: string | null | undefined, column: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const col = column.toLowerCase();
  return m.includes(col) && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"));
}
