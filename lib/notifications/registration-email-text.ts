// Server-only. The registration emails' words as Settings → Registration
// Emails left them (0127), read with the service role since the public form
// sends them. Anything that fails (before 0127, say) reads as the originals.

import { createAdminClient } from "../supabase/admin";
import { emailText, type EmailText } from "../teams/registration-email-text";

export async function loadEmailText(): Promise<EmailText> {
  try {
    const { data, error } = await createAdminClient().from("olb_registration_email_text").select("key, value");
    if (error) return emailText();
    return emailText(Object.fromEntries(((data as { key: string; value: string }[] | null) ?? []).map((r) => [r.key, r.value])));
  } catch {
    return emailText();
  }
}
