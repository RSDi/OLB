"use server";

// Settings → Registration Emails (0127): saving a field's words, or putting
// the original back. Super-admins and the Registrations permission; RLS
// enforces the same, the guard fails fast with a clear message.

import { revalidatePath } from "next/cache";
import { requireRegistrations } from "../auth/guards";
import { createClient } from "../supabase/server";
import { cleanEmailText } from "./registration-email-text";

export interface EmailTextResult {
  error?: string;
}

export async function saveRegistrationEmailText(key: string, value: string): Promise<EmailTextResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const c = cleanEmailText(key, value);
  if ("error" in c) return { error: c.error };
  const db = await createClient();
  const { error } =
    c.value === null
      ? await db.from("olb_registration_email_text").delete().eq("key", key)
      : await db
          .from("olb_registration_email_text")
          .upsert({ key, value: c.value, updated_by: gate.userId, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/portal/settings");
  return {};
}

export async function resetRegistrationEmailText(key: string): Promise<EmailTextResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.from("olb_registration_email_text").delete().eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/portal/settings");
  return {};
}
