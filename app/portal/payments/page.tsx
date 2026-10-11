import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { loadPaymentsData, myPlayerIds } from "../../../lib/finances/data";
import { FamilyView } from "./FamilyView";
import { TreasurerView } from "./TreasurerView";
import { workflowEnabled } from "../../../lib/onboarding/board-data";
import { createAdminClient } from "../../../lib/supabase/admin";
import { financesEnabled, latestBoard, loadClubData, loadDues } from "../../../lib/finances/club-data";
import { buildSnapshot } from "../../../lib/finances/club-logic";
import { PaymentsTabs, type PaymentsTab } from "./club-parts";
import { BudgetView } from "./BudgetView";
import { IncomeView } from "./IncomeView";
import { ProgramsView } from "./ProgramsView";
import { FundraisingView } from "./FundraisingView";
import { SnapshotView } from "./SnapshotView";

const MANAGER_TABS: PaymentsTab[] = ["families", "budget", "income", "programs", "fundraising", "snapshot"];

// Payments (migration 0101). Anyone with the Payments grant (the Treasurer;
// super-admins always) sees every family and records what comes in. A parent
// sees their own family's balance, once the Treasurer has turned that on.
//
// Club finances (0131), while it's on (or for the preview accounts): the
// Treasurer also gets Budget, Income, Programs, Fundraising and Snapshot, and
// the board and "See club finances" get the Snapshot.
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ family?: string; tab?: string }> }) {
  // ?family=<player id>: open that player's family (from a player page).
  const { family, tab } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const club = (viewer.canManageFinances || viewer.canViewFinances) && (viewer.seesFullUi || (await financesEnabled()));

  if (viewer.canManageFinances) {
    const active = club && MANAGER_TABS.includes(tab as PaymentsTab) ? (tab as PaymentsTab) : "families";
    const tabs = club ? <PaymentsTabs tabs={MANAGER_TABS} active={active} /> : null;
    if (active === "families") {
      const data = await loadPaymentsData();
      if (!data) return <Notice title="No season yet" body="Payments start once this season's roster is set up." />;
      // Match Venmo (0130): the preview accounts, and while the registration
      // workflow is on.
      const venmo = viewer.seesFullUi || (await workflowEnabled());
      const due = club ? await loadDues(createAdminClient(), data.board.id).catch(() => ({ dues: {}, defaultDue: null })) : { dues: {}, defaultDue: null };
      return (
        <>
          {tabs}
          <TreasurerView data={data} openPlayerId={family ?? null} venmo={venmo} club={club} dues={due.dues} defaultDue={due.defaultDue} />
        </>
      );
    }
    const db = createAdminClient();
    const board = await latestBoard(db);
    if (!board) return <Notice title="No season yet" body="Payments start once this season's roster is set up." />;
    const { data, credits } = await loadClubData(db, board);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://omahalightning.org").replace(/\/$/, "");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tabs}
        {active === "budget" && <BudgetView data={data} />}
        {active === "income" && <IncomeView data={data} />}
        {active === "programs" && <ProgramsView data={data} siteUrl={siteUrl} />}
        {active === "fundraising" && <FundraisingView data={data} />}
        {active === "snapshot" && <SnapshotView snapshot={buildSnapshot(data, credits)} />}
      </div>
    );
  }

  // The board and "See club finances": the Snapshot (totals only), and their
  // own balance as a parent on its own tab.
  if (club && tab !== "balance") {
    const db = createAdminClient();
    const board = await latestBoard(db);
    if (!board) return <Notice title="No season yet" body="Payments start once this season's roster is set up." />;
    const { data, credits } = await loadClubData(db, board);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PaymentsTabs tabs={["snapshot", "balance"]} active="snapshot" />
        <SnapshotView snapshot={buildSnapshot(data, credits)} />
      </div>
    );
  }
  const own = club ? <PaymentsTabs tabs={["snapshot", "balance"]} active="balance" /> : null;

  if (viewer.status !== "approved") {
    return <Notice title="Not available yet" body="You'll see your balance here once your account is approved." />;
  }
  const ids = await myPlayerIds(viewer.memberId);
  const data = await loadPaymentsData({ onlyPlayerIds: ids });
  if (!data || ids.length === 0) {
    return (
      <>
        {own}
        <Notice
          title="No players on your account"
          body="Your balance shows here when you're a parent on a player's registration. If that's you, sign in with the email you registered with."
        />
      </>
    );
  }
  if (!data.board.parent_balances_visible) {
    return (
      <>
        {own}
        <Notice
          title="Balances aren't ready yet"
          body="The Treasurer is still entering this season's payments. Your balance will show here soon."
        />
      </>
    );
  }
  // Due dates (0131), read on the server for just this family's players.
  const due = await loadDues(createAdminClient(), data.board.id, ids).catch(() => ({ dues: {}, defaultDue: null }));
  return (
    <>
      {own}
      <FamilyView data={data} dues={due.dues} defaultDue={due.defaultDue} />
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 420, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
