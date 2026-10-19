import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter, olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { churchToday } from "../../../../../lib/dates/today";
import { gmailBannerKind, type GmailBannerKind } from "../../../../../lib/invoicing/gmail-meta";
import { invoiceGmailLive } from "../../../../../lib/invoicing/gmail-oauth";
import { getGmailConnection } from "../../../../../lib/invoicing/gmail-settings";
import { InvoicePage } from "./InvoicePage";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canViewInvoices) redirect("/portal/payments");
  const { id } = await params;
  const { from } = await searchParams;
  const svc = createInvoicingService(olbInvoicingAdapter());
  const [got, club, org] = await Promise.all([svc.get(id), svc.clubSettings(), olbInvoicingAdapter().orgSettings()]);
  if (!got.ok) notFound();
  const backHref = from === "event" && got.data.hostEventId ? olbInvoicePaths.event(got.data.hostEventId) : olbInvoicePaths.list;
  const backLabel = from === "event" && got.data.eventLabel ? got.data.eventLabel : "Invoices";
  const clubSettings = club.ok ? club.data : { freq: "3d" as const, startDays: 7, untilPaid: true, ccEmails: [], bccEmails: [] };
  let gmailBanner: GmailBannerKind | null = null;
  if (viewer.canManageInvoicing && invoiceGmailLive()) {
    try {
      gmailBanner = gmailBannerKind(await getGmailConnection());
    } catch {
      gmailBanner = null;
    }
  }
  return (
    <InvoicePage
      invoice={got.data}
      today={churchToday()}
      canInvoice={viewer.canManageInvoicing}
      org={org}
      clubSettings={clubSettings}
      fromEmail={org.fromEmail}
      backHref={backHref}
      backLabel={backLabel}
      gmailBanner={gmailBanner}
    />
  );
}
