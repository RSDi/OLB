import { redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { listInvoiceEvents } from "../../../../../lib/invoicing/events";
import { hostedEventCustomers } from "../../../../../lib/invoicing/customers";
import { churchToday } from "../../../../../lib/dates/today";
import type { EventCustomer } from "invoicing";
import { NewInvoicePage } from "./NewInvoicePage";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageInvoicing) redirect(olbInvoicePaths.list);
  const events = await listInvoiceEvents();
  const customersByEvent: Record<string, EventCustomer[]> = {};
  await Promise.all(
    events.map(async (event) => {
      try {
        customersByEvent[event.id] = await hostedEventCustomers(event.id);
      } catch {
        customersByEvent[event.id] = [];
      }
    })
  );
  return <NewInvoicePage today={churchToday()} events={events} customersByEvent={customersByEvent} />;
}
