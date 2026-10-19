import { notFound } from "next/navigation";
import { createInvoicingService } from "invoicing";
import { PublicInvoice } from "invoicing/ui";
import { olbInvoicingAdapter } from "../../../lib/invoicing/adapter";
import { churchToday } from "../../../lib/dates/today";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const adapter = olbInvoicingAdapter();
  const got = await createInvoicingService(adapter).getPublic(token);
  if (!got.ok) notFound();
  const org = await adapter.orgSettings();
  return (
    <main style={{ minHeight: "100vh", background: "var(--gw-bg, #f3f3ef)" }}>
      <PublicInvoice invoice={got.data} today={churchToday()} org={org} brandingName={adapter.branding().orgName} />
    </main>
  );
}
