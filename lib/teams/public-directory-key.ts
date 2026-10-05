// The public Directory's link key (/directory/<key>, migration 0119): what a
// key may look like, a fresh random one, and checking a link against it.
// No server imports, so Settings and the tests can use it too.

export const KEY_MIN = 16;
export const KEY_MAX = 128;
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

// Why a key can't be used, or null when it's fine. Letters, numbers, - and _
// only, so it reads the same in any link.
export function keyProblem(key: string): string | null {
  if (key.length < KEY_MIN) return `Use at least ${KEY_MIN} characters, so the link is hard to guess.`;
  if (key.length > KEY_MAX) return `Keep it to ${KEY_MAX} characters or fewer.`;
  if (!KEY_PATTERN.test(key)) return "Use only letters, numbers, dashes (-) and underscores (_).";
  return null;
}

// 24 random bytes as 32 URL-safe characters.
export function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Whether a link's key opens the page: the saved key must be set and valid,
// and the two must match. Compared without stopping at the first difference,
// so timing doesn't hint at how much of a guess was right.
export function keyOpens(given: string, saved: string | null | undefined): boolean {
  if (!saved || keyProblem(saved) || given.length !== saved.length) return false;
  let diff = 0;
  for (let i = 0; i < saved.length; i++) diff |= given.charCodeAt(i) ^ saved.charCodeAt(i);
  return diff === 0;
}
