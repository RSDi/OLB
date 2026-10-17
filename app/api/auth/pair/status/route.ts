import { getAuthUser } from "../../../../../lib/auth/viewer";
import { canApprovePairing, isPairingId } from "../../../../../lib/auth/pairing";
import { expireIfNeeded, loadPairing } from "../../../../../lib/auth/pairing-store";
import { json } from "../../../../../lib/auth/pairing-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user?.email) return json({ error: "not_signed_in" }, 401);
  if (!canApprovePairing(user.email)) return json({ error: "not_allowed" }, 403);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isPairingId(id)) return json({ error: "bad_request" }, 400);

  try {
    const raw = await loadPairing(id);
    if (!raw) return json({ error: "expired_token" }, 400);
    const row = await expireIfNeeded(raw);
    if (row.approved_by_email && row.approved_by_email !== user.email.toLowerCase() && row.status !== "pending") {
      return json({ error: "not_allowed" }, 403);
    }
    return json({ status: row.status });
  } catch (err) {
    console.error("[pair/status]", err);
    return json({ error: "failed" }, 500);
  }
}
