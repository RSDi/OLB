"use server";

import { revalidatePath } from "next/cache";
import { requireFinances, requireInvoicing } from "../auth/guards";
import {
  fetchStoredCheckMailing,
  normalizeCheckAddress,
  normalizeCheckPayee,
  parseEnvCheckAddress,
  resolveCheckMailing,
  type StoredCheckMailing,
} from "../mail/check-address";
import { createAdminClient } from "../supabase/admin";

export type CheckMailingDraft = {
  payee: string;
  address: string;
  envFallbackLines: string[];
};

// Same rule as inv_reminder_settings_write (0158): invoicing OR Payments.
// Admin client is still used so a missing migration fails closed here,
// not as a PostgREST permission error.
async function gate(): Promise<{ userId: string } | { error: string }> {
  const inv = await requireInvoicing();
  if (!("error" in inv)) return inv;
  const fin = await requireFinances();
  if (!("error" in fin)) return fin;
  return { error: "Requires invoicing or the Payments permission." };
}

export async function loadCheckMailingAddress(): Promise<CheckMailingDraft | { error: string }> {
  const g = await gate();
  if ("error" in g) return g;
  let stored: StoredCheckMailing = { payee: null, address: null };
  try {
    stored = await fetchStoredCheckMailing(createAdminClient());
  } catch {
    stored = { payee: null, address: null };
  }
  return {
    payee: stored.payee ?? "",
    address: stored.address ?? "",
    envFallbackLines: parseEnvCheckAddress(),
  };
}

export async function saveCheckMailingAddress(input: { payee: string; address: string }): Promise<{ error?: string; notice?: string }> {
  const g = await gate();
  if ("error" in g) return g;
  const payee = normalizeCheckPayee(input.payee ?? "");
  const address = normalizeCheckAddress(input.address ?? "");
  try {
    const { error } = await createAdminClient()
      .from("inv_reminder_settings")
      .update({
        check_payee: payee,
        check_address: address,
        updated_by: g.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the mailing address." };
  }
  revalidatePath("/portal/settings");
  revalidatePath("/portal/payments");
  const resolved = resolveCheckMailing({ payee, address });
  return {
    notice: resolved.addressLines.length
      ? "Check mailing address saved. It shows on the next invoice or receipt you send."
      : "Saved with no mailing address. Invoices will say to reply for it unless MAIL_CHECK_ADDRESS is set on the server.",
  };
}
