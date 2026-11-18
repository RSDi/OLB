// Storage says "Object not found" when a phone upload never finished: the
// row exists but the file never arrived. Say that in plain words.
export function filmFileErrorMessage(err: unknown, filename: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (/not\s*found|404|no such key/i.test(raw)) {
    return `${filename} never finished uploading from the phone, so there's no file to play or download. If the family sent it again, delete this copy. If not, ask them to upload it again.`;
  }
  return raw || "Couldn't make a download link.";
}
