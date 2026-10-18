// Slack drafts for game film. Created after a video lands on YouTube.
// Nothing posts until an admin taps Approve in Portal → Film.

import { createAdminClient } from "../supabase/admin.ts";
import { teamLabel } from "../teams/volunteer-options.ts";
import type { FilmSlackDraft, FilmSlackDraftStatus, FilmSlackDraftView } from "./types.ts";

export const FILM_SLACK_DRAFT_COLUMNS =
  "id, upload_id, team_id, channel_id, body, status, slack_ts, posted_channel_id, posted_at, posted_by, created_at, updated_at";

const STALE_POSTING_MS = 2 * 60 * 1000;

type DraftRow = FilmSlackDraft;

export function parseFilmSlackChannelId(raw: unknown): { ok: true; id: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, id: null };
  if (typeof raw !== "string") return { ok: false, error: "Paste a Slack channel ID, like C0123456789." };
  const s = raw.trim();
  if (!s) return { ok: true, id: null };
  if (/^#[A-Za-z0-9_-]+$/.test(s)) {
    return { ok: false, error: "Use the channel ID (starts with C), not the #name." };
  }
  if (!/^[CG][A-Z0-9]{8,}$/i.test(s)) {
    return { ok: false, error: "That doesn't look like a Slack channel ID. It usually starts with C." };
  }
  return { ok: true, id: s };
}

export async function listPendingFilmSlackDrafts(teamIds?: string[]): Promise<FilmSlackDraft[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_slack_drafts")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .in("status", ["pending", "posting"])
    .order("created_at", { ascending: false });
  if (teamIds) {
    if (teamIds.length === 0) return [];
    query = query.in("team_id", teamIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data as DraftRow[] | null) ?? []).filter((row) => row.status === "pending" || isStalePosting(row));
}

export async function listPendingFilmSlackDraftViews(teamIds?: string[]): Promise<FilmSlackDraftView[]> {
  const drafts = await listPendingFilmSlackDrafts(teamIds);
  if (drafts.length === 0) return [];
  const admin = createAdminClient();
  const uploadIds = [...new Set(drafts.map((d) => d.upload_id))];
  const teamIdList = [...new Set(drafts.map((d) => d.team_id).filter((id): id is string => !!id))];
  const [{ data: uploads }, { data: teams }] = await Promise.all([
    admin.from("game_film_uploads").select("id, filename, team").in("id", uploadIds),
    teamIdList.length
      ? admin.from("olb_teams").select("id, name, age_group, film_slug").in("id", teamIdList)
      : Promise.resolve({ data: [] as { id: string; name: string; age_group: string | null; film_slug: string | null }[] }),
  ]);
  const uploadById = new Map(
    ((uploads as { id: string; filename: string; team: string }[] | null) ?? []).map((u) => [u.id, u])
  );
  const teamById = new Map(
    ((teams as { id: string; name: string; age_group: string | null; film_slug: string | null }[] | null) ?? []).map((t) => [
      t.id,
      t,
    ])
  );
  return drafts.map((draft) => {
    const upload = uploadById.get(draft.upload_id);
    const team = draft.team_id ? teamById.get(draft.team_id) : undefined;
    return {
      ...draft,
      filename: upload?.filename || "Film",
      team_label: team ? teamLabel(team) : upload?.team || "Team",
      team_slug: team?.film_slug || upload?.team || "",
    };
  });
}

export async function getFilmSlackDraft(id: string): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow | null) ?? null;
}

export async function getFilmSlackDraftByUpload(uploadId: string): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow | null) ?? null;
}

export async function createFilmSlackDraftIfNeeded(input: {
  uploadId: string;
  teamId: string | null;
  channelId: string | null;
  body: string;
}): Promise<FilmSlackDraft | null> {
  const body = input.body.trim();
  if (!body) return null;
  const existing = await getFilmSlackDraftByUpload(input.uploadId);
  if (existing?.status === "posted" || existing?.status === "discarded") return existing;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (existing) {
    const { data, error } = await admin
      .from("game_film_slack_drafts")
      .update({
        team_id: input.teamId,
        channel_id: input.channelId,
        body,
        status: "pending",
        updated_at: now,
      })
      .eq("id", existing.id)
      .in("status", ["pending", "posting"])
      .select(FILM_SLACK_DRAFT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DraftRow | null) ?? existing;
  }
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .insert({
      upload_id: input.uploadId,
      team_id: input.teamId,
      channel_id: input.channelId,
      body,
      status: "pending",
    })
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return getFilmSlackDraftByUpload(input.uploadId);
    throw new Error(error.message);
  }
  return data as DraftRow;
}

export async function updateFilmSlackDraftBody(id: string, body: string): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow | null) ?? null;
}

export async function discardFilmSlackDraft(id: string): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "posting"])
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow | null) ?? null;
}

export async function claimFilmSlackDraft(
  id: string,
  userId: string,
  now = new Date()
): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const stamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_POSTING_MS).toISOString();
  const { data: pending, error: pendingError } = await admin
    .from("game_film_slack_drafts")
    .update({
      status: "posting",
      posted_by: userId,
      updated_at: stamp,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .maybeSingle();
  if (pendingError) throw new Error(pendingError.message);
  if (pending) return pending as DraftRow;
  const { data: stale, error } = await admin
    .from("game_film_slack_drafts")
    .update({
      status: "posting",
      posted_by: userId,
      updated_at: stamp,
    })
    .eq("id", id)
    .eq("status", "posting")
    .lt("updated_at", staleBefore)
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (stale as DraftRow | null) ?? null;
}

export async function markFilmSlackDraftPosted(
  id: string,
  posted: { ts: string; channel: string }
): Promise<FilmSlackDraft | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("game_film_slack_drafts")
    .update({
      status: "posted",
      slack_ts: posted.ts,
      posted_channel_id: posted.channel,
      posted_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "posting")
    .select(FILM_SLACK_DRAFT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow | null) ?? null;
}

export async function revertFilmSlackDraftClaim(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_film_slack_drafts")
    .update({
      status: "pending",
      posted_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "posting");
  if (error) throw new Error(error.message);
}

function isStalePosting(row: Pick<FilmSlackDraft, "status" | "updated_at">): boolean {
  if (row.status !== "posting") return false;
  return Date.now() - new Date(row.updated_at).getTime() > STALE_POSTING_MS;
}

export type { FilmSlackDraftStatus };
