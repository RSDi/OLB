"use client";

import { useRouter } from "next/navigation";
import { NewInvoiceForm } from "invoicing/ui";
import type { EventCustomer, InvoiceEventOption } from "invoicing";
import { olbInvoicePaths } from "../../../../../lib/invoicing/paths";
import { createInvoiceAction } from "../../../../../lib/invoicing/actions";

export function NewInvoicePage({
  today,
  events,
  eventsError,
  customersByEvent,
  customersErrorByEvent,
}: {
  today: string;
  events: InvoiceEventOption[];
  eventsError: boolean;
  customersByEvent: Record<string, EventCustomer[]>;
  customersErrorByEvent: Record<string, boolean>;
}) {
  const router = useRouter();
  return (
    <NewInvoiceForm
      today={today}
      events={events}
      eventsError={eventsError}
      customersByEvent={customersByEvent}
      customersErrorByEvent={customersErrorByEvent}
      backHref={olbInvoicePaths.list}
      onCreate={async (input) => {
        const res = await createInvoiceAction(input);
        if (res.error) return res;
        if (res.id) router.push(olbInvoicePaths.detail(res.id));
        return {};
      }}
    />
  );
}
