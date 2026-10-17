// Status copy and time/size formatting for the family /t/<slug> uploader.

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatFinishTime(ms: number, locales?: Intl.LocalesArgument): string {
  return new Date(ms).toLocaleTimeString(locales, { hour: "numeric", minute: "2-digit" });
}

export function allUploadsFinished(
  files: readonly { status: "waiting" | "uploading" | "done" | "error" }[]
): boolean {
  return files.length > 0 && files.every((f) => f.status === "done");
}

// ~4 GB. Phone 4K recordings often land here; 1080p30 is much smaller.
export const LARGE_FILM_HINT_BYTES = 4 * 1024 * 1024 * 1024;

export function isLargeFilmFile(bytes: number): boolean {
  return bytes > LARGE_FILM_HINT_BYTES;
}
