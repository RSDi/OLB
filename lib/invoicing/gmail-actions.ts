"use server";
// Finances → Invoices Gmail sender. Connect/disconnect use requireInvoicing
// / canManageInvoicing: approved AND (super_admin OR currently holds
// President/Athletic Director/Treasurer in Settings → Planning Roles OR
// invoicing on profile/extras). The refresh token never goes to the
// browser. Production-only: previews never read or write inv_gmail.

import { revalidatePath } from "next/cache";
import { requireInvoicing } from "../auth/guards";
import { gmailOAuthConfigured, invoiceGmailLive } from "./gmail-oauth.ts";
import {
  disconnectGmail,
  emptyGmailConnection,
  getGmailConnection,
  type InvoiceGmailConnection,
} from "./gmail-settings.ts";

function refresh() {
  revalidatePath("/portal/payments");
}

export async function loadGmailSettings(): Promise<
  { error: string } | { live: boolean; configured: boolean; connection: InvoiceGmailConnection }
> {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  if (!invoiceGmailLive()) {
    return { live: false, configured: false, connection: emptyGmailConnection() };
  }
  try {
    const connection = await getGmailConnection();
    return { live: true, configured: gmailOAuthConfigured(), connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load Gmail settings." };
  }
}

export async function disconnectGmailSender(): Promise<{ error?: string; connection?: InvoiceGmailConnection }> {
  const gate = await requireInvoicing();
  if ("error" in gate) return { error: gate.error };
  if (!invoiceGmailLive()) return { error: "Connect Gmail is only available in production." };
  try {
    const connection = await disconnectGmail();
    refresh();
    return { connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't disconnect Gmail." };
  }
}
