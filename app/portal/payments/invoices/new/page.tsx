import { redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { loadNewInvoiceFormData } from "../../../../../lib/invoicing/events";
import { churchToday } from "../../../../../lib/dates/today";
import { NewInvoicePage } from "./NewInvoicePage";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageInvoicing) redirect(olbInvoicePaths.list);
  const data = await loadNewInvoiceFormData();
  return (
    <NewInvoicePage
      today={churchToday()}
      events={data.events}
      eventsError={data.eventsError}
      customersByEvent={data.customersByEvent}
      customersErrorByEvent={data.customersErrorByEvent}
    />
  );
}
