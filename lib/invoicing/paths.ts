// Host routes for the invoicing module. Safe to import from client components.

export const olbInvoicePaths = {
  list: "/portal/payments?tab=invoices",
  detail: (id: string) => `/portal/payments/invoices/${id}`,
  event: (eventId: string) => `/portal/payments/invoices/event/${eventId}`,
  create: "/portal/payments/invoices/new",
  publicInvoice: (token: string) => `/invoice/${token}`,
  hostedChecklist: (eventId: string) => `/portal/schedule/hosted/${eventId}`,
};
