// Persistence for inv_* tables. Host supplies a Supabase client; this module
// never names host tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, LineItemInput, Payment, PaymentMethod, ReminderSettings } from "./types";
import { DEFAULT_REMINDERS, normalizeReminders } from "./logic";

type Db = SupabaseClient;

interface InvoiceRow {
  id: string;
  number: string;
  host_event_id: string | null;
  host_customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  event_label: string | null;
  issued_on: string | null;
  due_on: string;
  deposit_cents: number;
  deposit_due_on: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  public_token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface LineRow {
  id: string;
  invoice_id: string;
  description: string;
  qty: number;
  unit_cents: number;
  sort_order: number;
}

interface PayRow {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  amount_cents: number;
  paid_on: string;
  reference: string | null;
  recorded_by: string | null;
  created_at: string;
}

function mapInvoice(row: InvoiceRow, lines: LineRow[], pays: PayRow[]): Invoice {
  const mine = lines.filter((l) => l.invoice_id === row.id).sort((a, b) => a.sort_order - b.sort_order);
  const payments = pays
    .filter((p) => p.invoice_id === row.id)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));
  return {
    id: row.id,
    number: row.number,
    hostEventId: row.host_event_id,
    hostCustomerId: row.host_customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    eventLabel: row.event_label,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    depositCents: row.deposit_cents,
    depositDueOn: row.deposit_due_on,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    publicToken: row.public_token,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: mine.map((l) => ({
      id: l.id,
      description: l.description,
      qty: l.qty,
      unitCents: l.unit_cents,
      sortOrder: l.sort_order,
    })),
    payments: payments.map(
      (p): Payment => ({
        id: p.id,
        method: p.method,
        amountCents: p.amount_cents,
        paidOn: p.paid_on,
        reference: p.reference,
        recordedBy: p.recorded_by,
        createdAt: p.created_at,
      })
    ),
  };
}

async function loadRelated(db: Db, ids: string[]): Promise<{ lines: LineRow[]; pays: PayRow[] }> {
  if (ids.length === 0) return { lines: [], pays: [] };
  const [{ data: lines }, { data: pays }] = await Promise.all([
    db.from("inv_line_items").select("id, invoice_id, description, qty, unit_cents, sort_order").in("invoice_id", ids),
    db.from("inv_payments").select("id, invoice_id, method, amount_cents, paid_on, reference, recorded_by, created_at").in("invoice_id", ids),
  ]);
  return { lines: (lines as LineRow[] | null) ?? [], pays: (pays as PayRow[] | null) ?? [] };
}

