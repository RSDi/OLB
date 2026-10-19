// Invoicing package entry. Implement InvoicingAdapter in the host and call
// createInvoicingService(adapter). UI lives at "invoicing/ui".

export * from "./adapter";
export * from "./types";
export * from "./logic";
export { createInvoicingService, type InvoicingService } from "./service";
export { invoiceEmailContent, reminderEmailContent } from "./emails";
export { listInvoices, loadInvoiceSettings, MIGRATION_HINT } from "./store";
