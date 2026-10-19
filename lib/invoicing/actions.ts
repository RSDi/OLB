"use server";

import { revalidatePath } from "next/cache";
import { createInvoicingService, type BatchInput, type CreateInvoiceInput, type RecordPaymentInput, type ReminderSettings, type UpdateInvoiceInput } from "invoicing";
import { olbInvoicingAdapter, olbInvoicePaths } from "./adapter";

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
  return svc().list(eventId);
}

export async function getInvoiceAction(id: string) {
  return svc().get(id);
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  const res = await svc().create(input);
  if (res.ok) {
    refresh(res.data.id, res.data.hostEventId);
    return { id: res.data.id };
  }
  return { error: res.error };
}

export async function updateInvoiceAction(id: string, input: UpdateInvoiceInput) {
  const res = await svc().update(id, input);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return {};
}

export async function sendInvoiceAction(id: string) {
  const res = await svc().send(id);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return { notice: res.data.sentAt ? "Invoice sent." : undefined };
}

export async function recordInvoicePaymentAction(id: string, input: RecordPaymentInput) {
  const res = await svc().recordPayment(id, input);
  if (!res.ok) return { error: res.error };
  refresh(id, res.data.hostEventId);
  return {};
}

export async function saveInvoiceRemindersAction(settings: ReminderSettings) {
  const res = await svc().saveReminders(settings);
  if (!res.ok) return { error: res.error };
  revalidatePath("/portal/payments");
  return {};
}

export async function createBatchInvoicesAction(input: BatchInput, send: boolean) {
  const res = await svc().createBatch(input, send);
  if (!res.ok) return { error: res.error };
  refresh(undefined, input.eventId);
  const n = res.data.invoices.length;
  return {
    notice: send ? `${res.data.sent} invoices sent` : `${n} invoices saved as drafts`,
    skipped: res.data.skipped,
  };
}
