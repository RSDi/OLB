import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter, olbInvoicePaths } from "../../../../../../lib/invoicing/adapter";
import { churchToday } from "../../../../../../lib/dates/today";
import { EventInvoices } from "invoicing/ui";
import { createClient } from "../../../../../../lib/supabase/server";

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
  return (
    <EventInvoices
      eventLabel={eventLabel}
      invoices={invoices}
      summary={summary}
      today={churchToday()}
      feeCents={fee}
      depositDueOn={invoices[0]?.depositDueOn}
      balanceDueOn={invoices[0]?.dueOn}
      checklistHref={/^[0-9a-f-]{36}$/i.test(eventId) ? `/portal/schedule/hosted/${eventId}` : undefined}
      paths={olbInvoicePaths}
    />
  );
}

async function weekendName(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await createClient()).from("hs_weekends").select("event").eq("id", id).maybeSingle();
  return (data as { event: string } | null)?.event ?? null;
}
