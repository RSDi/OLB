import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter, olbInvoicePaths } from "../../../../../../lib/invoicing/adapter";
import { churchToday } from "../../../../../../lib/dates/today";
import { EventInvoicesView } from "./EventInvoicesView";
import { createClient } from "../../../../../../lib/supabase/server";
import { loadHostedBillContext } from "../../../../../../lib/invoicing/bill-context";
import { hostedEventCustomers } from "../../../../../../lib/invoicing/customers";
import { formatMoney } from "invoicing";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canViewInvoices) redirect("/portal/payments");
  const { eventId } = await params;
  const svc = createInvoicingService(olbInvoicingAdapter());
  const res = await svc.eventSummary(eventId);
  if (!res.ok) {
    return (
      <div className="rsd-card" style={{ padding: 24 }}>
        {res.error}{" "}
        <Link href={olbInvoicePaths.list}>Back to invoices</Link>
      </div>
    );
  }
  const { invoices, summary } = res.data;
  const eventLabel = invoices[0]?.eventLabel || (await weekendName(eventId)) || "Event";
  const fee = invoices[0]?.lines[0]?.unitCents;
  const rateLabel = await hostedRateLabel(eventId);
  return (
    <EventInvoicesView
      eventLabel={eventLabel}
      invoices={invoices}
      summary={summary}
      today={churchToday()}
      feeCents={fee}
      depositDueOn={invoices[0]?.depositDueOn}
      balanceDueOn={invoices[0]?.dueOn}
      rateLabel={rateLabel}
      checklistHref={/^[0-9a-f-]{36}$/i.test(eventId) ? `/portal/schedule/hosted/${eventId}` : undefined}
    />
  );
}

// A hosted tournament bills by the game: "9 teams · 26 games at $105/game".
// It reads the same admin-loaded columns Bill programs does, and only after
// the viewer passed canViewInvoices above.
async function hostedRateLabel(id: string): Promise<string | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const ctx = await loadHostedBillContext(id);
  if (!ctx || ctx.feeCents == null) return undefined;
  const customers = (await hostedEventCustomers(id)).filter((c) => c.teamCount > 0);
  const teams = customers.reduce((n, c) => n + c.teamCount, 0);
  const games = customers.reduce((n, c) => n + (c.unitCount ?? 0), 0);
  return `${teams} ${teams === 1 ? "team" : "teams"} · ${games} games at ${formatMoney(ctx.feeCents)}/game`;
}

async function weekendName(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await createClient()).from("hs_weekends").select("event").eq("id", id).maybeSingle();
  return (data as { event: string } | null)?.event ?? null;
}
