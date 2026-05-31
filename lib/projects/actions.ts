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
