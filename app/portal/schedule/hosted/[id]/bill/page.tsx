import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { viewerHsScheduleAccess } from "../../../../../../lib/hs-schedule/viewer";
import { hostedEventCustomers } from "../../../../../../lib/invoicing/customers";
import { loadHostedBillContext } from "../../../../../../lib/invoicing/bill-context";
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
  if (access !== "edit" && !viewer.canManageInvoicing) redirect("/portal/schedule");
  const ctx = await loadHostedBillContext(id);
  if (!ctx) notFound();
  const customers = await hostedEventCustomers(id);
  const svc = createInvoicingService(olbInvoicingAdapter());
  const club = await svc.clubSettings();
  const org = await olbInvoicingAdapter().orgSettings();
  const today = churchToday();
  return (
    <BillPage
      weekendId={id}
      eventLabel={ctx.eventLabel}
      feeCents={ctx.feeCents}
      customers={customers}
      dueOn={addDays(today, 14)}
      depositDueOn={addDays(today, 7)}
      canInvoice={viewer.canManageInvoicing}
      clubSettings={club.ok ? club.data : { freq: "3d", startDays: 7, untilPaid: true, ccEmails: [], bccEmails: [] }}
      fromEmail={org.fromEmail}
    />
  );
}
