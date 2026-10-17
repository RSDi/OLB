import { createAdminClient } from "../../../../../lib/supabase/admin";
import { getAuthUser } from "../../../../../lib/auth/viewer";
import { getPreview } from "../../../../../lib/activity/preview";
import { canApprovePairing, isPairingId } from "../../../../../lib/auth/pairing";
import { listSignedInDevices, revokeAllFor, revokePairing } from "../../../../../lib/auth/pairing-store";
import { json, requireSameOrigin } from "../../../../../lib/auth/pairing-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user?.email) return json({ error: "not_signed_in" }, 401);
  if (await getPreview()) return json({ error: "preview" }, 403);
  if (!canApprovePairing(user.email)) return json({ error: "not_allowed" }, 403);

  let body: { id?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  try {
    const rows = body.all === true
      ? await revokeAllFor(user.email)
      : isPairingId(typeof body.id === "string" ? body.id : "")
        ? [await revokePairing({ id: body.id as string, email: user.email, onlyMine: user.email })].filter(Boolean)
        : [];
    if (body.all !== true && rows.length === 0) return json({ error: "not_found" }, 404);

    const admin = createAdminClient();
    const del = (
      admin.auth.admin as { deleteUserSession?: (userId: string, sessionId: string) => Promise<unknown> }
    ).deleteUserSession;
    for (const row of rows) {
      if (!row?.session_id || !row.approved_by_user_id || !del) continue;
      try {
        await del(row.approved_by_user_id, row.session_id);
      } catch (err) {
        console.error("[pair/revoke] deleteUserSession", err);
      }
    }

    const devices = await listSignedInDevices(user.email);
    return json({ status: "revoked", remaining: devices.length });
  } catch (err) {
    console.error("[pair/revoke]", err);
    return json({ error: "failed" }, 500);
  }
}
