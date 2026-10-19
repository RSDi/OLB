import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter, olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { churchToday } from "../../../../../lib/dates/today";
import { InvoicePage } from "./InvoicePage";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canViewInvoices) redirect("/portal/payments");
  const { id } = await params;
  const { from } = await searchParams;
  const svc = createInvoicingService(olbInvoicingAdapter());
  const [got, rem, org] = await Promise.all([svc.get(id), svc.reminders(), olbInvoicingAdapter().orgSettings()]);
  if (!got.ok) notFound();
  const backHref = from === "event" && got.data.hostEventId ? olbInvoicePaths.event(got.data.hostEventId) : olbInvoicePaths.list;
  const backLabel = from === "event" && got.data.eventLabel ? got.data.eventLabel : "Invoices";
  return (
    <InvoicePage
      invoice={got.data}
      today={churchToday()}
      canInvoice={viewer.canManageInvoicing}
      org={org}
      reminders={rem.ok ? rem.data : { freq: "3d", startDays: 7, untilPaid: true }}
      fromEmail={org.fromEmail}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
