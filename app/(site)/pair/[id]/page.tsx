import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSection } from "../../_components/AuthSection";
import { getAuthUser, getViewer } from "../../../../lib/auth/viewer";
import { getPreview } from "../../../../lib/activity/preview";
import { memberDisplayName } from "../../../../lib/members/display";
import { createAdminClient } from "../../../../lib/supabase/admin";
import {
  canApprovePairing,
  clubTime,
  decoyCodes,
  deriveUserCode,
  describeDevice,
  isPairingId,
  pairingSecret,
  requestHost,
  shuffleCodes,
} from "../../../../lib/auth/pairing";
import { expireIfNeeded, loadPairing } from "../../../../lib/auth/pairing-store";
import { PairApproveScreen, type PairViewState } from "./PairApproveScreen";

export const metadata: Metadata = { title: "Approve device" };
export const dynamic = "force-dynamic";

export default async function PairApprovePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isPairingId(id)) {
    return (
      <AuthSection title="Approve a device." intro="This sign-in link isn't valid.">
        <p>Start again from the other screen.</p>
      </AuthSection>
    );
  }

  const user = await getAuthUser();
  if (!user) redirect(`/login?next=/pair/${id}`);

  const [preview, viewer] = await Promise.all([getPreview(), getViewer()]);
  const name = await displayName(user.id, user.email ?? "");

  if (preview) {
    return (
      <Shell>
        <PairApproveScreen
          id={id}
          name={name}
          device=""
          city={null}
          ip={null}
          askedAt=""
          codes={[]}
          initialState="blocked"
          blockedReason="Leave Preview as before approving a device."
        />
      </Shell>
    );
  }

  if (!canApprovePairing(user.email) || !viewer) {
    return (
      <Shell>
        <PairApproveScreen
          id={id}
          name={name}
          device=""
          city={null}
          ip={null}
          askedAt=""
          codes={[]}
          initialState="blocked"
          blockedReason="Only an allowlisted account can approve a new device."
        />
      </Shell>
    );
  }

  let row;
  try {
    const raw = await loadPairing(id);
    row = raw ? await expireIfNeeded(raw) : null;
  } catch {
    row = null;
  }

  if (!row) {
    return (
      <Shell>
        <PairApproveScreen
          id={id}
          name={name}
          device=""
          city={null}
          ip={null}
          askedAt=""
          codes={[]}
          initialState="expired"
        />
      </Shell>
    );
  }

  const host = requestHost(await headers());
  if (host && row.host !== host) {
    return (
      <Shell>
        <PairApproveScreen
          id={id}
          name={name}
          device=""
          city={null}
          ip={null}
          askedAt=""
          codes={[]}
          initialState="blocked"
          blockedReason="This sign-in was started on a different site."
        />
      </Shell>
    );
  }

  let state: PairViewState = "choose";
  if (row.status === "denied" || row.status === "revoked") state = "denied";
  else if (row.status === "consumed") state = "consumed";
  else if (row.status === "approved") state = "approved";
  else if (row.status !== "pending") state = "expired";

  const real = deriveUserCode(row.id, row.secret_hash, pairingSecret());
  const codes = state === "choose" ? shuffleCodes([real, ...decoyCodes(real)], row.id) : [];

  return (
    <Shell>
      <PairApproveScreen
        id={id}
        name={name}
        device={describeDevice(row.device_ua)}
        city={row.device_city}
        ip={row.device_ip}
        askedAt={clubTime(row.created_at)}
        codes={codes}
        initialState={state}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthSection
      title="Approve a device."
      intro="Check the other screen, pick the matching code, then tap Approve."
    >
      {children}
    </AuthSection>
  );
}

async function displayName(userId: string, email: string): Promise<string> {
  try {
    const { data } = await createAdminClient()
      .from("members")
      .select("full_name, nickname, email")
      .eq("user_id", userId)
      .maybeSingle();
    const m = data as { full_name: string | null; nickname: string | null; email: string | null } | null;
    return m ? memberDisplayName(m) : email || "you";
  } catch {
    return email || "you";
  }
}
