"use server";

import { revalidatePath } from "next/cache";
import {
  createInvoicingService,
  type BatchInput,
  type CreateInvoiceInput,
  type InvoiceClubSettings,
  type RecordPaymentInput,
  type ReminderSettings,
  type UpdateInvoiceInput,
} from "invoicing";
import { requireInvoiceView, requireInvoicing } from "../auth/guards";
import { olbInvoicingAdapter, olbInvoicePaths } from "./adapter";
import { hostedEventCustomers } from "./customers";

function svc() {
  return createInvoicingService(olbInvoicingAdapter());
}

function refresh(invoiceId?: string, eventId?: string | null) {
  revalidatePath("/portal/payments");
  if (invoiceId) revalidatePath(olbInvoicePaths.detail(invoiceId));
  if (eventId) {
    revalidatePath(olbInvoicePaths.event(eventId));
    revalidatePath(`/portal/schedule/hosted/${eventId}`);
  }
}

export async function listInvoicesAction(eventId?: string) {
  const gate = await requireInvoiceView();
  if ("error" in gate) return { ok: false as const, error: gate.error };
  return svc().list(eventId);
}

export async function getInvoiceAction(id: string) {
  const gate = await requireInvoiceView();
  if ("error" in gate) return { ok: false as const, error: gate.error };
  return svc().get(id);
}

export async function listInvoiceEventCustomersAction(eventId: string) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { error: "Pick an event." };
  try {
    const customers = await hostedEventCustomers(eventId);
    return { customers };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't load programs." };
  }
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().create(input);
  if (res.ok) {
    refresh(res.data.id, res.data.hostEventId);
    return { id: res.data.id };
  }
  return { error: res.error };
}

export async function updateInvoiceAction(id: string, input: UpdateInvoiceInput) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().update(id, input);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return {};
}

export async function sendInvoiceAction(id: string) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().send(id);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return { notice: "Invoice sent." };
}

export async function voidInvoiceAction(id: string) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().voidInvoice(id);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return { notice: "Invoice voided." };
}

export async function recordInvoicePaymentAction(id: string, input: RecordPaymentInput) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().recordPayment(id, input);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return {};
}

export async function saveInvoiceRemindersAction(settings: ReminderSettings) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().saveReminders(settings);
  if (!res.ok) return { error: res.error };
  revalidatePath("/portal/payments");
  return {};
}

export async function saveInvoiceClubSettingsAction(settings: InvoiceClubSettings) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().saveClubSettings(settings);
  if (!res.ok) return { error: res.error };
  revalidatePath("/portal/payments");
  return {};
}

export async function createBatchInvoicesAction(input: BatchInput, send: boolean) {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  const res = await svc().createBatch(input, send);
  if (!res.ok) return { error: res.error };
  refresh(undefined, input.eventId);
  const n = res.data.invoices.length;
  return {
    notice: send ? `${res.data.sent} invoices sent` : `${n} invoices saved as drafts`,
    skipped: res.data.skipped,
  };
}
