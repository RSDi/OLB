"use server";

// Email templates (0117), managed by any board member in Settings → Email
// Templates. RLS enforces the same; the guard fails fast with a clear message.

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { cleanTemplate, type EmailTemplateInput } from "./email-templates";

export interface TemplateResult {
  success?: boolean;
  error?: string;
}

function refresh() {
  revalidatePath("/portal/settings");
}

export async function createEmailTemplate(input: EmailTemplateInput): Promise<TemplateResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const c = cleanTemplate(input);
  if ("error" in c) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_email_templates")
    .insert({ ...c, created_by: gate.userId, updated_by: gate.userId });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function updateEmailTemplate(id: string, input: EmailTemplateInput): Promise<TemplateResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const c = cleanTemplate(input);
  if ("error" in c) return { error: c.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("olb_email_templates")
    .update({ ...c, updated_by: gate.userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That template was deleted. Refresh the page." };
  refresh();
  return { success: true };
}

// Gone for good: a template is only a starting point, and emails already
// sent keep their own copy.
export async function deleteEmailTemplate(id: string): Promise<TemplateResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("olb_email_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}
