// Club Gmail connection row. Service-role only. The refresh token is
// encrypted with INVOICE_GMAIL_TOKEN_KEY before insert.

import { createAdminClient } from "../supabase/admin.ts";
import { decryptSecret, encryptSecret, invoiceGmailTokenKey } from "./gmail-crypto.ts";
import type { InvoiceGmailConnection } from "./gmail-meta.ts";

export type { InvoiceGmailConnection };

export type InvoiceGmailSecret = InvoiceGmailConnection & {
  refreshToken: string | null;
};

const COLS = "id, refresh_token_enc, sender_email, connected_at, connected_by, last_used_at, last_error, updated_at";

type Row = {
  refresh_token_enc: string | null;
  sender_email: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
};

function publicView(row: Row | null): InvoiceGmailConnection {
  return {
    connected: Boolean(row?.refresh_token_enc),
    senderEmail: row?.sender_email ?? null,
    connectedAt: row?.connected_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

async function loadRow(): Promise<Row | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("inv_gmail").select(COLS).eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row | null) ?? null;
}

export async function getGmailConnection(): Promise<InvoiceGmailConnection> {
  return publicView(await loadRow());
}

export async function getGmailConnectionSecret(
  env: Record<string, string | undefined> = process.env
): Promise<InvoiceGmailSecret> {
  const row = await loadRow();
  const pub = publicView(row);
  if (!row?.refresh_token_enc) return { ...pub, refreshToken: null };
  const token = decryptSecret(row.refresh_token_enc, invoiceGmailTokenKey(env));
  return { ...pub, refreshToken: token };
}

export async function saveGmailConnection(input: {
  refreshToken: string;
  senderEmail: string;
  connectedBy: string;
  env?: Record<string, string | undefined>;
}): Promise<InvoiceGmailConnection> {
  const env = input.env ?? process.env;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("inv_gmail")
    .update({
      refresh_token_enc: encryptSecret(input.refreshToken, invoiceGmailTokenKey(env)),
      sender_email: input.senderEmail,
      connected_at: now,
      connected_by: input.connectedBy,
      last_error: null,
      updated_at: now,
    })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the Gmail connection.");
  return publicView(data as Row);
}

export async function disconnectGmail(): Promise<InvoiceGmailConnection> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inv_gmail")
    .update({
      refresh_token_enc: null,
      sender_email: null,
      connected_at: null,
      connected_by: null,
      last_used_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't disconnect Gmail.");
  return publicView(data as Row);
}

export async function recordGmailSendResult(input: { ok: boolean; error?: string | null }): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const patch = input.ok
    ? { last_used_at: now, last_error: null, updated_at: now }
    : { last_error: (input.error ?? "Send failed").slice(0, 500), updated_at: now };
  const { error } = await admin.from("inv_gmail").update(patch).eq("id", true);
  if (error) throw new Error(error.message);
}
