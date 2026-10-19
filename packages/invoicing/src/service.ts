// Host-facing operations. Every mutation checks canInvoice() on the adapter.

import type { InvoicingAdapter } from "./adapter";
import { invoiceEmailContent, reminderEmailContent } from "./emails";
import { computeInvoice, eventCollection, invoiceBalance, normalizeReminders, shouldSendReminder } from "./logic";
import {
  claimReminderSend,
  finishReminderSend,
  getInvoice,
  getInvoiceByToken,
  insertInvoice,
  insertPayment,
  listInvoices,
  loadReminderSettings,
  MIGRATION_HINT,
  nextInvoiceNumber,
  reminderSendDates,
  replaceLines,
  saveReminderSettingsRow,
  updateInvoiceRow,
} from "./store";
import type {
  BatchInput,
  CreateInvoiceInput,
  EventCollection,
  Invoice,
  RecordPaymentInput,
  ReminderSettings,
  Result,
  UpdateInvoiceInput,
} from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function migrationError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/inv_invoices|schema cache|does not exist/i.test(msg)) return MIGRATION_HINT;
  return msg;
}

export function createInvoicingService(adapter: InvoicingAdapter) {
  async function requireInvoicePermission(): Promise<Result<{ userId: string | null }>> {
    if (!(await adapter.canInvoice())) return fail("Requires invoicing permission");
    const user = await adapter.getCurrentUser();
    return { ok: true, data: { userId: user?.id ?? null } };
  }

  async function requireView(): Promise<Result<true>> {
    if (await adapter.canViewInvoices()) return { ok: true, data: true };
    return fail("You don't have permission to view invoices.");
  }

  async function notifyEvent(eventId: string | null | undefined) {
    if (!eventId || !adapter.onEventCollectionChanged) return;
    try {
      const invoices = await listInvoices(adapter.getAdminClient(), eventId);
      const expected = (await adapter.listEventCustomers(eventId)).filter((c) => c.teamCount > 0).length;
      await adapter.onEventCollectionChanged(eventCollection(eventId, invoices, expected || undefined));
    } catch (e) {
      console.error("[invoicing] onEventCollectionChanged failed", e);
    }
  }

  async function sendFor(invoice: Invoice, kind: "invoice" | "reminder"): Promise<Result<Invoice>> {
    const org = await adapter.orgSettings();
    const today = adapter.today();
    const url = `${adapter.publicBaseUrl().replace(/\/$/, "")}${adapter.paths.publicInvoice(invoice.publicToken)}`;
    const content = kind === "reminder" ? reminderEmailContent(invoice, today, org, adapter.branding(), url) : invoiceEmailContent(invoice, today, org, adapter.branding(), url);
    const to = invoice.customerEmail
      ? invoice.customerEmail
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (to.length === 0) return fail("This invoice has no program email to send to.");
    const sent = await adapter.sendEmail({ ...content, to, kind, invoiceId: invoice.id });
    if (!sent.ok) return fail(sent.error ?? "The email didn't go through.");
    return { ok: true, data: invoice };
  }

  return {
    async list(eventId?: string): Promise<Result<Invoice[]>> {
      const gate = await requireView();
      if (!gate.ok) return gate;
      try {
        return { ok: true, data: await listInvoices(await adapter.getServerClient(), eventId) };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async get(id: string): Promise<Result<Invoice>> {
      const gate = await requireView();
      if (!gate.ok) return gate;
      try {
        const inv = await getInvoice(await adapter.getServerClient(), id);
        if (!inv) return fail("That invoice isn't here.");
        return { ok: true, data: inv };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async getPublic(token: string): Promise<Result<Invoice>> {
      try {
        const db = adapter.getAdminClient();
        const inv = await getInvoiceByToken(db, token);
        if (!inv || !inv.sentAt) return fail("That invoice isn't here.");
        if (!inv.viewedAt) await updateInvoiceRow(db, inv.id, { viewed_at: new Date().toISOString() });
        return { ok: true, data: (await getInvoiceByToken(db, token)) ?? inv };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async create(input: CreateInvoiceInput): Promise<Result<Invoice>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      if (!input.customerName.trim()) return fail("Enter the program name.");
      if (!DAY.test(input.dueOn)) return fail("Pick a balance due date.");
      if (!input.lines.length) return fail("Add at least one line item.");
      try {
        const db = await adapter.getServerClient();
        const year = Number(adapter.today().slice(0, 4));
        const inv = await insertInvoice(db, {
          number: await nextInvoiceNumber(db, year),
          hostEventId: input.hostEventId ?? null,
          hostCustomerId: input.hostCustomerId ?? null,
          customerName: input.customerName.trim().slice(0, 160),
          customerEmail: input.customerEmail?.trim().slice(0, 200) || null,
          eventLabel: input.eventLabel?.trim().slice(0, 120) || null,
          dueOn: input.dueOn,
          depositCents: Math.max(0, Math.round(input.depositCents ?? 0)),
          depositDueOn: input.depositDueOn && DAY.test(input.depositDueOn) ? input.depositDueOn : null,
          createdBy: gate.data.userId,
          lines: input.lines,
        });
        await notifyEvent(inv.hostEventId);
        return { ok: true, data: inv };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async update(id: string, input: UpdateInvoiceInput): Promise<Result<Invoice>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      try {
        const db = await adapter.getServerClient();
        const inv = await getInvoice(db, id);
        if (!inv) return fail("That invoice isn't here.");
        if (inv.sentAt) return fail("A sent invoice can't be edited. Record a payment or resend it.");
        const patch: Record<string, unknown> = {};
        if (input.customerName != null) patch.customer_name = input.customerName.trim().slice(0, 160);
        if (input.customerEmail !== undefined) patch.customer_email = input.customerEmail?.trim().slice(0, 200) || null;
        if (input.eventLabel !== undefined) patch.event_label = input.eventLabel?.trim().slice(0, 120) || null;
        if (input.dueOn) {
          if (!DAY.test(input.dueOn)) return fail("Pick a balance due date.");
          patch.due_on = input.dueOn;
        }
        if (input.depositCents != null) patch.deposit_cents = Math.max(0, Math.round(input.depositCents));
        if (input.depositDueOn !== undefined) patch.deposit_due_on = input.depositDueOn && DAY.test(input.depositDueOn) ? input.depositDueOn : null;
        if (Object.keys(patch).length) await updateInvoiceRow(db, id, patch);
        if (input.lines) await replaceLines(db, id, input.lines);
        return { ok: true, data: (await getInvoice(db, id))! };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async send(id: string): Promise<Result<Invoice>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      try {
        const db = await adapter.getServerClient();
        const inv = await getInvoice(db, id);
        if (!inv) return fail("That invoice isn't here.");
        if (!inv.sentAt) {
          await updateInvoiceRow(db, id, { sent_at: new Date().toISOString(), issued_on: adapter.today() });
        }
        const fresh = (await getInvoice(db, id))!;
        const mailed = await sendFor(fresh, "invoice");
        if (!mailed.ok) return mailed;
        await notifyEvent(fresh.hostEventId);
        return { ok: true, data: fresh };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async recordPayment(id: string, input: RecordPaymentInput): Promise<Result<Invoice>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      if (input.method !== "venmo" && input.method !== "check") return fail("Pick Venmo or check.");
      if (!(input.amountCents > 0)) return fail("Enter an amount.");
      if (!DAY.test(input.paidOn)) return fail("Pick the date they paid.");
      try {
        const db = await adapter.getServerClient();
        const inv = await getInvoice(db, id);
        if (!inv) return fail("That invoice isn't here.");
        if (!inv.sentAt) return fail("Send the invoice before recording a payment.");
        await insertPayment(db, id, {
          method: input.method,
          amountCents: Math.round(input.amountCents),
          paidOn: input.paidOn,
          reference: input.reference?.trim().slice(0, 80) || null,
          recordedBy: gate.data.userId,
        });
        const fresh = (await getInvoice(db, id))!;
        await notifyEvent(fresh.hostEventId);
        return { ok: true, data: fresh };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async eventSummary(eventId: string): Promise<Result<{ invoices: Invoice[]; summary: EventCollection }>> {
      const gate = await requireView();
      if (!gate.ok) return gate;
      try {
        const invoices = await listInvoices(await adapter.getServerClient(), eventId);
        const expected = (await adapter.listEventCustomers(eventId)).filter((c) => c.teamCount > 0).length;
        return { ok: true, data: { invoices, summary: eventCollection(eventId, invoices, expected || undefined) } };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async createBatch(input: BatchInput, send: boolean): Promise<Result<{ invoices: Invoice[]; sent: number; skipped: string[] }>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      if (!DAY.test(input.dueOn)) return fail("Pick a balance due date.");
      if (input.depositOn && input.depositDueOn && !DAY.test(input.depositDueOn)) return fail("Pick a deposit due date.");
      const customers = input.customers.filter((c) => c.teamCount > 0);
      if (!customers.length) return fail("No programs with teams to bill.");
      const skipped: string[] = [];
      const created: Invoice[] = [];
      let sent = 0;
      try {
        const db = await adapter.getServerClient();
        const existing = await listInvoices(db, input.eventId);
        const year = Number(adapter.today().slice(0, 4));
        for (const c of customers) {
          if (existing.some((v) => v.hostCustomerId === c.id && v.sentAt)) {
            skipped.push(`${c.name}: already billed`);
            continue;
          }
          const draft = existing.find((v) => v.hostCustomerId === c.id && !v.sentAt);
          const depositCents = input.depositOn ? input.depositPerTeamCents * c.teamCount : 0;
          const lines = [{ description: input.lineDescription || `Team fee · ${input.eventLabel}`, qty: c.teamCount, unitCents: input.feeCents }];
          let inv: Invoice;
          if (draft) {
            await updateInvoiceRow(db, draft.id, {
              customer_name: c.name,
              customer_email: c.emails[0] ?? null,
              event_label: input.eventLabel,
              due_on: input.dueOn,
              deposit_cents: depositCents,
              deposit_due_on: depositCents ? input.depositDueOn : null,
            });
            await replaceLines(db, draft.id, lines);
            inv = (await getInvoice(db, draft.id))!;
          } else {
            inv = await insertInvoice(db, {
              number: await nextInvoiceNumber(db, year),
              hostEventId: input.eventId,
              hostCustomerId: c.id,
              customerName: c.name,
              customerEmail: c.emails[0] ?? null,
              eventLabel: input.eventLabel,
              dueOn: input.dueOn,
              depositCents,
              depositDueOn: depositCents ? input.depositDueOn : null,
              createdBy: gate.data.userId,
              lines,
            });
          }
          if (send) {
            await updateInvoiceRow(db, inv.id, { sent_at: new Date().toISOString(), issued_on: adapter.today() });
            const fresh = (await getInvoice(db, inv.id))!;
            const mailed = await sendFor(fresh, "invoice");
            if (!mailed.ok) skipped.push(`${c.name}: ${mailed.error}`);
            else sent++;
            created.push((await getInvoice(db, inv.id))!);
          } else {
            created.push(inv);
          }
        }
        await notifyEvent(input.eventId);
        return { ok: true, data: { invoices: created, sent, skipped } };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async reminders(): Promise<Result<ReminderSettings>> {
      const gate = await requireView();
      if (!gate.ok) return gate;
      try {
        return { ok: true, data: await loadReminderSettings(await adapter.getServerClient()) };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async saveReminders(settings: ReminderSettings): Promise<Result<ReminderSettings>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      const next = normalizeReminders(settings);
      try {
        await saveReminderSettingsRow(await adapter.getServerClient(), next, gate.data.userId);
        return { ok: true, data: next };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async runReminders(): Promise<{ scanned: number; sent: number; failed: number; skipped: number }> {
      const db = adapter.getAdminClient();
      const out = { scanned: 0, sent: 0, failed: 0, skipped: 0 };
      let invoices: Invoice[];
      let settings: ReminderSettings;
      try {
        invoices = await listInvoices(db);
        settings = await loadReminderSettings(db);
      } catch {
        return out;
      }
      const today = adapter.today();
      const org = await adapter.orgSettings();
      for (const inv of invoices) {
        if (invoiceBalance(inv) <= 0 || !inv.sentAt) continue;
        out.scanned++;
        const prior = await reminderSendDates(db, inv.id);
        if (!shouldSendReminder({ invoice: inv, settings, today, priorSendDates: prior })) {
          out.skipped++;
          continue;
        }
        const claim = await claimReminderSend(db, inv.id, today);
        if (!claim) {
          out.skipped++;
          continue;
        }
        const url = `${adapter.publicBaseUrl().replace(/\/$/, "")}${adapter.paths.publicInvoice(inv.publicToken)}`;
        const content = reminderEmailContent(inv, today, org, adapter.branding(), url);
        const to = inv.customerEmail
          ? inv.customerEmail
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        if (!to.length) {
          await finishReminderSend(db, claim, false, "no email");
          out.failed++;
          continue;
        }
        const mailed = await adapter.sendEmail({ ...content, to, kind: "reminder", invoiceId: inv.id });
        await finishReminderSend(db, claim, mailed.ok, mailed.error);
        if (mailed.ok) out.sent++;
        else out.failed++;
      }
      return out;
    },

    compute: computeInvoice,
    collection: eventCollection,
    adapter,
  };
}

export type InvoicingService = ReturnType<typeof createInvoicingService>;
