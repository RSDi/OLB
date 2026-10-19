"use server";
// Finances → Invoices Gmail sender. Connect/disconnect need invoicing
// (Treasurer, President, AD). The refresh token never goes to the browser.

import { revalidatePath } from "next/cache";
import { requireInvoicing } from "../auth/guards";
import { gmailOAuthConfigured } from "./gmail-oauth.ts";
import { disconnectGmail, getGmailConnection, type InvoiceGmailConnection } from "./gmail-settings.ts";

function refresh() {
  revalidatePath("/portal/payments");
}

export async function loadGmailSettings(): Promise<
  { error: string } | { configured: boolean; connection: InvoiceGmailConnection }
> {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await getGmailConnection();
    return { configured: gmailOAuthConfigured(), connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load Gmail settings." };
  }
}

export async function disconnectGmailSender(): Promise<{ error?: string; connection?: InvoiceGmailConnection }> {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await disconnectGmail();
    refresh();
    return { connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't disconnect Gmail." };
  }
}
