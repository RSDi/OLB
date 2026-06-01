"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { sendNewTicketNotification } from "../notifications/new-ticket";
import { sendNewTicketSlack } from "../notifications/slack";
import { sendRequestDecisionNotification } from "../notifications/request-decision";

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

  // Fire-and-forget notifications so a Resend or Slack hiccup doesn't fail the
  // user's submit. Both sinks gracefully no-op if their env isn't set.
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
  sendNewTicketSlack(notifyPayload).catch((err) =>
    console.error("[notify] new-ticket slack failed:", err),
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

// ─── Building-use request (friendly intake wizard) ───────────────
// The wizard collects structured answers and submits them here. We reuse the
// task table: the request is inserted with review_status='pending_review' so it
// lands in the committee Review queue (not the work queue) until a decision is
// made. The structured answers are kept in the details jsonb; `description` is a
// human-readable summary for the queue/detail views.

export interface BuildingUseRequestInput {
  subType: string;
  subTypeLabel: string;
  requesterKind: "member" | "outside";
  outsideOrg?: string;
  contact?: string;
  spaces: string[];
  date: string;
  startTime?: string;
  endTime?: string;
  recurring: boolean;
  recurrenceNote?: string;
  headcount?: string;
  children?: string;
  needs: string[];
  accessPerson?: string;
  hasKey?: boolean;
  selfCleanup?: boolean;
  paidActivity?: boolean;
  insuranceAck?: boolean;
  notes?: string;
}

// Prefer a dedicated "Building Use" category, but fall back gracefully so this
// works whether or not migration 0047 (the category seed) has been applied yet.
const BUILDING_USE_CATEGORY_PREFERENCE = ["Building Use", "Event", "General"];

export async function createBuildingUseRequest(
  input: BuildingUseRequestInput,
): Promise<CreateTicketResult> {
  if (!input?.subType) return { error: "Please tell us what you're planning." };
  if (!input.spaces?.length) return { error: "Please choose at least one space." };
  if (!input.date?.trim()) return { error: "Please choose a date." };
  if (input.requesterKind === "outside" && !input.outsideOrg?.trim()) {
    return { error: "Please tell us the name of the group or host." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to make a request." };

  // Resolve a category (prefer "Building Use") + a sensible default priority +
  // the member's contact details for the committee notification.
  const [{ data: cats }, { data: prios }, { data: member }] = await Promise.all([
    supabase.from("task_categories").select("id, name").is("deleted_at", null),
    supabase.from("priorities").select("id, key").is("deleted_at", null),
    supabase.from("members").select("full_name, email").eq("user_id", user.id).maybeSingle(),
  ]);

  const category =
    BUILDING_USE_CATEGORY_PREFERENCE.map((name) =>
      (cats ?? []).find((c) => c.name.toLowerCase() === name.toLowerCase()),
    ).find(Boolean) ?? (cats ?? [])[0];
  if (!category) return { error: "No task category is configured." };

  const priority = (prios ?? []).find((p) => p.key === "medium") ?? (prios ?? [])[0];
  if (!priority) return { error: "No priority is configured." };

  const description = buildBuildingUseDescription(input);

  const { data: inserted, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      submitted_by: user.id,
      category_id: category.id,
      area_id: null,
      priority_id: priority.id,
      description,
      details: { kind: "building-use", ...input },
      review_status: "pending_review",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Failed to submit your request." };
  }

  // Fire-and-forget: alert the committee that a request needs review. Both
  // sinks no-op gracefully if their env isn't configured.
  const notifyPayload = {
    ticketId: inserted.id,
    areaId: null,
    submitterEmail: member?.email ?? user.email ?? null,
    submitterName: member?.full_name ?? null,
    areaName: null,
    categoryName: category.name,
    priorityLabel: "Needs review",
    description,
  };
  sendNewTicketNotification(notifyPayload).catch((err) =>
    console.error("[notify] building-use request email failed:", err),
  );
  sendNewTicketSlack(notifyPayload).catch((err) =>
    console.error("[notify] building-use request slack failed:", err),
  );

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/requests");
  return { success: true, ticketId: inserted.id };
}

function buildBuildingUseDescription(i: BuildingUseRequestInput): string {
  const lines: string[] = [];
  lines.push(`Building use — ${i.subTypeLabel || i.subType}.`);
  if (i.requesterKind === "outside") {
    lines.push(`For an outside group${i.outsideOrg ? `: ${i.outsideOrg}` : ""}.`);
  }
  lines.push(`Space(s): ${i.spaces.join(", ")}.`);
  const time = [i.startTime, i.endTime].filter(Boolean).join("–");
  const when = [i.date, time].filter(Boolean).join(" ");
  lines.push(
    `When: ${when}${i.recurring ? ` (recurring${i.recurrenceNote ? `: ${i.recurrenceNote}` : ""})` : ""}.`,
  );
  if (i.headcount) {
    lines.push(`About ${i.headcount} people${i.children ? `, incl. ${i.children} children` : ""}.`);
  }
  if (i.needs?.length) lines.push(`Needs: ${i.needs.join(", ")}.`);
  const access: string[] = [];
  if (i.accessPerson) access.push(`${i.accessPerson} will open/lock up`);
  if (i.hasKey) access.push("has a key/code");
  if (i.selfCleanup) access.push("will set up & clean up");
  if (access.length) lines.push(`Access: ${access.join("; ")}.`);
  if (i.paidActivity) {
    lines.push(`Paid activity${i.insuranceAck ? " — can provide insurance/waiver" : ""}.`);
  }
  if (i.contact) lines.push(`Contact: ${i.contact}.`);
  if (i.notes?.trim()) lines.push(`Notes: ${i.notes.trim()}`);
  return lines.join("\n");
}

// ─── Committee review decisions ──────────────────────────────────
// review_status moves pending_review → approved | declined. Reviewer + time
// are stamped; declines carry a required reason. Gated by RLS (staff update).

export type ReviewStatus = "pending_review" | "approved" | "declined";

async function notifyDecision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: { id: string; submitted_by: string | null; description: string },
  decision: "approved" | "declined",
  reason?: string,
) {
  if (!row.submitted_by) return;
  const { data: sub } = await supabase
    .from("members")
    .select("email, full_name")
    .eq("user_id", row.submitted_by)
    .maybeSingle();
  sendRequestDecisionNotification({
    ticketId: row.id,
    to: sub?.email ?? null,
    recipientName: sub?.full_name ?? null,
    decision,
    reason,
    summary: row.description,
  }).catch((err) => console.error("[notify] decision email failed:", err));
}

export async function approveRequest(ticketId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: updated, error } = await supabase
    .from("maintenance_requests")
    .update({ review_status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", ticketId)
    .select("id, submitted_by, description")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "Request not found." };

  await notifyDecision(supabase, updated, "approved");

  revalidatePath("/portal/review");
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
  return { success: true };
}

export async function declineRequest(ticketId: string, reason: string): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Please give a reason so the requester understands." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: updated, error } = await supabase
    .from("maintenance_requests")
    .update({
      review_status: "declined",
      decline_reason: trimmed,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", ticketId)
    .select("id, submitted_by, description")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "Request not found." };

  await notifyDecision(supabase, updated, "declined", trimmed);

  revalidatePath("/portal/review");
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
  return { success: true };
}
