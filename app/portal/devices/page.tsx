import { redirect } from "next/navigation";
import { getAuthUser, getViewer } from "../../../lib/auth/viewer";
import { getPreview } from "../../../lib/activity/preview";
import { canApprovePairing, isPairingId } from "../../../lib/auth/pairing";
import { listSignedInDevices } from "../../../lib/auth/pairing-store";
import { DevicesList } from "./DevicesList";

export const dynamic = "force-dynamic";

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/portal/devices");
  const viewer = await getViewer();
  if (!viewer || !canApprovePairing(user.email) || (await getPreview())) redirect("/portal/directory");

  const devices = await listSignedInDevices(user.email ?? "");
  const raw = (await searchParams).revoke;
  const highlight = typeof raw === "string" && isPairingId(raw) ? raw : null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Signed-in devices</h1>
        <p className="rsd-muted" style={{ margin: "8px 0 0" }}>
          Devices you approved with <strong>Sign in with phone</strong>. Each one lasts 12 hours. Sign one
          out if it isn&apos;t yours.
        </p>
      </div>
      <DevicesList devices={devices} highlightId={highlight} />
    </div>
  );
}
