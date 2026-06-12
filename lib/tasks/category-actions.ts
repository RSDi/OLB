"use server";

// Admin CRUD for task_categories (Settings → Task Categories). Mirrors
// lib/events/category-actions.ts. RLS enforces staff-insert / staff-update /
// super-admin-delete; soft-delete via deleted_at.

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

export interface CategoryActionResult {
  success?: boolean;
  error?: string;
  categoryId?: string;
}

export interface TaskCategoryInput {
  name: string;
  chipClass: string;
  sortOrder: number;
}

function validate(input: TaskCategoryInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.chipClass.trim()) return "Chip color is required.";
  return null;
}

export async function createTaskCategory(
  input: TaskCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_categories")
    .insert({
      name: input.name.trim(),
      chip_class: input.chipClass,
      sort_order: input.sortOrder,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create category." };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/tasks");
  return { success: true, categoryId: data.id };
}

export async function updateTaskCategory(
  categoryId: string,
  input: TaskCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("task_categories")
    .update({
      name: input.name.trim(),
      chip_class: input.chipClass,
      sort_order: input.sortOrder,
    })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/tasks");
  return { success: true };
}

export async function softDeleteTaskCategory(
  categoryId: string
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/tasks");
  return { success: true };
}
