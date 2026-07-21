"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

// Closures use requireStaff() rather than requireSettingsEdit() on purpose:
// whether the church is meeting is an operational call every building
// committee member should be able to make, unlike the reference data the
// settings grants (0057) protect.

export interface ClosureActionResult {
  success?: boolean;
  error?: string;
}

export interface ClosureInput {
  title: string;
  bodyMd: string;
  reasonId: string | null;
  startsOn: string;
  endsOn: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateClosure(input: ClosureInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (input.title.trim().length > 200) return "Title is too long (max 200 characters).";
  if (!ISO_DATE.test(input.startsOn)) return "Start date is required.";
  if (input.endsOn !== null && !ISO_DATE.test(input.endsOn)) return "End date is invalid.";
  // Lexicographic compare is chronological for YYYY-MM-DD (lib/dates/today.ts).
  if (input.endsOn && input.endsOn < input.startsOn) {
    return "End date can't be before the start date.";
  }
  return null;
}

function closureRow(input: ClosureInput) {
  return {
    title: input.title.trim(),
    body_md: input.bodyMd,
    reason_id: input.reasonId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
  };
}

function revalidateClosurePages() {
  revalidatePath("/meeting-times");
  revalidatePath("/door-sign");
  revalidatePath("/portal/settings");
}

export async function startClosure(input: ClosureInput): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validateClosure(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase.from("closures").insert(closureRow(input));
  if (error) {
    // 23505 = unique_violation on closures_one_open_idx (at most one open closure).
    if (error.code === "23505") {
      return { error: "A closure is already active — edit or clear it instead." };
    }
    return { error: error.message };
  }

  revalidateClosurePages();
  return { success: true };
}

export async function updateClosure(
  closureId: string,
  input: ClosureInput
): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validateClosure(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("closures")
    .update(closureRow(input))
    .eq("id", closureId);
  if (error) return { error: error.message };

  revalidateClosurePages();
  return { success: true };
}

export async function clearClosure(closureId: string): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("closures")
    .update({ cleared_at: new Date().toISOString() })
    .eq("id", closureId);
  if (error) return { error: error.message };

  revalidateClosurePages();
  return { success: true };
}

// ── Reason templates ─────────────────────────────────────────────

export interface ClosureReasonInput {
  title: string;
  bodyMd: string;
  sortOrder: number;
}

function validateReason(input: ClosureReasonInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (input.title.trim().length > 200) return "Title is too long (max 200 characters).";
  return null;
}

export async function createClosureReason(
  input: ClosureReasonInput
): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validateReason(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase.from("closure_reasons").insert({
    title: input.title.trim(),
    body_md: input.bodyMd,
    sort_order: input.sortOrder,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

export async function updateClosureReason(
  reasonId: string,
  input: ClosureReasonInput
): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validateReason(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("closure_reasons")
    .update({
      title: input.title.trim(),
      body_md: input.bodyMd,
      sort_order: input.sortOrder,
    })
    .eq("id", reasonId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

export async function softDeleteClosureReason(
  reasonId: string
): Promise<ClosureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("closure_reasons")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", reasonId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}
