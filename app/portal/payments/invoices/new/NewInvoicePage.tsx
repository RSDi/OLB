"use client";

import { useRouter } from "next/navigation";
import { NewInvoiceForm } from "invoicing/ui";
import type { InvoiceEventOption } from "invoicing";
import { olbInvoicePaths } from "../../../../../lib/invoicing/paths";
import { createInvoiceAction, listInvoiceEventCustomersAction } from "../../../../../lib/invoicing/actions";

export function NewInvoicePage({ today, events }: { today: string; events: InvoiceEventOption[] }) {
  const router = useRouter();
  return (
    <NewInvoiceForm
      today={today}
      events={events}
      backHref={olbInvoicePaths.list}
      loadCustomers={listInvoiceEventCustomersAction}
      onCreate={async (input) => {
        const res = await createInvoiceAction(input);
        if (res.error) return res;
        if (res.id) router.push(olbInvoicePaths.detail(res.id));
        return {};
      }}
    />
  );
}
