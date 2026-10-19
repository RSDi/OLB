import { redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { listInvoiceEvents } from "../../../../../lib/invoicing/events";
import { churchToday } from "../../../../../lib/dates/today";
import { NewInvoicePage } from "./NewInvoicePage";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageInvoicing) redirect(olbInvoicePaths.list);
  return <NewInvoicePage today={churchToday()} events={await listInvoiceEvents()} />;
}
