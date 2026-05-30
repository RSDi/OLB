"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

export type VolunteerTeamRole = "lead" | "member";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

// Writes are gated by RLS (staff only); these actions just surface the result
// and revalidate the pages that read this data.
function revalidate() {
  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory/all");
}

export async function createTeam(name: string, description?: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("volunteer_teams")
    .insert({ name: trimmed, description: description?.trim() || null });
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}

export async function updateTeam(
  teamId: string,
  name: string,
  description?: string
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("volunteer_teams")
    .update({ name: trimmed, description: description?.trim() || null })
    .eq("id", teamId);
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}

export async function deleteTeam(teamId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("volunteer_teams").delete().eq("id", teamId);
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}

export async function assignMemberToTeam(
  memberId: string,
  teamId: string,
  role: VolunteerTeamRole
): Promise<ActionResult> {
  if (role !== "lead" && role !== "member") return { error: "Invalid role." };

  const supabase = await createClient();

  // Upsert handles both new assignments and role changes for an existing
  // (member, team) pair.
  const { error } = await supabase
    .from("member_volunteer_teams")
    .upsert(
      { member_id: memberId, team_id: teamId, role },
      { onConflict: "member_id,team_id" }
    );
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}

export async function removeMemberFromTeam(
  memberId: string,
  teamId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("member_volunteer_teams")
    .delete()
    .eq("team_id", teamId)
    .eq("member_id", memberId);
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}
