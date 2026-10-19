// Host-facing operations. Every mutation checks canInvoice() on the adapter.

import type { InvoicingAdapter } from "./adapter.ts";
import { invoiceEmailContent, reminderEmailContent } from "./emails.ts";
import {
  batchCustomerEligible,
  clampDeposit,
  computeInvoice,
  effectiveMailCopies,
  eventCollection,
  invoiceAlreadyBilled,
  invoiceBalance,
  lineAmount,
  normalizeClubSettings,
  normalizeReminders,
  parseEmailList,
  shouldSendReminder,
} from "./logic.ts";
import {
  claimReminderSend,
  finishReminderSend,
  getInvoice,
  getInvoiceByToken,
  insertInvoice,
  insertPayment,
  listInvoices,
  loadInvoiceSettings,
  loadReminderSettings,
  MIGRATION_HINT,
  nextInvoiceNumber,
  reminderSendDates,
  replaceLines,
  saveInvoiceSettingsRow,
  saveReminderSettingsRow,
  updateInvoiceRow,
} from "./store.ts";
import type {
  BatchInput,
  CreateInvoiceInput,
  EventCollection,
  Invoice,
  InvoiceClubSettings,
  RecordPaymentInput,
  ReminderSettings,
  Result,
  UpdateInvoiceInput,
} from "./types.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function migrationError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/inv_invoices|schema cache|does not exist/i.test(msg)) return MIGRATION_HINT;
  return msg;
}

function splitEmails(raw: string | null | undefined): string[] {
  const parsed = parseEmailList(raw);
  return parsed.ok ? parsed.data : [];
}

function copiesPatch(cc?: string[] | null, bcc?: string[] | null): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (cc !== undefined && cc !== null) patch.cc_emails = cc;
  if (bcc !== undefined && bcc !== null) patch.bcc_emails = bcc;
  return patch;
}

