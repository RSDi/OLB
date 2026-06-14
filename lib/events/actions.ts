"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

export interface EventActionResult {
  success?: boolean;
  error?: string;
  eventId?: string;
}

export interface EventInput {
  title: string;
  description: string | null;
  startAt: string;          // ISO datetime
  endAt: string | null;     // ISO datetime
  location: string | null;
  areaId: string | null;
  categoryId: string | null;
  // Building-shutdown wizard (0060): a runnable "shutdown" playbook this event
  // needs. Optional so other callers (e.g. auto-create-from-request) needn't
  // set it; the event form always sends it.
  shutdownPlaybookId?: string | null;
}

function validate(input: EventInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (!input.startAt) return "Start time is required.";
  if (input.endAt) {
    const start = new Date(input.startAt).getTime();
    const end = new Date(input.endAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      return "End time must be after start time.";
    }
  }
  return null;
}

export async function createEvent(input: EventInput): Promise<EventActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      start_at: input.startAt,
      end_at: input.endAt || null,
      location: input.location?.trim() || null,
      area_id: input.areaId,
      category_id: input.categoryId,
      ...(input.shutdownPlaybookId !== undefined
        ? { shutdown_playbook_id: input.shutdownPlaybookId }
        : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create event." };

  revalidatePath("/portal/events");
  revalidatePath("/portal");
  return { success: true, eventId: data.id };
}

export async function updateEvent(
  eventId: string,
  input: EventInput
): Promise<EventActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      start_at: input.startAt,
      end_at: input.endAt || null,
      location: input.location?.trim() || null,
      area_id: input.areaId,
      category_id: input.categoryId,
      ...(input.shutdownPlaybookId !== undefined
        ? { shutdown_playbook_id: input.shutdownPlaybookId }
        : {}),
    })
    .eq("id", eventId);
  if (error) return { error: error.message };

  revalidatePath("/portal/events");
  revalidatePath(`/portal/events/${eventId}`);
  revalidatePath("/portal");
  return { success: true };
}

export async function softDeleteEvent(eventId: string): Promise<EventActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) return { error: error.message };

  revalidatePath("/portal/events");
  revalidatePath("/portal");
  return { success: true };
}
