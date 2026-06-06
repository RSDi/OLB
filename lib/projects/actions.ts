"use server";

// Server actions for Projects (a named group of tasks). Project rows live in
// `projects`; tasks point at one via maintenance_requests.project_id.

import { revalidatePath } from "next/cache";
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

// Turn a Dave's Idea recording into a Project + one Task per action item,
// carrying each item's priority and (when the owner is staff) its assignee.
// Tasks land in the General category with no area.
export async function createProjectFromRecording(input: {
  title: string;
  tasks: { text: string; priority: string; ownerMemberId: string | null }[];
}): Promise<ProjectActionResult> {
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

  const rows = input.tasks.map((t) => ({
    submitted_by: user.id,
    project_id: proj.id,
    category_id: categoryId,
    area_id: null,
    priority_id: priorityByKey.get(t.priority) ?? priorityByKey.get("medium") ?? null,
    description: t.text,
    assigned_to: t.ownerMemberId && staffIds.has(t.ownerMemberId) ? t.ownerMemberId : null,
  }));
  const { error: tErr } = await supabase.from("maintenance_requests").insert(rows);
  if (tErr) return { error: tErr.message };

  revalidatePath("/portal/tasks");
  revalidatePath("/portal/tasks/projects");
  return { success: true, projectId: proj.id };
}

export async function softDeleteProject(projectId: string): Promise<ProjectActionResult> {
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
