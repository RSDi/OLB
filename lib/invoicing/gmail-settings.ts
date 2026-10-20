// Club Gmail connection row. Service-role only. The refresh token is
// encrypted with INVOICE_GMAIL_TOKEN_KEY before insert.

import { createAdminClient } from "../supabase/admin.ts";
import { decryptSecret, encryptSecret, invoiceGmailTokenKey } from "./gmail-crypto.ts";
import type { GmailMailLoad, InvoiceGmailConnection } from "./gmail-meta.ts";
import { invoiceGmailLive } from "./gmail-oauth.ts";

export type { InvoiceGmailConnection };

const COLS = "id, refresh_token_enc, sender_email, connected_at, connected_by, last_used_at, last_error, updated_at";

type Row = {
  refresh_token_enc: string | null;
  sender_email: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
};

export function emptyGmailConnection(): InvoiceGmailConnection {
  return {
    connected: false,
    senderEmail: null,
    connectedAt: null,
    lastUsedAt: null,
    lastError: null,
  };
}

function publicView(row: Row | null): InvoiceGmailConnection {
  return {
    connected: Boolean(row?.refresh_token_enc),
    senderEmail: row?.sender_email ?? null,
    connectedAt: row?.connected_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

function assertGmailLive(env: Record<string, string | undefined> = process.env): void {
  if (!invoiceGmailLive(env)) {
    throw new Error("Connect Gmail is only available in production.");
  }
}

/** Missing inv_gmail (migration 0157 not applied) is "no Gmail", not Reconnect.
 * Codes only: a missing column (42703 / PGRST204) or a message match must
 * fail loudly, not fall through to Resend. */
export function isMissingGmailTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = ("code" in error ? String((error as { code?: unknown }).code ?? "") : "").toUpperCase();
  return code === "42P01" || code === "PGRST205";
}

async function loadRow(): Promise<Row | null> {
  assertGmailLive();
  const admin = createAdminClient();
  const { data, error } = await admin.from("inv_gmail").select(COLS).eq("id", true).maybeSingle();
  if (error) {
    if (isMissingGmailTable(error)) return null;
    throw new Error(error.message);
  }
  return (data as Row | null) ?? null;
}

export async function getGmailConnection(
  env: Record<string, string | undefined> = process.env
): Promise<InvoiceGmailConnection> {
  if (!invoiceGmailLive(env)) return emptyGmailConnection();
  return publicView(await loadRow());
}

/**
 * Load the Gmail sender for invoice mail. `none` only when there is no
 * ciphertext. A row that exists but can't be read or decrypted is
 * `unreadable` so the host does not fall back to Resend.
 */
export async function loadGmailForSend(
  env: Record<string, string | undefined> = process.env
): Promise<GmailMailLoad> {
  if (!invoiceGmailLive(env)) return { status: "none" };
  let row: Row | null;
  try {
    row = await loadRow();
  } catch (err) {
    if (isMissingGmailTable(err)) return { status: "none" };
    return { status: "unreadable" };
  }
  if (!row?.refresh_token_enc) return { status: "none" };
  try {
    const token = decryptSecret(row.refresh_token_enc, invoiceGmailTokenKey(env));
    const senderEmail = row.sender_email?.trim() ?? "";
    if (!token || !senderEmail) return { status: "unreadable" };
    return { status: "ready", account: { refreshToken: token, senderEmail } };
  } catch {
    return { status: "unreadable" };
  }
}

export async function saveGmailConnection(input: {
  refreshToken: string;
  senderEmail: string;
  connectedBy: string;
  env?: Record<string, string | undefined>;
}): Promise<InvoiceGmailConnection> {
  const env = input.env ?? process.env;
  assertGmailLive(env);
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
  assertGmailLive();
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
  if (!invoiceGmailLive()) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const patch = input.ok
    ? { last_used_at: now, last_error: null, updated_at: now }
    : { last_error: (input.error ?? "Send failed").slice(0, 500), updated_at: now };
  const { error } = await admin.from("inv_gmail").update(patch).eq("id", true);
  if (error) throw new Error(error.message);
}
