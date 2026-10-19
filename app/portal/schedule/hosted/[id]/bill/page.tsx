import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { createClient } from "../../../../../../lib/supabase/server";
import { viewerHsScheduleAccess } from "../../../../../../lib/hs-schedule/viewer";
import { loadHostedPage } from "../../../../../../lib/hosted/data";
import { hostedEventCustomers } from "../../../../../../lib/invoicing/customers";
import { olbInvoicingAdapter } from "../../../../../../lib/invoicing/adapter";
import { createInvoicingService } from "invoicing";
import { addDays } from "invoicing";
import { churchToday } from "../../../../../../lib/dates/today";
import { BillPage } from "./BillPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await viewerHsScheduleAccess(viewer);
  if (access !== "edit") redirect("/portal/schedule");
  const loaded = await loadHostedPage(await createClient(), id, {
    canViewFinances: viewer.canViewFinances,
    canManageFinances: viewer.canManageFinances,
    canManageInvoicing: viewer.canManageInvoicing,
  });
  if (loaded.kind !== "ok") notFound();
  const customers = await hostedEventCustomers(id);
  const svc = createInvoicingService(olbInvoicingAdapter());
  const rem = await svc.reminders();
  const org = await olbInvoicingAdapter().orgSettings();
  const today = churchToday();
  const eventLabel = loaded.data.plan.short_name || loaded.data.weekend.event || "Tournament";
  const fee = loaded.data.plan.team_fee_cents ?? 0;
  return (
    <BillPage
      weekendId={id}
      eventLabel={eventLabel}
      feeCents={fee}
      customers={customers}
      dueOn={addDays(today, 14)}
      depositDueOn={addDays(today, 7)}
      canInvoice={viewer.canManageInvoicing}
      reminders={rem.ok ? rem.data : { freq: "3d", startDays: 7, untilPaid: true }}
      fromEmail={org.fromEmail}
    />
  );
}
