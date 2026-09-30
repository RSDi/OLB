"use server";

// Server actions for managing the contact_categories lookup list.
// Mirrors lib/events/category-actions.ts and lib/playbooks/category-actions.ts.
// Staff can create / rename; super-admin can soft-delete.

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

export interface CategoryActionResult {
  success?: boolean;
  error?: string;
  categoryId?: string;
}

export interface ContactCategoryInput {
  name: string;
  slug?: string | null;
  sortOrder: number;
  // "Coaches can see": coaches read the contacts of this type (0109). Left
  // as it is when undefined.
  sharedWithCoaches?: boolean;
}

// Before migration 0109 there's no shared_with_coaches column: save the rest.
function missingSharing(error: { message?: string } | null): boolean {
  return !!error && /shared_with_coaches/.test(error.message ?? "");
}

function sharing(input: ContactCategoryInput) {
  return input.sharedWithCoaches === undefined ? {} : { shared_with_coaches: input.sharedWithCoaches };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validate(input: ContactCategoryInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  return null;
}

export async function createContactCategory(
  input: ContactCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    slug: input.slug?.trim() || slugify(input.name),
    sort_order: input.sortOrder,
  };
  let { data, error } = await supabase
    .from("contact_categories")
    .insert({ ...row, ...sharing(input) })
    .select("id")
    .single();
  if (missingSharing(error)) {
    ({ data, error } = await supabase.from("contact_categories").insert(row).select("id").single());
  }

  if (error || !data) {
    return { error: error?.message ?? "Failed to create category." };
  }

  revalidatePath("/portal/settings");
  revalidatePath("/portal/contacts");
  return { success: true, categoryId: data.id };
}

export async function updateContactCategory(
  categoryId: string,
  input: ContactCategoryInput
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    slug: input.slug?.trim() || slugify(input.name),
    sort_order: input.sortOrder,
  };
  let { error } = await supabase
    .from("contact_categories")
    .update({ ...row, ...sharing(input) })
    .eq("id", categoryId);
  if (missingSharing(error)) {
    ({ error } = await supabase.from("contact_categories").update(row).eq("id", categoryId));
  }
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/contacts");
  return { success: true };
}

export async function softDeleteContactCategory(
  categoryId: string
): Promise<CategoryActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/contacts");
  return { success: true };
}
