import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { createClient } from "../../../../../lib/supabase/server";
import { churchToday } from "../../../../../lib/dates/today";
import { viewerHsScheduleAccess } from "../../../../../lib/hs-schedule/viewer";
import { loadHostedPage } from "../../../../../lib/hosted/data";
import { HostedView, type HostedTab } from "./_components/HostedView";
import { StartHosting } from "./_components/StartHosting";

const TABS: HostedTab[] = ["plan", "teams", "schedule", "brackets", "money", "messages"];

// A tournament we host (0150): /portal/schedule/hosted/<weekend id>, the
// planning page for a weekend on the HS Schedule ticked "We host this
// tournament". The HS Schedule's planners (the board and the coaches) use
// it; ?tab= picks Checklist, Teams, Schedule, Brackets, Money or Email.
export default async function HostedTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { id } = await params;
  const { tab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await viewerHsScheduleAccess(viewer);
  if (access !== "edit") {
    return (
      <Note title="Tournament planning is for coaches and the board">
        It&apos;s planned from the HS Schedule. If you help run the tournament and can&apos;t see it, ask the board.
      </Note>
    );
  }
  const supabase = await createClient();
  const loaded = await loadHostedPage(supabase, id, {
    canViewFinances: viewer.canViewFinances,
    canManageFinances: viewer.canManageFinances,
    canManageInvoicing: viewer.canManageInvoicing,
  });
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "migration") {
    return (
      <Note title="Tournament planning isn't set up in the database yet">
        Apply <code>supabase/migrations/0150_hosted_tournaments.sql</code> in the Supabase SQL editor (it runs by itself when
        merged to main).
      </Note>
    );
  }
  if (loaded.kind === "not_hosted") return <StartHosting weekend={loaded.weekend} />;
  const active = TABS.includes(tab as HostedTab) ? (tab as HostedTab) : "plan";
  return <HostedView data={loaded.data} tab={active} today={churchToday()} />;
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rsd-card" style={{ padding: "32px 24px", gap: 8, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>{children}</div>
      <div style={{ marginTop: 8 }}>
        <Link href="/portal/schedule" style={{ fontSize: 13, fontWeight: 700 }}>
          Back to the HS Schedule
        </Link>
      </div>
    </div>
  );
}
