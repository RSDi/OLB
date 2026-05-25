"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { sendNewTicketNotification } from "../notifications/new-ticket";

export interface CreateTicketResult {
  success?: boolean;
  ticketId?: string;
  error?: string;
}

export async function createTicket(formData: FormData): Promise<CreateTicketResult> {
  const areaId = formData.get("area_id");
  const priorityId = formData.get("priority_id");
  const description = formData.get("description");

  if (typeof areaId !== "string" || !areaId) return { error: "Area is required." };
  if (typeof priorityId !== "string" || !priorityId) return { error: "Priority is required." };
  if (typeof description !== "string" || !description.trim()) {
    return { error: "Description is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to submit a request." };
  }

  // Look up the area + priority + member metadata for the email body. RLS
  // already lets the signed-in user read active areas/priorities and their
  // own member row, so the regular server client is enough.
  const [{ data: area }, { data: priority }, { data: member }] = await Promise.all([
    supabase.from("areas").select("name").eq("id", areaId).maybeSingle(),
    supabase.from("priorities").select("label").eq("id", priorityId).maybeSingle(),
    supabase.from("members").select("full_name, email").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!area) return { error: "Area no longer exists." };
  if (!priority) return { error: "Priority no longer exists." };

  const trimmedDescription = description.trim();

  const { data: inserted, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      submitted_by: user.id,
      area_id: areaId,
      priority_id: priorityId,
      description: trimmedDescription,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Failed to submit request." };
  }

  // Fire-and-forget email so a Resend hiccup doesn't fail the user's submit.
  sendNewTicketNotification({
    ticketId: inserted.id,
    submitterEmail: member?.email ?? user.email ?? null,
    submitterName: member?.full_name ?? null,
    areaName: area.name,
    priorityLabel: priority.label,
    description: trimmedDescription,
  }).catch((err) => console.error("[notify] new-ticket failed:", err));

  revalidatePath("/portal/maintenance");

  return { success: true, ticketId: inserted.id };
}

export type TicketStatus = "open" | "in_progress" | "done" | "cancelled";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

export async function changeTicketStatus(
  ticketId: string,
  status: TicketStatus
): Promise<ActionResult> {
  const valid: TicketStatus[] = ["open", "in_progress", "done", "cancelled"];
  if (!valid.includes(status)) return { error: "Invalid status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ status })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance");
  revalidatePath(`/portal/maintenance/${ticketId}`);
  return { success: true };
}

export async function changeTicketPriority(
  ticketId: string,
  priorityId: string
): Promise<ActionResult> {
  if (!priorityId) return { error: "Priority is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ priority_id: priorityId })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance");
  revalidatePath(`/portal/maintenance/${ticketId}`);
  return { success: true };
}

export async function assignTicket(
  ticketId: string,
  memberId: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ assigned_to: memberId })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance");
  revalidatePath(`/portal/maintenance/${ticketId}`);
  return { success: true };
}

export async function addTicketComment(
  ticketId: string,
  body: string,
  parentId?: string | null
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Comment can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: me } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return { error: "Member record not found." };

  // If this is a reply, make sure the parent belongs to the same ticket so
  // we can't graft a comment onto a different ticket's thread.
  if (parentId) {
    const { data: parent } = await supabase
      .from("ticket_comments")
      .select("ticket_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.ticket_id !== ticketId) {
      return { error: "Parent comment is on a different ticket." };
    }
  }

  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    author_id: me.id,
    body: trimmed,
    parent_id: parentId ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/portal/maintenance/${ticketId}`);
  return { success: true };
}

export async function softDeleteTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance");
  revalidatePath("/portal/maintenance/deleted");
  return { success: true };
}

export async function restoreTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ deleted_at: null })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance");
  revalidatePath("/portal/maintenance/deleted");
  return { success: true };
}

export async function hardDeleteTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/maintenance/deleted");
  return { success: true };
}
