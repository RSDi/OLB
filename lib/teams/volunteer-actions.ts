"use server";

// Settings → Teams, Settings → Volunteer Roles, and filling a team's roles
// from its Directory page. Super-admin only, matching RLS (0089, 0092).
// Types live in ./types (exporting them from a "use server" file breaks the
// build).

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards";
import { createClient } from "../supabase/server";
import type { TeamSettingsInput, VolunteerActionResult, VolunteerRoleInput } from "./types";

function revalidate() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/settings");
}

function cleanTeam(input: TeamSettingsInput) {
  return {
    name: input.name.trim(),
    age_group: input.age_group?.trim() || null,
    color: input.color?.trim().toUpperCase() || null,
    division: input.division?.trim() || null,
    practice_times: input.practice_times.map((t) => t.trim()).filter(Boolean),
    practice_location: input.practice_location?.trim() || null,
  };
}

function cleanRole(input: VolunteerRoleInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    spots_per_team: Math.min(10, Math.max(1, Math.round(input.spots_per_team) || 1)),
    is_leadership: input.is_leadership,
    show_in_directory: input.show_in_directory,
    registration_interest: input.registration_interest?.trim() || null,
  };
}

// ── Teams ────────────────────────────────────────────────────────────────

export async function createTeam(input: TeamSettingsInput): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!input.name.trim()) return { error: "Team name is required." };
  const db = await createClient();
  const { data: board } = await db
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return { error: "No season set up yet." };
  const { count } = await db
    .from("olb_teams")
    .select("id", { count: "exact", head: true })
    .eq("board_id", board.id);
  const { error } = await db
    .from("olb_teams")
    .insert({ ...cleanTeam(input), board_id: board.id, sort_order: (count ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function updateTeamSettings(
  id: string,
  input: TeamSettingsInput
): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!input.name.trim()) return { error: "Team name is required." };
  const db = await createClient();
  const { error } = await db
    .from("olb_teams")
    .update({ ...cleanTeam(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// Players on the team go back to No team yet; its volunteer
// assignments go with it.
export async function deleteTeam(id: string): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.from("olb_teams").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// ── Volunteer roles ──────────────────────────────────────────────────────

export async function createVolunteerRole(input: VolunteerRoleInput): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!input.name.trim()) return { error: "Role name is required." };
  const db = await createClient();
  const { data: last } = await db
    .from("olb_volunteer_roles")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db
    .from("olb_volunteer_roles")
    .insert({ ...cleanRole(input), sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10 });
  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function updateVolunteerRole(
  id: string,
  input: VolunteerRoleInput
): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!input.name.trim()) return { error: "Role name is required." };
  const db = await createClient();
  const { error } = await db
    .from("olb_volunteer_roles")
    .update({ ...cleanRole(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// Soft delete: the role drops off every team, and its assignments stop
// showing because loaders only read live roles.
export async function deleteVolunteerRole(id: string): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db
    .from("olb_volunteer_roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// Swap a role with its neighbour in the list.
export async function moveVolunteerRole(id: string, direction: "up" | "down"): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data } = await db
    .from("olb_volunteer_roles")
    .select("id, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const rows = (data as { id: string; sort_order: number }[] | null) ?? [];
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return {};
  // Renumber the whole list so ties can't make a swap a no-op.
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j], order[i]];
  const results = await Promise.all(
    order.map((rid, n) => db.from("olb_volunteer_roles").update({ sort_order: (n + 1) * 10 }).eq("id", rid))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidate();
  return {};
}

// ── Filling a team's roles ───────────────────────────────────────────────

export async function assignVolunteer(
  teamId: string,
  roleId: string,
  memberId: string
): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const [{ data: role }, { count }] = await Promise.all([
    db.from("olb_volunteer_roles").select("spots_per_team").eq("id", roleId).is("deleted_at", null).maybeSingle(),
    db
      .from("olb_team_volunteers")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("role_id", roleId),
  ]);
  if (!role) return { error: "That role no longer exists." };
  if ((count ?? 0) >= (role.spots_per_team as number)) {
    return { error: "Every spot for this role is already filled." };
  }
  const { error } = await db
    .from("olb_team_volunteers")
    .insert({ team_id: teamId, role_id: roleId, member_id: memberId, created_by: gate.userId });
  if (error) {
    if (error.code === "23505") return { error: "They're already in this role on this team." };
    return { error: error.message };
  }
  revalidate();
  return {};
}

export async function removeVolunteer(assignmentId: string): Promise<VolunteerActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.from("olb_team_volunteers").delete().eq("id", assignmentId);
  if (error) return { error: error.message };
  revalidate();
  return {};
}