function reminderOverridePatch(input: UpdateInvoiceInput): Record<string, unknown> {
  if (input.reminderFreq === undefined && input.reminderStartDays === undefined && input.reminderUntilPaid === undefined) {
    return {};
  }
  if (input.reminderFreq == null && input.reminderStartDays == null && input.reminderUntilPaid == null) {
    return { reminder_freq: null, reminder_start_days: null, reminder_until_paid: null };
  }
  const next = normalizeReminders({
    freq: input.reminderFreq ?? undefined,
    startDays: input.reminderStartDays ?? undefined,
    untilPaid: input.reminderUntilPaid ?? undefined,
  });
  return {
    reminder_freq: next.freq,
    reminder_start_days: next.startDays,
    reminder_until_paid: next.untilPaid,
  };
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
    const to = splitEmails(invoice.customerEmail);
    if (to.length === 0) return fail("This invoice has no program email to send to.");
    const copies = effectiveMailCopies(invoice, org);
    const sent = await adapter.sendEmail({ ...content, to, cc: copies.cc, bcc: copies.bcc, kind, invoiceId: invoice.id });
    if (sent.logged) return fail(sent.error ?? "Not sent (logged only). Set INVOICE_TEST_EMAIL to deliver to a test inbox.");
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
        if (!TOKEN.test(token.trim())) return fail("That invoice isn't here.");
        const db = adapter.getAdminClient();
        const inv = await getInvoiceByToken(db, token.trim());
        if (!inv || !inv.sentAt || inv.voidedAt) return fail("That invoice isn't here.");
        let skipView = false;
        try {
          skipView = await adapter.canInvoice();
        } catch {
          skipView = false;
        }
        if (!inv.viewedAt && !skipView) await updateInvoiceRow(db, inv.id, { viewed_at: new Date().toISOString() });
        return { ok: true, data: (await getInvoiceByToken(db, token.trim())) ?? inv };
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
      const email = input.customerEmail != null ? parseEmailList(input.customerEmail) : { ok: true as const, data: [] as string[] };
      if (!email.ok) return email;
      const cc = input.ccEmails !== undefined && input.ccEmails !== null ? parseEmailList(input.ccEmails) : null;
      if (cc && !cc.ok) return cc;
      const bcc = input.bccEmails !== undefined && input.bccEmails !== null ? parseEmailList(input.bccEmails) : null;
      if (bcc && !bcc.ok) return bcc;
      try {
        const db = await adapter.getServerClient();
        const year = Number(adapter.today().slice(0, 4));
        const total = input.lines.reduce((s, l) => s + lineAmount(l), 0);
        const inv = await insertInvoice(db, {
          number: await nextInvoiceNumber(db, year),
          hostEventId: input.hostEventId ?? null,
          hostCustomerId: input.hostCustomerId ?? null,
          customerName: input.customerName.trim().slice(0, 160),
          customerEmail: email.data.join(", ") || null,
          eventLabel: input.eventLabel?.trim().slice(0, 120) || null,
          dueOn: input.dueOn,
          depositCents: clampDeposit(input.depositCents ?? 0, total),
          depositDueOn: input.depositDueOn && DAY.test(input.depositDueOn) ? input.depositDueOn : null,
          createdBy: gate.data.userId,
          ccEmails: cc ? cc.data : null,
          bccEmails: bcc ? bcc.data : null,
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
        if (inv.voidedAt) return fail("A voided invoice can't be edited.");
        if (inv.sentAt) {
          const sentPatch: Record<string, unknown> = { ...reminderOverridePatch(input) };
          if (input.ccEmails !== undefined) {
            if (input.ccEmails === null) sentPatch.cc_emails = null;
            else {
              const cc = parseEmailList(input.ccEmails);
              if (!cc.ok) return cc;
              sentPatch.cc_emails = cc.data;
            }
          }
          if (input.bccEmails !== undefined) {
            if (input.bccEmails === null) sentPatch.bcc_emails = null;
            else {
              const bcc = parseEmailList(input.bccEmails);
              if (!bcc.ok) return bcc;
              sentPatch.bcc_emails = bcc.data;
            }
          }
          if (!Object.keys(sentPatch).length) return fail("A sent invoice can't be edited. Record a payment or void it and issue a new invoice.");
          await updateInvoiceRow(db, id, sentPatch);
          return { ok: true, data: (await getInvoice(db, id))! };
        }
        const patch: Record<string, unknown> = {};
        if (input.customerName != null) patch.customer_name = input.customerName.trim().slice(0, 160);
        if (input.customerEmail !== undefined) {
          const email = parseEmailList(input.customerEmail);
          if (!email.ok) return email;
          patch.customer_email = email.data.join(", ") || null;
        }
        if (input.eventLabel !== undefined) patch.event_label = input.eventLabel?.trim().slice(0, 120) || null;
        if (input.dueOn) {
          if (!DAY.test(input.dueOn)) return fail("Pick a balance due date.");
          patch.due_on = input.dueOn;
        }
        const lines = input.lines ?? inv.lines;
        const total = lines.reduce((s, l) => s + lineAmount(l), 0);
        if (input.depositCents != null) patch.deposit_cents = clampDeposit(input.depositCents, total);
        else if (input.lines) patch.deposit_cents = clampDeposit(inv.depositCents, total);
        if (input.depositDueOn !== undefined) patch.deposit_due_on = input.depositDueOn && DAY.test(input.depositDueOn) ? input.depositDueOn : null;
        if (input.ccEmails !== undefined) {
          if (input.ccEmails === null) patch.cc_emails = null;
          else {
            const cc = parseEmailList(input.ccEmails);
            if (!cc.ok) return cc;
            patch.cc_emails = cc.data;
          }
        }
        if (input.bccEmails !== undefined) {
          if (input.bccEmails === null) patch.bcc_emails = null;
          else {
            const bcc = parseEmailList(input.bccEmails);
            if (!bcc.ok) return bcc;
            patch.bcc_emails = bcc.data;
          }
        }
        Object.assign(patch, reminderOverridePatch(input));
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
        if (inv.voidedAt) return fail("A voided invoice can't be sent.");
        if (inv.sentAt) return fail("This invoice was already sent.");
        const mailed = await sendFor(inv, "invoice");
        if (!mailed.ok) return mailed;
        await updateInvoiceRow(db, id, { sent_at: new Date().toISOString(), issued_on: adapter.today() });
        const fresh = (await getInvoice(db, id))!;
        await notifyEvent(fresh.hostEventId);
        return { ok: true, data: fresh };
      } catch (e) {
        return fail(migrationError(e));
      }
    },

    async voidInvoice(id: string): Promise<Result<Invoice>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      try {
        const db = await adapter.getServerClient();
        const inv = await getInvoice(db, id);
        if (!inv) return fail("That invoice isn't here.");
        if (inv.voidedAt) return { ok: true, data: inv };
        await updateInvoiceRow(db, id, { voided_at: new Date().toISOString() });
        const fresh = (await getInvoice(db, id))!;
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
        if (inv.voidedAt) return fail("A voided invoice can't take a payment.");
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
      const cc = input.ccEmails !== undefined && input.ccEmails !== null ? parseEmailList(input.ccEmails) : null;
      if (cc && !cc.ok) return cc;
      const bcc = input.bccEmails !== undefined && input.bccEmails !== null ? parseEmailList(input.bccEmails) : null;
      if (bcc && !bcc.ok) return bcc;
      const skipped: string[] = [];
      const created: Invoice[] = [];
      let sent = 0;
      try {
        const hostCustomers = await adapter.listEventCustomers(input.eventId);
        const feeCents = await adapter.eventFeeCents(input.eventId);
        if (feeCents == null) return fail("Set the team fee on the tournament plan first.");
        const wanted = input.customers.filter((c) => c.teamCount > 0);
        if (!wanted.length) return fail("No programs with teams to bill.");
        const db = await adapter.getServerClient();
        const existing = await listInvoices(db, input.eventId);
        const year = Number(adapter.today().slice(0, 4));
        const ccVal = cc ? cc.data : null;
        const bccVal = bcc ? bcc.data : null;
        for (const row of wanted) {
          const c = hostCustomers.find((h) => h.id === row.id);
          if (!c) {
            skipped.push(`${row.id}: not on this event`);
            continue;
          }
          if (!batchCustomerEligible(c, existing)) {
            if (invoiceAlreadyBilled(existing, c.id)) skipped.push(`${c.name}: already billed`);
            continue;
          }
          const teamCount = c.teamCount;
          const draft = existing.find((v) => v.hostCustomerId === c.id && !v.sentAt && !v.voidedAt);
          const total = teamCount * feeCents;
          const depositCents = input.depositOn ? clampDeposit(input.depositPerTeamCents * teamCount, total) : 0;
          const lines = [{ description: input.lineDescription || `Team fee · ${input.eventLabel}`, qty: teamCount, unitCents: feeCents }];
          const email = c.emails.join(", ") || null;
          let inv: Invoice;
          if (draft) {
            await updateInvoiceRow(db, draft.id, {
              customer_name: c.name,
              customer_email: email,
              event_label: input.eventLabel,
              due_on: input.dueOn,
              deposit_cents: depositCents,
              deposit_due_on: depositCents ? input.depositDueOn : null,
              ...copiesPatch(cc ? cc.data : undefined, bcc ? bcc.data : undefined),
            });
            await replaceLines(db, draft.id, lines);
            inv = (await getInvoice(db, draft.id))!;
          } else {
            inv = await insertInvoice(db, {
              number: await nextInvoiceNumber(db, year),
              hostEventId: input.eventId,
              hostCustomerId: c.id,
              customerName: c.name,
              customerEmail: email,
              eventLabel: input.eventLabel,
              dueOn: input.dueOn,
              depositCents,
              depositDueOn: depositCents ? input.depositDueOn : null,
              createdBy: gate.data.userId,
              ccEmails: ccVal,
              bccEmails: bccVal,
              lines,
            });
            existing.push(inv);
          }
          if (send) {
            const mailed = await sendFor(inv, "invoice");
            if (!mailed.ok) skipped.push(`${c.name}: ${mailed.error}`);
            else {
              await updateInvoiceRow(db, inv.id, { sent_at: new Date().toISOString(), issued_on: adapter.today() });
              sent++;
            }
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

    async clubSettings(): Promise<Result<InvoiceClubSettings>> {
      const gate = await requireView();
      if (!gate.ok) return gate;
      try {
        return { ok: true, data: await loadInvoiceSettings(await adapter.getServerClient()) };
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

    async saveClubSettings(settings: InvoiceClubSettings): Promise<Result<InvoiceClubSettings>> {
      const gate = await requireInvoicePermission();
      if (!gate.ok) return gate;
      const cc = parseEmailList(settings.ccEmails);
      if (!cc.ok) return cc;
      const bcc = parseEmailList(settings.bccEmails);
      if (!bcc.ok) return bcc;
      const next = normalizeClubSettings({ ...settings, ccEmails: cc.data, bccEmails: bcc.data });
      try {
        await saveInvoiceSettingsRow(await adapter.getServerClient(), next, gate.data.userId);
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
        if (inv.voidedAt || invoiceBalance(inv) <= 0 || !inv.sentAt) continue;
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
        const to = splitEmails(inv.customerEmail);
        if (!to.length) {
          await finishReminderSend(db, claim, false, "no email");
          out.failed++;
          continue;
        }
        const copies = effectiveMailCopies(inv, org);
        const mailed = await adapter.sendEmail({ ...content, to, cc: copies.cc, bcc: copies.bcc, kind: "reminder", invoiceId: inv.id });
        const ok = mailed.ok && !mailed.logged;
        await finishReminderSend(db, claim, ok, mailed.error);
        if (ok) out.sent++;
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
