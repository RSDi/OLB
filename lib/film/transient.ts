// Errors that mean "the connection dropped, try again from where we were",
// not "this upload is broken". The YouTube session and the bytes it already
// has are kept for these, so a 5 GB file doesn't start over at 0%.

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CLOSED",
  "UND_ERR_ABORTED",
]);

function codeOf(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isTransientFilmError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = codeOf(err) ?? codeOf(err.cause);
  if (code && NETWORK_CODES.has(code)) return true;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const msg = err.message;
  if (/^(terminated|fetch failed|other side closed|socket hang up)$/i.test(msg)) return true;
  // YouTube or Storage having a bad minute.
  if (/^YouTube (returned )?(5\d\d|429)\b/.test(msg)) return true;
  if (/^Couldn't read film bytes \((5\d\d|429)\)/.test(msg)) return true;
  return false;
}
