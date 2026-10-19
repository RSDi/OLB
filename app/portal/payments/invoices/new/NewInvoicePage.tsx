"use client";

import { useRouter } from "next/navigation";
import { NewInvoiceForm } from "invoicing/ui";
import { olbInvoicePaths } from "../../../../../lib/invoicing/paths";
import { createInvoiceAction } from "../../../../../lib/invoicing/actions";

export function NewInvoicePage({ today }: { today: string }) {
  const router = useRouter();
  return (
    <NewInvoiceForm
      today={today}
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
