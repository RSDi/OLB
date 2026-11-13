// The scorer's table (0165): a phone that typed the tournament's PIN keeps a
// cookie for the weekend. The cookie is a signature over the weekend and the
// PIN, so changing the PIN signs every phone out. Server only.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "../supabase/admin";
import { clientIp } from "../film/rate-limit";

export const SCORER_COOKIE = "olb_scorer";
// A four-digit PIN is quick to type at a busy table, so wrong guesses are
// held tight: a few per phone, and a cap across every phone, per window.
const MAX_FAILS = 5;
const MAX_FAILS_ALL = 40;
const WINDOW_MIN = 15;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  return key;
}

export function scorerToken(weekendId: string, pin: string): string {
  return createHmac("sha256", secret()).update(`scorer:${weekendId}:${pin}`).digest("base64url");
}

export async function readPin(weekendId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("hs_hosted").select("scorer_pin, hosted").eq("weekend_id", weekendId).maybeSingle();
  const row = data as { scorer_pin: string | null; hosted: boolean } | null;
  return row?.hosted ? row.scorer_pin : null;
}

// Whether this phone has the PIN for this weekend.
export async function isScorer(weekendId: string): Promise<boolean> {
  const raw = (await cookies()).get(SCORER_COOKIE)?.value;
  if (!raw) return false;
  const [wid, sig] = raw.split(".");
  if (wid !== weekendId || !sig) return false;
  const pin = await readPin(weekendId);
  if (!pin) return false;
  const want = Buffer.from(scorerToken(weekendId, pin));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

async function ipHash(): Promise<string> {
  const ip = clientIp(await headers());
  return createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 40);
}

// Wrong PINs from this address in the last few minutes: too many and it waits.
export async function pinLocked(weekendId: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const db = createAdminClient();
  const failures = () => db.from("hs_hosted_pin_failures").select("id", { count: "exact", head: true }).eq("weekend_id", weekendId).gte("at", since);
  const [mine, all] = await Promise.all([failures().eq("ip_hash", await ipHash()), failures()]);
  return (mine.count ?? 0) >= MAX_FAILS || (all.count ?? 0) >= MAX_FAILS_ALL;
}

export async function recordPinFailure(weekendId: string): Promise<void> {
  await createAdminClient().from("hs_hosted_pin_failures").insert({ weekend_id: weekendId, ip_hash: await ipHash() });
}

export function samePin(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
