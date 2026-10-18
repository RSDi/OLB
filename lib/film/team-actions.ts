"use server";
// Settings → Film: enable Directory teams for family uploads, set/rotate
// hashed codes, and assign per-team video managers.

import { revalidatePath } from "next/cache";
import { requireFilmManage } from "../auth/guards.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { teamLabel } from "../teams/volunteer-options.ts";
import {
  filmCodeProblem,
  filmCodeUsedByOther,
  generateFilmCode,
  hashFilmCode,
  normalizeFilmCode,
  pickUniqueFilmCode,
  suggestTeamWordCode,
} from "./codes.ts";
import {
  currentBoardId,
  filmSlugProblem,
  listDirectoryFilmTeams,
  slugifyFilmTeam,
  type FilmTeamRow,
} from "./teams.ts";
import { parseYoutubePlaylistId } from "./youtube-meta.ts";

function refresh() {
  revalidatePath("/portal/settings");
  revalidatePath("/portal/film");
  revalidatePath("/film");
}

export type FilmSettingsTeam = Omit<FilmTeamRow, "codeHash"> & {
  managers: { userId: string; name: string }[];
};

export type FilmMemberOption = { userId: string; name: string };

export async function loadFilmSettings(): Promise<
  { season: string | null; teams: FilmSettingsTeam[]; members: FilmMemberOption[] } | { error: string }
> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const [{ season, teams }, managerRows, memberRows] = await Promise.all([
      listDirectoryFilmTeams(),
      createAdminClient().from("game_film_managers").select("team_id, user_id"),
      createAdminClient()
        .from("members")
        .select("user_id, full_name, nickname")
        .eq("status", "approved")
        .not("user_id", "is", null)
        .order("full_name", { ascending: true }),
    ]);
    const members: FilmMemberOption[] = ((memberRows.data as { user_id: string; full_name: string | null; nickname: string | null }[] | null) ?? [])
      .filter((m) => m.user_id)
      .map((m) => ({
        userId: m.user_id,
        name: (m.nickname?.trim() || m.full_name?.trim() || "Member").trim(),
      }));
    const nameByUser = new Map(members.map((m) => [m.userId, m.name]));
    const managersByTeam = new Map<string, { userId: string; name: string }[]>();
    for (const row of (managerRows.data as { team_id: string; user_id: string }[] | null) ?? []) {
      const list = managersByTeam.get(row.team_id) ?? [];
      list.push({ userId: row.user_id, name: nameByUser.get(row.user_id) ?? "Member" });
      managersByTeam.set(row.team_id, list);
    }
    return {
      season,
      members,
      teams: teams.map((t) => ({
        id: t.id,
        boardId: t.boardId,
        slug: t.slug,
        label: t.label,
        enabled: t.enabled,
        hasCode: t.hasCode,
        hasSlug: t.hasSlug,
        codeVersion: t.codeVersion,
        suggestedCode: t.suggestedCode,
        youtubePlaylistId: t.youtubePlaylistId,
        managers: managersByTeam.get(t.id) ?? [],
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load film teams." };
  }
}

export async function addFilmTeam(name: string): Promise<{ error?: string; id?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the team a name." };
  const boardId = await currentBoardId();
  if (!boardId) return { error: "No season set up yet. Add one in Settings → Season first." };
  const admin = createAdminClient();
  const { count } = await admin.from("olb_teams").select("id", { count: "exact", head: true }).eq("board_id", boardId);
  const slug = await uniqueSlug(admin, slugifyFilmTeam(trimmed) || "team");
  const { data, error } = await admin
    .from("olb_teams")
    .insert({
      board_id: boardId,
      name: trimmed,
      sort_order: (count ?? 0) + 1,
      film_slug: slug,
      film_enabled: false,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  refresh();
  return { id: data.id as string };
}

export async function renameFilmTeam(id: string, name: string): Promise<{ error?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the team a name." };
  const admin = createAdminClient();
  const { error } = await admin.from("olb_teams").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function saveFilmTeamPage(
  id: string,
  input: { slug: string; enabled: boolean }
): Promise<{ error?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const slug = input.slug.trim().toLowerCase();
  const problem = filmSlugProblem(slug);
  if (problem) return { error: problem };
  const admin = createAdminClient();
  const { data: clash } = await admin.from("olb_teams").select("id").eq("film_slug", slug).neq("id", id).maybeSingle();
  if (clash) return { error: `/${slug} is already used by another team.` };
  const { data: row } = await admin.from("olb_teams").select("film_code_hash").eq("id", id).maybeSingle();
  if (!row) return { error: "That team isn't there any more." };
  if (input.enabled && !(row as { film_code_hash: string | null }).film_code_hash) {
    return { error: "Set an upload code before turning the family page on." };
  }
  const { error } = await admin
    .from("olb_teams")
    .update({
      film_slug: slug,
      film_enabled: input.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

async function otherTeamCodeHashes(exceptId: string): Promise<{ id: string; codeHash: string | null }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("olb_teams").select("id, film_code_hash").neq("id", exceptId);
  if (error) throw new Error(error.message);
  return ((data as { id: string; film_code_hash: string | null }[] | null) ?? []).map((row) => ({
    id: row.id,
    codeHash: row.film_code_hash,
  }));
}

export async function saveFilmTeamPlaylist(
  id: string,
  raw: string
): Promise<{ error?: string; youtubePlaylistId?: string | null }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const parsed = parseYoutubePlaylistId(raw);
  if (!parsed.ok) return { error: parsed.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("olb_teams")
    .update({
      youtube_playlist_id: parsed.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { youtubePlaylistId: parsed.id };
}

export async function setFilmTeamCode(
  id: string,
  code: string
): Promise<{ error?: string; code?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const problem = filmCodeProblem(code);
  if (problem) return { error: problem };
  const plaintext = normalizeFilmCode(code);
  const admin = createAdminClient();
  const { data: row } = await admin.from("olb_teams").select("id, film_code_version").eq("id", id).maybeSingle();
  if (!row) return { error: "That team isn't there any more." };
  try {
    const others = await otherTeamCodeHashes(id);
    if (filmCodeUsedByOther(others, id, plaintext)) {
      return { error: "Another team already uses that code. Pick a different word." };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't check that code." };
  }
  const version = ((row as { film_code_version: number | null }).film_code_version ?? 1) + 1;
  const { error } = await admin
    .from("olb_teams")
    .update({
      film_code_hash: hashFilmCode(id, plaintext),
      film_code_version: version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { code: plaintext };
}

export async function generateAndSetFilmTeamCode(id: string): Promise<{ error?: string; code?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const others = await otherTeamCodeHashes(id);
    const taken = (code: string) => filmCodeUsedByOther(others, id, code);
    return setFilmTeamCode(id, pickUniqueFilmCode(generateFilmCode(), taken));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't make a code." };
  }
}

export async function suggestFilmCode(teamId: string): Promise<{ error?: string; code?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  if (!teamId) return { error: "Pick a team." };
  const admin = createAdminClient();
  const { data: row } = await admin.from("olb_teams").select("id, name, age_group").eq("id", teamId).maybeSingle();
  if (!row) return { error: "That team isn't there any more." };
  try {
    const others = await otherTeamCodeHashes(teamId);
    const taken = (code: string) => filmCodeUsedByOther(others, teamId, code);
    const base = suggestTeamWordCode({
      name: (row as { name: string }).name,
      ageGroup: (row as { age_group: string | null }).age_group,
    });
    return { code: pickUniqueFilmCode(base, taken) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't suggest a code." };
  }
}

export async function addFilmManager(teamId: string, userId: string): Promise<{ error?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  if (!userId) return { error: "Pick someone." };
  const admin = createAdminClient();
  const { error } = await admin.from("game_film_managers").insert({ team_id: teamId, user_id: userId });
  if (error) {
    if (error.code === "23505") return { error: "They're already a video manager for this team." };
    return { error: error.message };
  }
  refresh();
  return {};
}

export async function removeFilmManager(teamId: string, userId: string): Promise<{ error?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();
  const { error } = await admin.from("game_film_managers").delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

async function uniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  base: string
): Promise<string> {
  const root = (base || "team").slice(0, 36);
  for (let n = 0; n < 20; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const { data } = await admin.from("olb_teams").select("id").eq("film_slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`.slice(0, 40);
}

export { teamLabel };
