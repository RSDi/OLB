// The "Preview as" cookie, shared by the server (start/exit, banner) and the
// middleware (expiry). Pure string handling, no Node APIs, so it runs in the
// middleware's edge runtime too.
//
// Value: `<preview id>.<secret>.<expires at, epoch ms>`. The id finds the
// member_previews row, the secret proves this browser started it (the row
// keeps only its hash), and the expiry lets middleware end a stale preview
// without a database call. The cookie itself outlives the expiry on purpose:
// if it vanished at the deadline, nothing would notice the browser was still
// signed in as the member.

export const PREVIEW_COOKIE = "olb_preview";

// How long a preview lasts before it ends by itself.
export const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

// The cookie's own lifetime (see above).
export const PREVIEW_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

// Where the banner's "Exit preview" button (and a timed-out preview) goes.
export const PREVIEW_EXIT_PATH = "/auth/preview/exit";

export interface PreviewCookie {
  id: string;
  secret: string;
  expiresAt: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

export function encodePreviewCookie(c: PreviewCookie): string {
  return `${c.id}.${c.secret}.${c.expiresAt}`;
}

export function parsePreviewCookie(raw: string | null | undefined): PreviewCookie | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [id, secret, exp] = parts;
  const expiresAt = Number(exp);
  if (!UUID.test(id) || !SECRET.test(secret) || !Number.isSafeInteger(expiresAt)) return null;
  return { id, secret, expiresAt };
}

export function previewExpired(c: PreviewCookie, now = Date.now()): boolean {
  return c.expiresAt <= now;
}
