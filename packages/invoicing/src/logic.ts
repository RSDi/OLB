// Pure invoicing math: totals, status, event collection, reminder cadence.
// No I/O, no adapter, no host imports.

import {
  DEFAULT_CLUB_SETTINGS,
  DEFAULT_REMINDERS,
  type EventCollection,
  type Invoice,
  type InvoiceClubSettings,
  type InvoiceStatus,
  type InvoiceTotals,
  type LineItemInput,
  type ReminderFreq,
  type ReminderSettings,
  type Result,
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

/** Paid in full, including a $0 invoice. Voided invoices are not paid. */
export function invoiceFullyPaid(invoice: Pick<Invoice, "lines" | "payments" | "voidedAt">): boolean {
  if (invoice.voidedAt) return false;
  return invoicePaid(invoice) >= invoiceTotal(invoice);
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

export function clampDeposit(depositCents: number, totalCents: number): number {
  return Math.max(0, Math.min(Math.round(depositCents), Math.max(0, Math.round(totalCents))));
}

export function invoiceStatus(
  invoice: Pick<Invoice, "sentAt" | "viewedAt" | "voidedAt" | "lines" | "payments" | "depositCents" | "depositDueOn" | "dueOn">,
  today: string
): InvoiceStatus {
  if (invoice.voidedAt) return "Void";
  if (!invoice.sentAt) return "Draft";
  const total = invoiceTotal(invoice);
  const paid = invoicePaid(invoice);
  if (paid >= total) return "Paid";
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

function activeInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter((v) => !v.voidedAt);
}

export function eventCollection(eventId: string, invoices: Invoice[], expectedCount?: number): EventCollection {
  const active = activeInvoices(invoices);
  const sent = active.filter((v) => !!v.sentAt);
  const billedCents = sent.reduce((s, v) => s + invoiceTotal(v), 0);
  const collectedCents = sent.reduce((s, v) => s + invoicePaid(v), 0);
  const sentCount = sent.length;
  const paidCount = sent.filter((v) => invoiceFullyPaid(v)).length;
  const withDeposit = sent.filter((v) => v.depositCents > 0);
  const depositPaidCount = withDeposit.filter((v) => depositPaid(v)).length;
  const teamCount = sent.reduce((s, v) => s + v.lines.reduce((n, l) => n + Math.max(0, l.qty), 0), 0);
  const target = expectedCount ?? active.length;
  const allSent = target > 0 && sentCount >= target;
  const collectedCapped = sent.reduce((s, v) => s + Math.min(invoicePaid(v), invoiceTotal(v)), 0);
  const allCollected =
    target > 0 && sentCount >= target && paidCount >= target && sent.every((v) => invoiceFullyPaid(v)) && collectedCapped >= billedCents;
  return {
    eventId,
    billedCents,
    collectedCents,
    invoiceCount: active.length,
    sentCount,
    paidCount,
    depositPaidCount,
    depositInvoiceCount: withDeposit.length,
    teamCount,
    allSent,
    allCollected,
  };
}

/** Sent, non-voided invoice for this program — createBatch skips these. */
export function invoiceAlreadyBilled(
  invoices: Pick<Invoice, "hostCustomerId" | "sentAt" | "voidedAt">[],
  customerId: string
): boolean {
  return invoices.some((v) => v.hostCustomerId === customerId && !!v.sentAt && !v.voidedAt);
}

/** Same eligibility createBatch uses after looking up the host customer. */
export function batchCustomerEligible(
  customer: { id: string; teamCount: number },
  invoices: Pick<Invoice, "hostCustomerId" | "sentAt" | "voidedAt">[] = []
): boolean {
  return customer.teamCount > 0 && !invoiceAlreadyBilled(invoices, customer.id);
}

/** Preview totals for batch billing. Same programs createBatch will bill. */
export function batchPreviewTotals(
  customers: { id: string; teamCount: number }[],
  feeCents: number,
  depositPerTeamCents = 0,
  invoices: Pick<Invoice, "hostCustomerId" | "sentAt" | "voidedAt">[] = []
): { invoiceCount: number; teamCount: number; totalCents: number; depositCents: number; alreadyBilledCount: number } {
  const rows = customers.filter((c) => batchCustomerEligible(c, invoices));
  const alreadyBilledCount = customers.filter((c) => c.teamCount > 0 && invoiceAlreadyBilled(invoices, c.id)).length;
  const teams = rows.reduce((s, c) => s + Math.max(0, c.teamCount), 0);
  const fee = Math.max(0, Math.round(feeCents));
  const dep = Math.max(0, Math.round(depositPerTeamCents));
  return {
    invoiceCount: rows.length,
    teamCount: teams,
    totalCents: teams * fee,
    depositCents: teams * dep,
    alreadyBilledCount,
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

export function effectiveReminders(
  invoice: Pick<Invoice, "reminderFreq" | "reminderStartDays" | "reminderUntilPaid">,
  club: ReminderSettings
): ReminderSettings {
  if (invoice.reminderFreq == null && invoice.reminderStartDays == null && invoice.reminderUntilPaid == null) return club;
  return normalizeReminders({
    freq: invoice.reminderFreq ?? club.freq,
    startDays: invoice.reminderStartDays ?? club.startDays,
    untilPaid: invoice.reminderUntilPaid ?? club.untilPaid,
  });
}

export function effectiveMailCopies(
  invoice: Pick<Invoice, "ccEmails" | "bccEmails">,
  club: Pick<InvoiceClubSettings, "ccEmails" | "bccEmails">
): { cc: string[]; bcc: string[] } {
  return {
    cc: invoice.ccEmails ?? club.ccEmails,
    bcc: invoice.bccEmails ?? club.bccEmails,
  };
}

export function shouldSendReminder(opts: {
  invoice: Pick<Invoice, "sentAt" | "voidedAt" | "lines" | "payments" | "depositCents" | "depositDueOn" | "dueOn" | "reminderFreq" | "reminderStartDays" | "reminderUntilPaid">;
  settings: ReminderSettings;
  today: string;
  priorSendDates: string[];
}): boolean {
  const { invoice, today, priorSendDates } = opts;
  if (invoice.voidedAt) return false;
  const settings = effectiveReminders(invoice, opts.settings);
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(raw: string | string[] | null | undefined): Result<string[]> {
  const parts = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.filter((e) => !EMAIL.test(e));
  if (bad.length) {
    return { ok: false, error: `Check ${bad.length === 1 ? "this email" : "these emails"}: ${bad.join(", ")}` };
  }
  const seen = new Set<string>();
  const data: string[] = [];
  for (const e of parts) {
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    data.push(e);
  }
  if (data.length > 20) {
    return { ok: false, error: "You can list up to 20 addresses." };
  }
  return { ok: true, data };
}

export function normalizeClubSettings(raw: Partial<InvoiceClubSettings> | null | undefined): InvoiceClubSettings {
  const reminders = normalizeReminders(raw);
  const cc = parseEmailList(raw?.ccEmails ?? []);
  const bcc = parseEmailList(raw?.bccEmails ?? []);
  return {
    ...reminders,
    ccEmails: cc.ok ? cc.data : DEFAULT_CLUB_SETTINGS.ccEmails,
    bccEmails: bcc.ok ? bcc.data : DEFAULT_CLUB_SETTINGS.bccEmails,
  };
}

export function parseDollars(input: string): number | null {
  const n = Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const STATUS_FILTERS: InvoiceStatus[] = ["Draft", "Sent", "Viewed", "Partial", "Paid", "Overdue", "Void"];