export async function listInvoices(db: Db, eventId?: string): Promise<Invoice[]> {
  let q = db.from("inv_invoices").select("*").order("created_at", { ascending: false });
  if (eventId) q = q.eq("host_event_id", eventId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data as InvoiceRow[] | null) ?? [];
  const { lines, pays } = await loadRelated(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((r) => mapInvoice(r, lines, pays));
}

export async function getInvoice(db: Db, id: string): Promise<Invoice | null> {
  const { data, error } = await db.from("inv_invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as InvoiceRow;
  const { lines, pays } = await loadRelated(db, [row.id]);
  return mapInvoice(row, lines, pays);
}

export async function getInvoiceByToken(db: Db, token: string): Promise<Invoice | null> {
  const { data, error } = await db.from("inv_invoices").select("*").eq("public_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as InvoiceRow;
  const { lines, pays } = await loadRelated(db, [row.id]);
  return mapInvoice(row, lines, pays);
}

export async function nextInvoiceNumber(db: Db, year: number): Promise<string> {
  const { data, error } = await db.rpc("inv_next_number", { p_year: year });
  if (!error && typeof data === "string" && data) return data;
  const { data: rows } = await db.from("inv_invoices").select("number").like("number", `INV-${year}-%`);
  const max = ((rows as { number: string }[] | null) ?? []).reduce((n, r) => {
    const m = r.number.match(/INV-\d+-(\d+)/);
    return m ? Math.max(n, Number(m[1])) : n;
  }, 0);
  return `INV-${year}-${String(max + 1).padStart(4, "0")}`;
}

export async function insertInvoice(
  db: Db,
  input: {
    number: string;
    hostEventId: string | null;
    hostCustomerId: string | null;
    customerName: string;
    customerEmail: string | null;
    eventLabel: string | null;
    dueOn: string;
    depositCents: number;
    depositDueOn: string | null;
    createdBy: string | null;
    lines: LineItemInput[];
  }
): Promise<Invoice> {
  const { data, error } = await db
    .from("inv_invoices")
    .insert({
      number: input.number,
      host_event_id: input.hostEventId,
      host_customer_id: input.hostCustomerId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      event_label: input.eventLabel,
      due_on: input.dueOn,
      deposit_cents: input.depositCents,
      deposit_due_on: input.depositDueOn,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const row = data as InvoiceRow;
  if (input.lines.length) {
    const { error: lineErr } = await db.from("inv_line_items").insert(
      input.lines.map((l, i) => ({
        invoice_id: row.id,
        description: l.description.slice(0, 200),
        qty: Math.max(0, Math.round(l.qty)),
        unit_cents: Math.max(0, Math.round(l.unitCents)),
        sort_order: i,
      }))
    );
    if (lineErr) throw new Error(lineErr.message);
  }
  return (await getInvoice(db, row.id))!;
}

export async function replaceLines(db: Db, invoiceId: string, lines: LineItemInput[]): Promise<void> {
  const { error: del } = await db.from("inv_line_items").delete().eq("invoice_id", invoiceId);
  if (del) throw new Error(del.message);
  if (!lines.length) return;
  const { error } = await db.from("inv_line_items").insert(
    lines.map((l, i) => ({
      invoice_id: invoiceId,
      description: l.description.slice(0, 200),
      qty: Math.max(0, Math.round(l.qty)),
      unit_cents: Math.max(0, Math.round(l.unitCents)),
      sort_order: i,
    }))
  );
  if (error) throw new Error(error.message);
}

export async function updateInvoiceRow(
  db: Db,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from("inv_invoices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function insertPayment(
  db: Db,
  invoiceId: string,
  input: { method: PaymentMethod; amountCents: number; paidOn: string; reference: string | null; recordedBy: string | null }
): Promise<void> {
  const { error } = await db.from("inv_payments").insert({
    invoice_id: invoiceId,
    method: input.method,
    amount_cents: input.amountCents,
    paid_on: input.paidOn,
    reference: input.reference,
    recorded_by: input.recordedBy,
  });
  if (error) throw new Error(error.message);
}

export async function loadReminderSettings(db: Db): Promise<ReminderSettings> {
  const { data, error } = await db.from("inv_reminder_settings").select("freq, start_days, until_paid").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_REMINDERS;
  const row = data as { freq: string; start_days: number; until_paid: boolean };
  return normalizeReminders({ freq: row.freq as ReminderSettings["freq"], startDays: row.start_days, untilPaid: row.until_paid });
}

export async function saveReminderSettingsRow(db: Db, settings: ReminderSettings, updatedBy: string | null): Promise<void> {
  const { error } = await db.from("inv_reminder_settings").upsert({
    id: 1,
    freq: settings.freq,
    start_days: settings.startDays,
    until_paid: settings.untilPaid,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function reminderSendDates(db: Db, invoiceId: string): Promise<string[]> {
  const { data, error } = await db.from("inv_reminder_sends").select("sent_on").eq("invoice_id", invoiceId).eq("status", "sent");
  if (error) return [];
  return ((data as { sent_on: string }[] | null) ?? []).map((r) => r.sent_on);
}

export async function claimReminderSend(db: Db, invoiceId: string, sentOn: string): Promise<string | null> {
  const { data, error } = await db
    .from("inv_reminder_sends")
    .insert({ invoice_id: invoiceId, sent_on: sentOn, status: "sending" })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

export async function finishReminderSend(db: Db, id: string, ok: boolean, err?: string): Promise<void> {
  await db
    .from("inv_reminder_sends")
    .update({ status: ok ? "sent" : "failed", error: ok ? null : (err ?? "not sent").slice(0, 500) })
    .eq("id", id);
}

export const MIGRATION_HINT = "Invoicing isn't set up in the database yet (apply packages/invoicing/migrations, then the host's 0152).";
