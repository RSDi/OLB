import { getPreview } from "../../../../../lib/activity/preview";
import { getAuthUser } from "../../../../../lib/auth/viewer";
import { memberDisplayName } from "../../../../../lib/members/display";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { sendPairingApprovedAlert } from "../../../../../lib/notifications/device-pair";
import {
  approveLimited,
  canApprovePairing,
  clubTime,
  describeDevice,
  isPairingId,
  pairingSecret,
  requestHost,
  requestIp,
} from "../../../../../lib/auth/pairing";
import {
  approvePairing,
  countRecentApprovals,
  denyPairing,
  expireIfNeeded,
  loadPairing,
} from "../../../../../lib/auth/pairing-store";
import { json, requireSameOrigin } from "../../../../../lib/auth/pairing-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user?.email) return json({ error: "not_signed_in" }, 401);
  if (await getPreview()) return json({ error: "preview" }, 403);
  if (!canApprovePairing(user.email)) return json({ error: "not_allowed" }, 403);

  let body: { id?: unknown; action?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "deny" ? "deny" : body.action === "approve" ? "approve" : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!isPairingId(id) || !action) return json({ error: "bad_request" }, 400);

  try {
    const raw = await loadPairing(id);
    if (!raw) return json({ error: "expired_token" }, 400);
    const row = await expireIfNeeded(raw);
    const host = requestHost(request.headers, request.url);
    if (row.host !== host) return json({ error: "wrong_host" }, 403);
    if (row.status !== "pending") return json({ error: "expired_token" }, 400);

    if (action === "deny") {
      const denied = await denyPairing(id);
      if (!denied) return json({ error: "expired_token" }, 400);
      return json({ status: "denied" });
    }

    if (!code) return json({ error: "bad_request" }, 400);

    const limited = approveLimited(await countRecentApprovals(user.email));
    if (limited) return json({ error: "rate_limited", message: limited }, 429);

    const result = await approvePairing({
      id,
      email: user.email,
      userId: user.id,
      sid: user.sessionId,
      ip: requestIp(request.headers),
      expectedHmac: row.user_code_hmac,
      pickedCode: code,
      secret: pairingSecret(),
    });
    if (result.wrong) return json({ error: "wrong_code" }, 400);
    if (!result.row) return json({ error: "expired_token" }, 400);

    const name = await approverName(user.id, user.email);
    await sendPairingApprovedAlert({
      pairingId: id,
      approverEmail: user.email,
      approverName: name,
      device: describeDevice(row.device_ua),
      city: row.device_city,
      ip: row.device_ip,
      askedAt: clubTime(row.created_at),
    });

    return json({ status: "approved" });
  } catch (err) {
    console.error("[pair/decide]", err);
    return json({ error: "failed" }, 500);
  }
}

async function approverName(userId: string, email: string): Promise<string> {
  try {
    const { data } = await createAdminClient()
      .from("members")
      .select("full_name, nickname, email")
      .eq("user_id", userId)
      .maybeSingle();
    const m = data as { full_name: string | null; nickname: string | null; email: string | null } | null;
    return m ? memberDisplayName(m) : email;
  } catch {
    return email;
  }
}
