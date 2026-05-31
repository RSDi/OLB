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
  const categoryId = formData.get("category_id");
  const areaId = formData.get("area_id");
  const priorityId = formData.get("priority_id");
  const description = formData.get("description");
  const projectId = formData.get("project_id");
  const cleanProjectId = typeof projectId === "string" && projectId ? projectId : null;

  if (typeof categoryId !== "string" || !categoryId) return { error: "Category is required." };
  if (typeof priorityId !== "string" || !priorityId) return { error: "Priority is required." };
  if (typeof description !== "string" || !description.trim()) {
    return { error: "Description is required." };
  }
  const cleanAreaId = typeof areaId === "string" && areaId ? areaId : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to submit a task." };
  }

  // Look up category + priority + member metadata (RLS lets the signed-in user
  // read active lookups + their own member row, so the regular client is fine).
  const [{ data: category }, { data: priority }, { data: member }] = await Promise.all([
    supabase.from("task_categories").select("name").eq("id", categoryId).maybeSingle(),
    supabase.from("priorities").select("label").eq("id", priorityId).maybeSingle(),
    supabase.from("members").select("full_name, email").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!category) return { error: "Category no longer exists." };
  if (!priority) return { error: "Priority no longer exists." };
  // Area is required for Maintenance tasks; optional for other categories.
  if (category.name === "Maintenance" && !cleanAreaId) {
    return { error: "Area is required for maintenance tasks." };
  }

  const { data: area } = cleanAreaId
    ? await supabase.from("areas").select("name").eq("id", cleanAreaId).maybeSingle()
    : { data: null as { name: string } | null };

  const trimmedDescription = description.trim();

  const { data: inserted, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      submitted_by: user.id,
      category_id: categoryId,
      area_id: cleanAreaId,
      priority_id: priorityId,
      description: trimmedDescription,
      project_id: cleanProjectId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Failed to submit task." };
  }

  // Fire-and-forget email so a Resend hiccup doesn't fail the user's submit.
  const notifyPayload = {
    ticketId: inserted.id,
    areaId: cleanAreaId,
    submitterEmail: member?.email ?? user.email ?? null,
    submitterName: member?.full_name ?? null,
    areaName: area?.name ?? null,
    categoryName: category.name,
    priorityLabel: priority.label,
    description: trimmedDescription,
  };
  sendNewTicketNotification(notifyPayload).catch((err) =>
    console.error("[notify] new-ticket email failed:", err),
  );

  revalidatePath("/portal/tasks");

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

  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
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

  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
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

  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
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

  revalidatePath(`/portal/tasks/${ticketId}`);
  return { success: true };
}

export async function softDeleteTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/tasks/deleted");
  return { success: true };
}

export async function restoreTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ deleted_at: null })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/tasks/deleted");
  return { success: true };
}

export async function hardDeleteTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks/deleted");
  return { success: true };
}
