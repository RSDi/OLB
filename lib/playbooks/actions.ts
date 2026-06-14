"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

// Procedures (the runnable checklists) moved to their own table in 0066 — see
// lib/playbooks/procedures-actions.ts. Playbook CRUD here covers only the doc
// itself (title / category / excerpt / body).

export interface PlaybookActionResult {
  success?: boolean;
  error?: string;
  playbookId?: string;
}

export interface PlaybookInput {
  title: string;
  categoryId: string | null;
  excerpt: string | null;
  bodyMd: string;
}

function validate(input: PlaybookInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (input.title.trim().length > 200) return "Title is too long (max 200 characters).";
  return null;
}

export async function createPlaybook(
  input: PlaybookInput
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      title: input.title.trim(),
      category_id: input.categoryId,
      excerpt: input.excerpt?.trim() || null,
      body_md: input.bodyMd,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create playbook." };

  revalidatePath("/portal/docs");
  return { success: true, playbookId: data.id };
}

export async function updatePlaybook(
  playbookId: string,
  input: PlaybookInput
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("playbooks")
    .update({
      title: input.title.trim(),
      category_id: input.categoryId,
      excerpt: input.excerpt?.trim() || null,
      body_md: input.bodyMd,
    })
    .eq("id", playbookId);
  if (error) return { error: error.message };

  revalidatePath("/portal/docs");
  revalidatePath(`/portal/docs/${playbookId}`);
  revalidatePath(`/portal/docs/${playbookId}/history`);
  return { success: true };
}

export async function softDeletePlaybook(
  playbookId: string
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbooks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", playbookId);
  if (error) return { error: error.message };

  revalidatePath("/portal/docs");
  return { success: true };
}
