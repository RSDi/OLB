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
import { InvoicesView } from "./InvoicesView";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter } from "../../../lib/invoicing/adapter";
import { churchToday } from "../../../lib/dates/today";

const MANAGER_TABS: PaymentsTab[] = ["families", "budget", "income", "programs", "fundraising", "snapshot", "invoices"];

// Payments (migration 0101). Anyone with the Payments grant (the Treasurer;
// super-admins always) sees every family and records what comes in. A parent
// sees their own family's balance, once the Treasurer has turned that on.
//
// Club finances (0131), while it's on (or for the preview accounts): the
// Treasurer also gets Budget, Income, Programs, Fundraising and Snapshot, and
// the board and "See club finances" get the Snapshot.
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ family?: string; tab?: string; gmail?: string }> }) {
  // ?family=<player id>: open that player's family (from a player page).
  const { family, tab, gmail } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const club = (viewer.canManageFinances || viewer.canViewFinances) && (viewer.seesFullUi || (await financesEnabled()));

  if (viewer.canManageFinances) {
    const tabsForManager: PaymentsTab[] = club ? MANAGER_TABS : viewer.canViewInvoices ? ["families", "invoices"] : ["families"];
    const active = tabsForManager.includes(tab as PaymentsTab) ? (tab as PaymentsTab) : "families";
    const tabs = tabsForManager.length > 1 ? <PaymentsTabs tabs={tabsForManager} active={active} /> : null;
    if (active === "invoices") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
          {tabs}
          {await invoicesPanel(viewer.canManageInvoicing, gmail)}
        </div>
      );
    }
    if (active === "families") {
      const data = await loadPaymentsData();
      if (!data) return <Notice title="No season yet" body="Payments start once this season's roster is set up." />;
      // Match Venmo (0130): the preview accounts, and while the registration
      // workflow is on.
      const venmo = viewer.seesFullUi || (await workflowEnabled());
      const due = club ? await loadDues(createAdminClient(), data.board.id).catch(() => ({ dues: {}, defaultDue: null })) : { dues: {}, defaultDue: null };
      // Families off the weekly reminder (0133); none before it's applied.
      const paused = club ? await loadPaused(data.board.id) : [];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
          {tabs}
          <TreasurerView data={data} openPlayerId={family ?? null} venmo={venmo} club={club} dues={due.dues} defaultDue={due.defaultDue} paused={paused} />
        </div>
      );
    }
    const loaded = await loadClub();
    if ("notice" in loaded)
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
          {tabs}
          {loaded.notice}
        </div>
      );
    const { data, credits } = loaded;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://omahalightning.org").replace(/\/$/, "");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
        {tabs}
        {active === "budget" && <BudgetView data={data} />}
        {active === "income" && <IncomeView data={data} />}
        {active === "programs" && <ProgramsView data={data} siteUrl={siteUrl} />}
        {active === "fundraising" && <FundraisingView data={data} />}
        {active === "snapshot" && <SnapshotView snapshot={buildSnapshot(data, credits)} />}
      </div>
    );
  }

  // Invoices for the board / See club finances / invoicing, without Payments.
  const viewerTabs: PaymentsTab[] = [
    ...(club ? (["snapshot"] as const) : []),
    ...(viewer.canViewInvoices ? (["invoices"] as const) : []),
    "balance",
  ];
  const requested = tab as PaymentsTab | undefined;
  const viewerActive: PaymentsTab = viewerTabs.includes(requested as PaymentsTab)
    ? (requested as PaymentsTab)
    : viewer.canManageInvoicing && !club && viewerTabs.includes("invoices")
      ? "invoices"
      : club
        ? "snapshot"
        : "balance";
  if (viewerActive === "invoices") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
        <PaymentsTabs tabs={viewerTabs} active="invoices" />
        {await invoicesPanel(viewer.canManageInvoicing, gmail)}
      </div>
    );
  }

  // The board and "See club finances": the Snapshot (totals only), and their
  // own balance as a parent on its own tab.
  if (club && viewerActive === "snapshot") {
    const loaded = await loadClub();
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
        <PaymentsTabs tabs={viewerTabs} active="snapshot" />
        {"notice" in loaded ? loaded.notice : <SnapshotView snapshot={buildSnapshot(loaded.data, loaded.credits)} />}
      </div>
    );
  }
  const own = viewerTabs.length > 1 ? <PaymentsTabs tabs={viewerTabs} active="balance" /> : null;

  if (viewer.status !== "approved") {
    return <Notice title="Not available yet" body="You'll see your balance here once your account is approved." />;
  }
  const ids = await myPlayerIds(viewer.memberId);
  const data = await loadPaymentsData({ onlyPlayerIds: ids });
  if (!data || ids.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
        {own}
        <Notice
          title="No players on your account"
          body="Your balance shows here when you're a parent on a player's registration. If that's you, sign in with the email you registered with."
        />
      </div>
    );
  }
  if (!data.board.parent_balances_visible) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
        {own}
        <Notice
          title="Balances aren't ready yet"
          body="The Treasurer is still entering this season's payments. Your balance will show here soon."
        />
      </div>
    );
  }
  // Due dates (0131), read on the server for just this family's players.
  const due = await loadDues(createAdminClient(), data.board.id, ids).catch(() => ({ dues: {}, defaultDue: null }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
      {own}
      <FamilyView data={data} dues={due.dues} defaultDue={due.defaultDue} />
    </div>
  );
}

// The club's books for the season, or a notice saying why they didn't load,
// so the tabs and Families stay usable and the reason is on the screen.
async function loadClub(): Promise<Awaited<ReturnType<typeof loadClubData>> | { notice: React.ReactNode }> {
  try {
    const db = createAdminClient();
    const board = await latestBoard(db);
    if (!board) return { notice: <Notice title="No season yet" body="Payments start once this season's roster is set up." /> };
    return await loadClubData(db, board);
  } catch (e) {
    console.error("[payments] loading the club's books failed", e);
    const reason = e instanceof Error ? e.message : String(e);
    return {
      notice: (
        <Notice
          title="This tab didn't load"
          body={`${reason}. Reload to try again; if it keeps happening, send this message to whoever looks after the site.`}
        />
      ),
    };
  }
}

async function invoicesPanel(canInvoice: boolean, gmailOutcome?: string) {
  const res = await createInvoicingService(olbInvoicingAdapter()).list();
  if (!res.ok) return <Notice title="Invoices aren't ready yet" body={res.error} />;
  return <InvoicesView invoices={res.data} today={churchToday()} canInvoice={canInvoice} gmailOutcome={gmailOutcome} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 420, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

async function loadPaused(boardId: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from("olb_reminder_pauses").select("player_id").eq("board_id", boardId);
  return error ? [] : ((data as { player_id: string }[] | null) ?? []).map((r) => r.player_id);
}
