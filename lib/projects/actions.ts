"use server";

// Server actions for Projects (a named group of tasks). Project rows live in
// `projects`; tasks point at one via maintenance_requests.project_id.

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";

export interface ProjectActionResult {
  success?: boolean;
  error?: string;
  projectId?: string;
}

export async function createProject(input: {
  title: string;
  description?: string;
  categoryId?: string | null;
  budget?: number | null;
}): Promise<ProjectActionResult> {
  const title = input.title.trim();
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      description: input.description?.trim() || null,
      category_id: input.categoryId || null,
      budget: Number.isFinite(input.budget ?? NaN) ? input.budget : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create project." };

  revalidatePath("/portal/tasks/projects");
  return { success: true, projectId: data.id };
}

export async function assignTaskToProject(
  taskId: string,
  projectId: string | null
): Promise<ProjectActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ project_id: projectId })
    .eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${taskId}`);
  if (projectId) revalidatePath(`/portal/tasks/projects/${projectId}`);
  return { success: true };
}

// Turn a ReelNotes recording into a Project + one Task per action item,
// carrying each item's priority and (when the owner is staff) its assignee.
// Owners who can't hold the assignee slot (assignment is staff-only) and all
// supporters are written into the task description so "Matt takes it, Corey
// helps" survives the conversion instead of silently dropping (B1).
// Tasks land in the General category with no area.
export async function createProjectFromRecording(input: {
  title: string;
  tasks: {
    text: string;
    priority: string;
    ownerMemberId: string | null;
    ownerName?: string | null;
    supporterNames?: string[];
  }[];
}): Promise<ProjectActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const title = input.title.trim() || "Untitled recording";
  if (input.tasks.length === 0) return { error: "No open tasks to send." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .insert({ title, created_by: user.id })
    .select("id")
    .single();
  if (pErr || !proj) return { error: pErr?.message ?? "Failed to create project." };

  const [{ data: genCat }, { data: prios }, { data: staff }] = await Promise.all([
    supabase.from("task_categories").select("id").eq("name", "General").is("deleted_at", null).maybeSingle(),
    supabase.from("priorities").select("id, key").is("deleted_at", null),
    supabase.from("members").select("id").in("role", ["admin", "super_admin"]).eq("status", "approved"),
  ]);
  const priorityByKey = new Map((prios ?? []).map((p) => [p.key, p.id] as const));
  const staffIds = new Set((staff ?? []).map((s) => s.id));
  const categoryId = (genCat as { id: string } | null)?.id ?? null;

  const rows = input.tasks.map((t) => {
    const staffAssignable = Boolean(t.ownerMemberId && staffIds.has(t.ownerMemberId));
    const peopleLines: string[] = [];
    if (!staffAssignable && t.ownerName) peopleLines.push(`Owner: ${t.ownerName}`);
    if (t.supporterNames && t.supporterNames.length > 0) {
      peopleLines.push(`Helping: ${t.supporterNames.join(", ")}`);
    }
    return {
      submitted_by: user.id,
      project_id: proj.id,
      category_id: categoryId,
      area_id: null,
      priority_id: priorityByKey.get(t.priority) ?? priorityByKey.get("medium") ?? null,
      description: peopleLines.length > 0 ? `${t.text}\n\n${peopleLines.join("\n")}` : t.text,
      assigned_to: staffAssignable ? t.ownerMemberId : null,
    };
  });
  const { error: tErr } = await supabase.from("maintenance_requests").insert(rows);
  if (tErr) return { error: tErr.message };

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/tasks/projects");
  return { success: true, projectId: proj.id };
}

export async function softDeleteProject(projectId: string): Promise<ProjectActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  // Detach tasks first so they don't dangle on a hidden project.
  await supabase.from("maintenance_requests").update({ project_id: null }).eq("project_id", projectId);
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/portal/tasks/projects");
  return { success: true };
}

// Promote a single task into a Project: create the project, move the original
// task under it, and spawn one child task per added coordination step. This is
// the "a task became 2+ things to get done" flow. Child tasks inherit the
// original's category/priority and land approved (committee-created work).
export async function promoteTaskToProject(
  taskId: string,
  input: { title: string; steps: string[] }
): Promise<ProjectActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const title = input.title.trim();
  if (!title) return { error: "Give the project a title." };
  const steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: task } = await supabase
    .from("maintenance_requests")
    .select("category_id, priority_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "Task not found." };

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .insert({ title, category_id: task.category_id, created_by: user.id })
    .select("id")
    .single();
  if (pErr || !proj) return { error: pErr?.message ?? "Failed to create project." };

  // Move the original request under the project (and mark it approved work).
  const { error: uErr } = await supabase
    .from("maintenance_requests")
    .update({ project_id: proj.id, review_status: "approved" })
    .eq("id", taskId);
  if (uErr) return { error: uErr.message };

  if (steps.length > 0) {
    const rows = steps.map((text) => ({
      submitted_by: user.id,
      project_id: proj.id,
      category_id: task.category_id,
      priority_id: task.priority_id,
      area_id: null,
      description: text,
      review_status: "approved",
    }));
    const { error: cErr } = await supabase.from("maintenance_requests").insert(rows);
    if (cErr) return { error: cErr.message };
  }

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/tasks/projects");
  revalidatePath(`/portal/tasks/${taskId}`);
  revalidatePath(`/portal/tasks/projects/${proj.id}`);
  return { success: true, projectId: proj.id };
}
