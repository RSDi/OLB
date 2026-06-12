"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, requireSuperAdmin } from "../auth/guards";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
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
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
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
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
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
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
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
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
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
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
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
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks/deleted");
  return { success: true };
}

// ─── Member requests (friendly intake wizards) ───────────────────
// One action for every intake track. Reuses the task table: use-a-space,
// event, class, question, and equipment *purchases* land as
// review_status='pending_review' (committee review queue); simple repairs go
// straight to the work queue as 'approved'. Structured answers live in the
// details jsonb (details.kind = the track key); description is the readable
// summary shown in queues.

// Preferred category per track, with graceful fallbacks (so this works whether
// or not the optional "Building Use" category from migration 0047 exists).
const CATEGORY_PREFERENCE: Record<string, string[]> = {
  "building-use": ["Building Use", "Event", "General"],
  maintenance: ["Maintenance", "General"],
  question: ["General", "Maintenance"],
};

export async function createRequest(
  trackKey: string,
  details: Record<string, unknown>,
): Promise<CreateTicketResult> {
  const d = details ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const hasSpaces = Array.isArray(d.spaces) && (d.spaces as string[]).length > 0;

  // Per-track required-field checks (mirrors the wizard's client validation).
  switch (trackKey) {
    case "building-use":
      if (!d.subType) return { error: "Please tell us what you're planning." };
      if (!hasSpaces) return { error: "Please choose at least one space." };
      if (!s(d.date).trim()) return { error: "Please choose a date." };
      break;
    case "maintenance":
      if (!d.maintType) return { error: "Please choose what you need." };
      if (d.maintType === "repair" && !s(d.problem).trim()) return { error: "Please tell us what's wrong." };
      if (d.maintType === "purchase" && !s(d.item).trim()) return { error: "Please tell us what to buy." };
      break;
    case "question":
      if (!s(d.question).trim()) return { error: "Please write your question." };
      break;
    default:
      return { error: "Unknown request type." };
  }
  if (trackKey === "building-use" && d.requesterKind === "outside" && !s(d.outsideOrg).trim()) {
    return { error: "Please tell us the name of the group or host." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to make a request." };

  const [{ data: cats }, { data: prios }, { data: member }] = await Promise.all([
    supabase.from("task_categories").select("id, name").is("deleted_at", null),
    supabase.from("priorities").select("id, key, label").is("deleted_at", null),
    supabase.from("members").select("full_name, email").eq("user_id", user.id).maybeSingle(),
  ]);

  const pref = CATEGORY_PREFERENCE[trackKey] ?? ["General"];
  const category =
    pref.map((n) => (cats ?? []).find((c) => c.name.toLowerCase() === n.toLowerCase())).find(Boolean) ?? (cats ?? [])[0];
  if (!category) return { error: "No task category is configured." };

  // Simple repairs go straight to the work queue; everything else (bookings,
  // events, classes, questions, purchases) needs committee review.
  const isRepair = trackKey === "maintenance" && d.maintType === "repair";
  const reviewStatus = isRepair ? "approved" : "pending_review";

  // Infer priority from a repair's urgency; otherwise medium.
  const prioKey = isRepair
    ? s(d.urgency).startsWith("Urgent")
      ? "high"
      : s(d.urgency).startsWith("Soon")
        ? "medium"
        : "low"
    : "medium";
  const priority =
    (prios ?? []).find((p) => p.key === prioKey) ?? (prios ?? []).find((p) => p.key === "medium") ?? (prios ?? [])[0];
  if (!priority) return { error: "No priority is configured." };

  const description = buildRequestDescription(trackKey, d);

  const { data: inserted, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      submitted_by: user.id,
      category_id: category.id,
      area_id: null,
      priority_id: priority.id,
      description,
      details: { kind: trackKey, ...d },
      review_status: reviewStatus,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Failed to submit your request." };
  }

  // Fire-and-forget notifications (both no-op without their env).
  const notifyPayload = {
    ticketId: inserted.id,
    areaId: null,
    submitterEmail: member?.email ?? user.email ?? null,
    submitterName: member?.full_name ?? null,
    areaName: null,
    categoryName: category.name,
    priorityLabel: reviewStatus === "pending_review" ? "Needs review" : priority.label ?? priority.key,
    description,
  };
  sendNewTicketNotification(notifyPayload).catch((err) => console.error("[notify] request email failed:", err));
  sendNewTicketSlack(notifyPayload).catch((err) => console.error("[notify] request slack failed:", err));

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/review");
  revalidatePath("/portal/requests");
  return { success: true, ticketId: inserted.id };
}

function buildRequestDescription(trackKey: string, d: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");
  const lines: string[] = [];
  const who = () => {
    if (d.requesterKind === "outside") lines.push(`For an outside group${s(d.outsideOrg) ? `: ${s(d.outsideOrg)}` : ""}.`);
  };
  const where = () => {
    if (list(d.spaces)) lines.push(`Space(s): ${list(d.spaces)}.`);
  };
  const when = () => {
    const time = [d.startTime, d.endTime].filter(Boolean).join("–");
    const w = [d.date, time].filter(Boolean).join(" ");
    if (w) lines.push(`When: ${w}${d.recurring ? ` (recurring${s(d.recurrenceNote) ? `: ${s(d.recurrenceNote)}` : ""})` : ""}.`);
  };
  const people = () => {
    if (s(d.headcount)) lines.push(`About ${s(d.headcount)} people${s(d.children) ? `, incl. ${s(d.children)} children` : ""}.`);
  };
  const needs = () => {
    if (list(d.needs)) lines.push(`Needs: ${list(d.needs)}.`);
  };
  const access = () => {
    const a: string[] = [];
    if (s(d.accessPerson)) a.push(`${s(d.accessPerson)} will open/lock up`);
    if (d.hasKey) a.push("has a key/code");
    if (d.selfCleanup) a.push("will set up & clean up");
    if (a.length) lines.push(`Access: ${a.join("; ")}.`);
  };

  switch (trackKey) {
    case "building-use":
      lines.push(`Building use — ${s(d.subTypeLabel) || s(d.subType)}.`);
      who(); where(); when(); people(); needs(); access();
      if (d.paidActivity) lines.push(`Paid activity${d.insuranceAck ? " — can provide insurance/waiver" : ""}.`);
      break;
    case "maintenance":
      if (d.maintType === "purchase") {
        lines.push(`Purchase request: ${s(d.item)}${s(d.cost) ? ` (~${s(d.cost)} each)` : ""}.`);
        if (s(d.reason)) lines.push(`Why: ${s(d.reason)}.`);
        if (s(d.link)) lines.push(`Link: ${s(d.link)}.`);
      } else {
        lines.push(`${s(d.problem)}${s(d.location) ? ` — ${s(d.location)}` : ""}.`);
        if (s(d.problemDetail)) lines.push(s(d.problemDetail));
        if (s(d.urgency)) lines.push(`Urgency: ${s(d.urgency)}.`);
      }
      break;
    case "question":
      lines.push(`Question${s(d.topic) ? ` (${s(d.topic)})` : ""}: ${s(d.question)}`);
      break;
  }
  if (s(d.contact)) lines.push(`Contact: ${s(d.contact)}.`);
  if (s(d.notes).trim()) lines.push(`Notes: ${s(d.notes).trim()}`);
  return lines.join("\n");
}

// ─── Public building-use request (church website, no login) ──────
// The public site form posts here. Visitors aren't signed in, so we use the
// service-role admin client to resolve lookups + insert, and capture their
// contact info in details. Lands in the same committee review queue as portal
// requests (review_status='pending_review', details.kind set), unifying the
// pipeline so the old standalone building_requests table is no longer needed.

export interface PublicBuildingRequestInput {
  eventType: string;
  space: string;
  date: string;
  startTime?: string;
  endTime?: string;
  attendance?: string;
  notes?: string;
  contactName?: string;
  contactEmail?: string;
}

const PUBLIC_EVENT_LABELS: Record<string, string> = {
  wedding: "Wedding / reception",
  party: "Party / celebration",
  basketball: "Basketball",
  volleyball: "Volleyball",
  meeting: "Meeting / gathering",
  other: "Other",
};
const PUBLIC_SPACE_LABELS: Record<string, string> = {
  main_meeting_room: "Main Meeting Room",
  gym: "Gymnasium",
  youth_room: "Youth Room",
  classrooms: "Classrooms",
  full_building: "Full Building",
};

export async function createPublicBuildingRequest(
  input: PublicBuildingRequestInput,
): Promise<CreateTicketResult> {
  if (!input.eventType || !input.space || !input.date) {
    return { error: "Please choose an event type, a space, and a date." };
  }
  if (!input.contactName?.trim() || !input.contactEmail?.trim()) {
    return { error: "Please tell us your name and how to reach you." };
  }

  const admin = (() => {
    try {
      return createAdminClient();
    } catch {
      return null;
    }
  })();
  if (!admin) {
    return { error: "Requests aren't set up yet. Please contact the church office." };
  }

  const [{ data: cats }, { data: prios }] = await Promise.all([
    admin.from("task_categories").select("id, name").is("deleted_at", null),
    admin.from("priorities").select("id, key").is("deleted_at", null),
  ]);

  const isEvent = ["wedding", "party"].includes(input.eventType);
  const pref = isEvent ? ["Event", "Building Use", "General"] : ["Building Use", "Event", "General"];
  const category =
    pref.map((n) => (cats ?? []).find((c) => c.name.toLowerCase() === n.toLowerCase())).find(Boolean) ?? (cats ?? [])[0];
  if (!category) return { error: "No task category is configured." };
  const priority = (prios ?? []).find((p) => p.key === "medium") ?? (prios ?? [])[0];
  if (!priority) return { error: "No priority is configured." };

  // If the visitor happens to be signed in, attribute the request to them.
  let submittedBy: string | null = null;
  try {
    const supa = await createClient();
    const {
      data: { user },
    } = await supa.auth.getUser();
    submittedBy = user?.id ?? null;
  } catch {
    submittedBy = null;
  }

  const eventLabel = PUBLIC_EVENT_LABELS[input.eventType] ?? input.eventType;
  const spaceLabel = PUBLIC_SPACE_LABELS[input.space] ?? input.space;
  const time = [input.startTime, input.endTime].filter(Boolean).join("–");
  const lines = [
    `Public building request — ${eventLabel}.`,
    `Space: ${spaceLabel}.`,
    `When: ${[input.date, time].filter(Boolean).join(" ")}.`,
  ];
  if (input.attendance) lines.push(`Expected attendance: ${input.attendance}.`);
  lines.push(`Contact: ${input.contactName} (${input.contactEmail}).`);
  if (input.notes?.trim()) lines.push(`Notes: ${input.notes.trim()}`);
  const description = lines.join("\n");

  const { data: inserted, error } = await admin
    .from("maintenance_requests")
    .insert({
      submitted_by: submittedBy,
      category_id: category.id,
      area_id: null,
      priority_id: priority.id,
      description,
      details: {
        kind: isEvent ? "event" : "use-a-space",
        public: true,
        requesterKind: "outside",
        eventTypeLabel: eventLabel,
        spaces: [spaceLabel],
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        headcount: input.attendance,
        contactName: input.contactName,
        contact: input.contactEmail,
        notes: input.notes,
      },
      review_status: "pending_review",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Failed to submit your request." };
  }

  const notifyPayload = {
    ticketId: inserted.id,
    areaId: null,
    submitterEmail: input.contactEmail ?? null,
    submitterName: `${input.contactName} (public)`,
    areaName: null,
    categoryName: category.name,
    priorityLabel: "Needs review",
    description,
  };
  sendNewTicketNotification(notifyPayload).catch((err) => console.error("[notify] public request email failed:", err));
  sendNewTicketSlack(notifyPayload).catch((err) => console.error("[notify] public request slack failed:", err));

  revalidatePath("/portal/review");
  revalidatePath("/portal/tasks");
  return { success: true, ticketId: inserted.id };
}

// A3: actual dollars a task ended up costing. Staff-edited on the task
// detail; the project page sums these against the project budget. RLS
// (staff update) enforces who can set it.
export async function setTaskCost(
  ticketId: string,
  cost: number | null,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
    return { error: "Cost must be 0 or more." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ cost })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/tasks/${ticketId}`);
  revalidatePath("/portal/tasks/projects");
  return { success: true };
}

// ─── Committee review decisions ──────────────────────────────────
// Decisions are made by committee vote (cast_request_vote RPC, migration
// 0050): simple majority of the current committee, instant. A "no" requires
// a note. The RPC flips review_status atomically; this layer fires the
// requester notification when a vote lands the decision.

export type ReviewStatus = "pending_review" | "approved" | "declined";
export type VoteValue = "yes" | "no";

export interface CastVoteResult {
  error?: string;
  decided?: "approved" | "declined" | null;
  yes?: number;
  no?: number;
  threshold?: number;
}

async function notifyDecision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    id: string;
    submitted_by: string | null;
    description: string;
    details: Record<string, unknown> | null;
  },
  decision: "approved" | "declined",
  reason?: string,
) {
  // Prefer the requester's account email; public (no-login) submissions fall
  // back to the contact email collected by the wizard.
  let to: string | null = null;
  let name: string | null = null;
  if (row.submitted_by) {
    const { data: sub } = await supabase
      .from("members")
      .select("email, full_name")
      .eq("user_id", row.submitted_by)
      .maybeSingle();
    to = sub?.email ?? null;
    name = sub?.full_name ?? null;
  }
  if (!to && row.details) {
    const contact = row.details["contactEmail"];
    if (typeof contact === "string" && contact.includes("@")) to = contact;
    const contactName = row.details["contactName"];
    if (!name && typeof contactName === "string") name = contactName;
  }
  sendRequestDecisionNotification({
    ticketId: row.id,
    to,
    recipientName: name,
    decision,
    reason,
    summary: row.description,
  }).catch((err) => console.error("[notify] decision email failed:", err));
}

// A4: an approved building-use request becomes a calendar event so the
// booking is visible to everyone. Best-effort — a request without a usable
// date (e.g. multi-day/recurring plans) is skipped and the committee adds the
// event by hand. Same datetime-local string format the events form submits.
async function createEventFromApprovedRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: { id: string; description: string; details: Record<string, unknown> | null },
) {
  const d = row.details;
  if (!d) return;
  const date = typeof d.date === "string" ? d.date : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.warn("[events] approved request has no single date — skipping auto-event", row.id);
    return;
  }
  const startTime = typeof d.startTime === "string" && d.startTime ? d.startTime : "09:00";
  let endTime = typeof d.endTime === "string" && d.endTime ? d.endTime : "";
  if (!endTime) {
    const endHour = (Number(startTime.slice(0, 2)) + 2) % 24;
    endTime = `${String(endHour).padStart(2, "0")}${startTime.slice(2)}`;
  }
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]).join(", ") : null;
  const title =
    (typeof d.eventTypeLabel === "string" && d.eventTypeLabel) ||
    row.description.split("\n")[0].slice(0, 120);

  const { error } = await supabase.from("events").insert({
    title,
    description: "Booked via an approved building-use request.",
    start_at: `${date}T${startTime}:00`,
    end_at: `${date}T${endTime}:00`,
    location: spaces,
    source_ticket_id: row.id,
  });
  if (error) {
    // Pre-0050 schema (no source_ticket_id) or RLS hiccup — log, don't block
    // the decision.
    console.error("[events] auto-create insert failed:", error.message);
  }
}

export async function castRequestVote(
  ticketId: string,
  vote: VoteValue,
  note?: string,
): Promise<CastVoteResult> {
  const trimmedNote = note?.trim() ?? "";
  if (vote === "no" && !trimmedNote) {
    return { error: "Please add a reason so the requester understands." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.rpc("cast_request_vote", {
    p_ticket_id: ticketId,
    p_vote: vote,
    p_note: trimmedNote || null,
  });
  if (error) return { error: error.message };

  const result = (data ?? {}) as {
    decided: "approved" | "declined" | null;
    yes: number;
    no: number;
    threshold: number;
  };

  // The vote that crosses the majority fires the requester notification and,
  // for approvals, puts the booking on the events calendar (A4).
  if (result.decided) {
    const { data: row } = await supabase
      .from("maintenance_requests")
      .select("id, submitted_by, description, details, decline_reason")
      .eq("id", ticketId)
      .maybeSingle();
    if (row) {
      const ticketRow = row as {
        id: string;
        submitted_by: string | null;
        description: string;
        details: Record<string, unknown> | null;
      };
      await notifyDecision(
        supabase,
        ticketRow,
        result.decided,
        (row as { decline_reason?: string | null }).decline_reason ?? undefined,
      );
      if (result.decided === "approved") {
        await createEventFromApprovedRequest(supabase, ticketRow).catch((err) =>
          console.error("[events] auto-create from approved request failed:", err),
        );
      }
    }
  }

  revalidatePath("/portal/review");
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${ticketId}`);
  return { decided: result.decided, yes: result.yes, no: result.no, threshold: result.threshold };
}
