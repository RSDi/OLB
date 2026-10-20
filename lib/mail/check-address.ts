// Club check remit-to: payable-to / attention plus mailing lines.
// Stored on inv_reminder_settings (Settings → Invoices). Empty stored values
// fall back to MAIL_CHECK_ADDRESS, then the "reply for the mailing address"
// copy at the call site. Never hard-code a street address.

import { CHECK_PAYEE } from "../teams/registration-receipt.ts";

export const CHECK_PAYEE_MAX = 120;
export const CHECK_ADDRESS_MAX = 800;
export const CHECK_ADDRESS_LINE_MAX = 120;
export const CHECK_ADDRESS_MAX_LINES = 8;

export type StoredCheckMailing = {
  payee: string | null;
  address: string | null;
};

export type ResolvedCheckMailing = {
  payee: string;
  addressLines: string[];
};

export function parseEnvCheckAddress(env: Record<string, string | undefined> = process.env): string[] {
  return (env.MAIL_CHECK_ADDRESS ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function linesFromStoredAddress(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCheckMailing(
  stored: StoredCheckMailing,
  env: Record<string, string | undefined> = process.env,
  defaultPayee = CHECK_PAYEE
): ResolvedCheckMailing {
  const payee = stored.payee?.trim() || defaultPayee;
  const fromDb = linesFromStoredAddress(stored.address);
  const addressLines = fromDb.length ? fromDb : parseEnvCheckAddress(env);
  return { payee, addressLines };
}

export function normalizeCheckPayee(raw: string): string | null {
  const t = raw.trim().slice(0, CHECK_PAYEE_MAX);
  return t || null;
}

export function normalizeCheckAddress(raw: string): string | null {
  const lines = linesFromStoredAddress(raw)
    .map((s) => s.slice(0, CHECK_ADDRESS_LINE_MAX))
    .slice(0, CHECK_ADDRESS_MAX_LINES);
  const joined = lines.join("\n");
  if (!joined) return null;
  return joined.slice(0, CHECK_ADDRESS_MAX);
}

export async function fetchStoredCheckMailing(db: { from: (table: string) => any }): Promise<StoredCheckMailing> {
  try {
    const { data, error } = await db.from("inv_reminder_settings").select("check_payee, check_address").eq("id", 1).maybeSingle();
    if (error || !data) return { payee: null, address: null };
    const row = data as { check_payee?: string | null; check_address?: string | null };
    return { payee: row.check_payee ?? null, address: row.check_address ?? null };
  } catch {
    return { payee: null, address: null };
  }
}
