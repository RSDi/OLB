// Domain types for the invoicing module. Host entities (event, program, user)
// are referenced only as opaque string ids — never as foreign keys to host
// tables.

export type InvoiceStatus = "Draft" | "Sent" | "Viewed" | "Partial" | "Paid" | "Overdue";
export type PaymentMethod = "venmo" | "check";
export type ReminderFreq = "off" | "3d" | "weekly" | "2w";

export interface LineItemInput {
  description: string;
  qty: number;
  unitCents: number;
}

export interface LineItem extends LineItemInput {
  id: string;
  sortOrder: number;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  paidOn: string;
  reference: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  hostEventId: string | null;
  hostCustomerId: string | null;
  customerName: string;
  customerEmail: string | null;
  eventLabel: string | null;
  issuedOn: string | null;
  dueOn: string;
  depositCents: number;
  depositDueOn: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  publicToken: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lines: LineItem[];
  payments: Payment[];
}

export interface InvoiceTotals {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  depositPaid: boolean;
  status: InvoiceStatus;
  /** Amount the program should send now: remaining deposit, else remaining balance. */
  payNowCents: number;
}

export interface ReminderSettings {
  freq: ReminderFreq;
  startDays: number;
  untilPaid: boolean;
}

export const DEFAULT_REMINDERS: ReminderSettings = { freq: "3d", startDays: 7, untilPaid: true };

export interface EventCollection {
  eventId: string;
  billedCents: number;
  collectedCents: number;
  invoiceCount: number;
  sentCount: number;
  paidCount: number;
  depositPaidCount: number;
  teamCount: number;
  allSent: boolean;
  allCollected: boolean;
}

export interface EventCustomer {
  id: string;
  name: string;
  emails: string[];
  teamCount: number;
  divisions?: string;
}

export interface BatchCustomerInput {
  id: string;
  name: string;
  emails: string[];
  teamCount: number;
}

export interface BatchInput {
  eventId: string;
  eventLabel: string;
  feeCents: number;
  dueOn: string;
  depositOn: boolean;
  depositPerTeamCents: number;
  depositDueOn: string | null;
  lineDescription: string;
  customers: BatchCustomerInput[];
}

export interface CreateInvoiceInput {
  hostEventId?: string | null;
  hostCustomerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  eventLabel?: string | null;
  dueOn: string;
  depositCents?: number;
  depositDueOn?: string | null;
  lines: LineItemInput[];
}

export interface UpdateInvoiceInput {
  customerName?: string;
  customerEmail?: string | null;
  eventLabel?: string | null;
  dueOn?: string;
  depositCents?: number;
  depositDueOn?: string | null;
  lines?: LineItemInput[];
}

export interface RecordPaymentInput {
  method: PaymentMethod;
  amountCents: number;
  paidOn: string;
  reference?: string | null;
}

export interface InvoiceEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  kind: "invoice" | "reminder";
  invoiceId: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
