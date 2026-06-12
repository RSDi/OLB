"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

export interface CategoryActionResult {
  success?: boolean;
  error?: string;
  categoryId?: string;
}

export interface EventCategoryInput {
  name: string;
  chipClass: string;
  sortOrder: number;
}

function validate(input: EventCategoryInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.chipClass.trim()) return "Chip color is required.";
  return null;
}

export async function createEventCategory(
  input: EventCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_categories")
    .insert({
      name: input.name.trim(),
      chip_class: input.chipClass,
      sort_order: input.sortOrder,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create category." };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/events");
  revalidatePath("/portal");
  return { success: true, categoryId: data.id };
}

export async function updateEventCategory(
  categoryId: string,
  input: EventCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_categories")
    .update({
      name: input.name.trim(),
      chip_class: input.chipClass,
      sort_order: input.sortOrder,
    })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/events");
  revalidatePath("/portal");
  return { success: true };
}

export async function softDeleteEventCategory(
  categoryId: string
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/events");
  return { success: true };
}
