// Pure invoicing math: totals, status, event collection, reminder cadence.
// No I/O, no adapter, no host imports.

import {
  DEFAULT_REMINDERS,
  type EventCollection,
  type Invoice,
  type InvoiceStatus,
  type InvoiceTotals,
  type LineItemInput,
  type ReminderFreq,
  type ReminderSettings,
} from "./types.ts"; // explicit extension so node --test can load this file

export function lineAmount(line: LineItemInput): number {
  return Math.max(0, Math.round(line.qty) * Math.max(0, Math.round(line.unitCents)));
}

export function invoiceTotal(invoice: Pick<Invoice, "lines">): number {
  return invoice.lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

export function invoicePaid(invoice: Pick<Invoice, "payments">): number {
  return invoice.payments.reduce((sum, p) => sum + Math.max(0, p.amountCents), 0);
}

export function invoiceBalance(invoice: Pick<Invoice, "lines" | "payments">): number {
  return Math.max(0, invoiceTotal(invoice) - invoicePaid(invoice));
}

export function depositPaid(invoice: Pick<Invoice, "depositCents" | "payments">): boolean {
  return invoice.depositCents > 0 && invoicePaid(invoice) >= invoice.depositCents;
}

export function payNowCents(invoice: Pick<Invoice, "lines" | "payments" | "depositCents">): number {
  const paid = invoicePaid(invoice);
  const balance = Math.max(0, invoiceTotal(invoice) - paid);
  if (invoice.depositCents > 0 && paid < invoice.depositCents) {
    return Math.min(invoice.depositCents - paid, balance);
  }
  return balance;
}

export function invoiceStatus(invoice: Pick<Invoice, "sentAt" | "viewedAt" | "lines" | "payments" | "depositCents" | "depositDueOn" | "dueOn">, today: string): InvoiceStatus {
  if (!invoice.sentAt) return "Draft";
  const total = invoiceTotal(invoice);
  const paid = invoicePaid(invoice);
  if (total > 0 && paid >= total) return "Paid";
  const depositOverdue = invoice.depositCents > 0 && paid < invoice.depositCents && !!invoice.depositDueOn && invoice.depositDueOn < today;
  const balanceOverdue = invoice.dueOn < today;
  if (depositOverdue || balanceOverdue) return "Overdue";
  if (paid > 0) return "Partial";
  if (invoice.viewedAt) return "Viewed";
  return "Sent";
}

export function computeInvoice(invoice: Invoice, today: string): InvoiceTotals {
  const totalCents = invoiceTotal(invoice);
  const paidCents = invoicePaid(invoice);
  const balanceCents = Math.max(0, totalCents - paidCents);
  return {
    totalCents,
    paidCents,
    balanceCents,
    depositPaid: depositPaid(invoice),
    status: invoiceStatus(invoice, today),
    payNowCents: payNowCents(invoice),
  };
}

export function eventCollection(eventId: string, invoices: Invoice[], expectedCount?: number): EventCollection {
  const billedCents = invoices.reduce((s, v) => s + invoiceTotal(v), 0);
  const collectedCents = invoices.reduce((s, v) => s + invoicePaid(v), 0);
  const sentCount = invoices.filter((v) => !!v.sentAt).length;
  const paidCount = invoices.filter((v) => invoiceTotal(v) > 0 && invoicePaid(v) >= invoiceTotal(v)).length;
  const depositPaidCount = invoices.filter((v) => depositPaid(v)).length;
  const teamCount = invoices.reduce((s, v) => s + v.lines.reduce((n, l) => n + Math.max(0, l.qty), 0), 0);
  const target = expectedCount ?? invoices.length;
  const allSent = target > 0 && sentCount >= target && invoices.length >= target;
  const allCollected = invoices.length > 0 && billedCents > 0 && collectedCents >= billedCents && paidCount === invoices.length;
  return {
    eventId,
    billedCents,
    collectedCents,
    invoiceCount: invoices.length,
    sentCount,
    paidCount,
    depositPaidCount,
    teamCount,
    allSent,
    allCollected,
  };
}

/** "Team fees collected" for an event: every invoice paid in full. */
export function teamFeesCollected(invoices: Invoice[]): { collectedCents: number; billedCents: number; done: boolean; nOfX: string } {
  const billedCents = invoices.reduce((s, v) => s + invoiceTotal(v), 0);
  const collectedCents = invoices.reduce((s, v) => s + invoicePaid(v), 0);
  const done = invoices.length > 0 && billedCents > 0 && collectedCents >= billedCents;
  return {
    collectedCents,
    billedCents,
    done,
    nOfX: `${collectedCents} of ${billedCents}`,
  };
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function reminderTargetDue(invoice: Pick<Invoice, "depositCents" | "depositDueOn" | "dueOn" | "payments">): string {
  if (invoice.depositCents > 0 && !depositPaid(invoice) && invoice.depositDueOn) return invoice.depositDueOn;
  return invoice.dueOn;
}

export function reminderIntervalDays(freq: ReminderFreq): number | null {
  if (freq === "3d") return 3;
  if (freq === "weekly") return 7;
  if (freq === "2w") return 14;
  return null;
}

export function reminderCopy(settings: ReminderSettings, dueOn: string, fromEmail: string): string {
  if (settings.freq === "off") return "Reminders are off.";
  const freq = { "3d": "every 3 days", weekly: "weekly", "2w": "every 2 weeks" }[settings.freq];
  const start = addDays(dueOn, -settings.startDays);
  const stop = settings.untilPaid ? "until paid" : "3 times";
  return `Starts ${formatDay(start)} (${settings.startDays} days before ${formatDay(dueOn)}), then ${freq} ${stop}. Sent from ${fromEmail}. Covers the deposit first, then the balance.`;
}

export function shouldSendReminder(opts: {
  invoice: Pick<Invoice, "sentAt" | "lines" | "payments" | "depositCents" | "depositDueOn" | "dueOn">;
  settings: ReminderSettings;
  today: string;
  priorSendDates: string[];
}): boolean {
  const { invoice, settings, today, priorSendDates } = opts;
  if (settings.freq === "off") return false;
  if (!invoice.sentAt) return false;
  if (invoiceBalance(invoice) <= 0) return false;
  const interval = reminderIntervalDays(settings.freq);
  if (interval == null) return false;
  const due = reminderTargetDue(invoice);
  const start = addDays(due, -settings.startDays);
  if (today < start) return false;
  if (!settings.untilPaid && priorSendDates.length >= 3) return false;
  if (priorSendDates.length === 0) return true;
  const last = [...priorSendDates].sort().at(-1)!;
  return addDays(last, interval) <= today;
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = rem === 0 ? dollars.toLocaleString("en-US") : `${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
  return `${sign}$${body}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export function normalizeReminders(raw: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  const freq: ReminderFreq = raw?.freq === "off" || raw?.freq === "weekly" || raw?.freq === "2w" || raw?.freq === "3d" ? raw.freq : DEFAULT_REMINDERS.freq;
  const startDays = [3, 5, 7, 14].includes(raw?.startDays ?? -1) ? (raw!.startDays as number) : DEFAULT_REMINDERS.startDays;
  return { freq, startDays, untilPaid: raw?.untilPaid !== false };
}

export function parseDollars(input: string): number | null {
  const n = Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const STATUS_FILTERS: InvoiceStatus[] = ["Draft", "Sent", "Viewed", "Partial", "Paid", "Overdue"];
