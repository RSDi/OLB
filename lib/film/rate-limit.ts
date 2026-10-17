// Best-effort per-IP cap for team-code guesses and token mints. Lives in
// this instance's memory, so it is not shared across Vercel lambdas — enough
// to slow a casual brute-force, not a distributed one.

const windows = new Map<string, { count: number; resetAt: number }>();

export const TOKEN_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
export const UNLOCK_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };

function prune(now: number) {
  if (windows.size < 500) return;
  for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
}

export function rateLimitTake(
  key: string,
  limit: { max: number; windowMs: number },
  now = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  prune(now);
  const cur = windows.get(key);
  if (!cur || cur.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true };
  }
  if (cur.count >= limit.max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }
  cur.count += 1;
  return { ok: true };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}
