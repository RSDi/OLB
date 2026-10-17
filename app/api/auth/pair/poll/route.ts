import { mintSession, revokeSession, switchBrowserSession } from "../../../../../lib/activity/preview";
import { logSignIn } from "../../../../../lib/activity/log";
import { createClient } from "../../../../../lib/supabase/server";
import {
  DEVICE_SESSION_TTL_MS,
  hashSecret,
  isPairingId,
  pollTooSoon,
  sameHash,
} from "../../../../../lib/auth/pairing";
import {
  consumePairing,
  expireIfNeeded,
  loadPairing,
  markLastPoll,
} from "../../../../../lib/auth/pairing-store";
import {
  clearPairCookies,
  json,
  pairCookieFromStore,
  requestIsSecure,
  requireSameOrigin,
  setDeviceCookie,
} from "../../../../../lib/auth/pairing-http";
import { requestHost } from "../../../../../lib/auth/pairing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "expired_token" }, 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!isPairingId(id)) return json({ error: "expired_token" }, 400);

  const cookie = await pairCookieFromStore();
  if (!cookie || cookie.id !== id) return json({ error: "expired_token" }, 400);

  const host = requestHost(request.headers, request.url);

  try {
    const raw = await loadPairing(id);
    if (!raw) return json({ error: "expired_token" }, 400);
    const row = await expireIfNeeded(raw);

    if (row.host !== host) return json({ error: "expired_token" }, 400);
    if (!sameHash(row.secret_hash, hashSecret(cookie.secret))) return json({ error: "expired_token" }, 400);

    if (pollTooSoon(row.last_poll_at)) return json({ error: "slow_down", interval: 5 }, 400);
    await markLastPoll(id);

    if (row.status === "pending") return json({ error: "authorization_pending" }, 400);
    if (row.status === "denied") return json({ error: "access_denied" }, 400);
    if (row.status === "expired" || row.status === "revoked" || row.status === "consumed") {
      return json({ error: "expired_token" }, 400);
    }
    if (row.status !== "approved" || !row.approved_by_user_id) {
      return json({ error: "authorization_pending" }, 400);
    }

    const minted = await mintSession(row.approved_by_user_id);
    const consumed = await consumePairing({
      id,
      secretHash: row.secret_hash,
      sessionId: minted.sessionId,
    });
    if (!consumed) {
      await revokeSession(minted);
      return json({ error: "expired_token" }, 400);
    }

    await switchBrowserSession(minted);
    const supabase = await createClient();
    await logSignIn(supabase, row.approved_by_user_id, "phone-pair", row.device_ua);

    const secure = requestIsSecure(request.headers, request.url);
    await setDeviceCookie(
      { id, secret: cookie.secret, expiresAt: Date.now() + DEVICE_SESSION_TTL_MS },
      secure
    );
    await clearPairCookies();

    return json({ status: "success" });
  } catch (err) {
    console.error("[pair/poll]", err);
    return json({ error: "failed" }, 500);
  }
}
