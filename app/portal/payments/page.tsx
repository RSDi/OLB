import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { loadPaymentsData, myPlayerIds } from "../../../lib/finances/data";
import { FamilyView } from "./FamilyView";
import { TreasurerView } from "./TreasurerView";

// Payments (migration 0101). Anyone with the Payments grant (the Treasurer;
// super-admins always) sees every family and records what comes in. A parent
// sees their own family's balance, once the Treasurer has turned that on.
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  // ?family=<player id>: open that player's family (from a player page).
  const { family } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  if (viewer.canManageFinances) {
    const data = await loadPaymentsData();
    if (!data) return <Notice title="No season yet" body="Payments start once this season's roster is set up." />;
    return <TreasurerView data={data} openPlayerId={family ?? null} />;
  }

  if (viewer.status !== "approved") {
    return <Notice title="Not available yet" body="You'll see your balance here once your account is approved." />;
  }
  const ids = await myPlayerIds(viewer.memberId);
  const data = await loadPaymentsData({ onlyPlayerIds: ids });
  if (!data || ids.length === 0) {
    return (
      <Notice
        title="No players on your account"
        body="Your balance shows here when you're a parent on a player's registration. If that's you, sign in with the email you registered with."
      />
    );
  }
  if (!data.board.parent_balances_visible) {
    return (
      <Notice
        title="Balances aren't ready yet"
        body="The Treasurer is still entering this season's payments. Your balance will show here soon."
      />
    );
  }
  return <FamilyView data={data} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 420, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
