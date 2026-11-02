"use server";
// Team Playbook: add a play from a video, edit, share and delete plays.
// Coaches, the board and Teams & volunteers (requirePlaybookEditor); RLS
// checks the same people again (can_edit_playbook(), 0162).

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { createSignedTusUpload } from "../film/tus-create.ts";
import { tusEndpoint } from "../film/tus.ts";
import { blankDiagram, normalizeDiagram } from "./diagram.ts";
import { PLAY_COLS, requirePlaybookEditor, toTeamPlays } from "./data";
import { advancePlay, readPlay, startTranscription } from "./pipeline";
import { FRAME_COUNT, MAX_VIDEO_BYTES, PLAYBOOK_BUCKET, type PlayEdit, type TeamPlay } from "./types.ts";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const PATH = "/portal/team-playbook";

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanLink(s: unknown): string {
  const v = clean(s, 500);
  return /^https:\/\//i.test(v) ? v : "";
}

function uuidList(v: unknown): string[] {
  const re = /^[0-9a-f-]{36}$/i;
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && re.test(x)))] : [];
}

async function onePlay(id: string): Promise<TeamPlay | null> {
  const db = await createClient();
  const { data } = await db.from("team_plays").select(PLAY_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [play] = await toTeamPlays([data as Parameters<typeof toTeamPlays>[0][number]]);
  return play;
}

export interface VideoUploadStart {
  playId: string;
  endpoint: string;
  token: string;
  uploadUrl: string;
  frames: { path: string; token: string }[];
}

// Step 1: a row for the play, a resumable upload for the video (the phone
// sends the bytes straight to Storage) and one signed upload per still.
export async function startVideoUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  frameCount: number;
}): Promise<Result<VideoUploadStart>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return { error: "That file is empty." };
  if (size > MAX_VIDEO_BYTES) return { error: "That video is over 2 GB. Trim it to just the play and try again." };
  const contentType = /^video\/[\w.+-]+$/.test(input.contentType) ? input.contentType : "video/mp4";
  const ext = (clean(input.fileName, 200).match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "mp4").toLowerCase();

  const db = await createClient();
  const { data: row, error } = await db
    .from("team_plays")
    .insert({ status: "uploading", video_name: clean(input.fileName, 200), created_by: gate.userId })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Couldn't start the play." };
  const playId = row.id as string;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
    const admin = createAdminClient();
    const bucket = admin.storage.from(PLAYBOOK_BUCKET);
    const videoPath = `plays/${playId}/video.${ext}`;
    const { data: signed, error: signErr } = await bucket.createSignedUploadUrl(videoPath);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Couldn't start the upload.");
    const endpoint = tusEndpoint(url);
    const uploadUrl = await createSignedTusUpload({
      endpoint,
      token: signed.token,
      path: signed.path,
      contentType,
      sizeBytes: size,
      bucket: PLAYBOOK_BUCKET,
    });
    const frames: VideoUploadStart["frames"] = [];
    const count = Math.max(0, Math.min(FRAME_COUNT, Math.floor(Number(input.frameCount) || 0)));
    for (let i = 0; i < count; i++) {
      const path = `plays/${playId}/frame-${i + 1}.jpg`;
      const { data: f, error: fErr } = await bucket.createSignedUploadUrl(path);
      if (fErr || !f) throw new Error(fErr?.message ?? "Couldn't start the upload.");
      frames.push({ path: f.path, token: f.token });
    }
    await db.from("team_plays").update({ video_path: videoPath }).eq("id", playId);
    return { playId, endpoint, token: signed.token, uploadUrl, frames };
  } catch (err) {
    await db.from("team_plays").delete().eq("id", playId);
    return { error: err instanceof Error ? err.message : "Couldn't start the upload." };
  }
}

// Step 2, once the video and stills are up: save what the coach typed in and
// start reading the play. The reading carries on after the response.
export async function finishVideoUpload(
  playId: string,
  input: {
    name: string;
    call_name: string;
    team_ids: string[];
    coach_name: string;
    video_link: string;
    duration_sec: number | null;
    frames: { path: string; sec: number }[];
  },
): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const prefix = `plays/${playId}/frame-`;
  const frames = (Array.isArray(input.frames) ? input.frames : [])
    .filter((f) => typeof f?.path === "string" && f.path.startsWith(prefix) && Number.isFinite(f.sec))
    .slice(0, FRAME_COUNT)
    .map((f) => ({ path: f.path, sec: Math.round(f.sec * 10) / 10 }));
  const duration = Number(input.duration_sec);
  const db = await createClient();
  const { data, error } = await db
    .from("team_plays")
    .update({
      name: clean(input.name, 80),
      call_name: clean(input.call_name, 40),
      team_ids: uuidList(input.team_ids),
      coach_name: clean(input.coach_name, 80),
      video_link: cleanLink(input.video_link),
      duration_sec: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 10) / 10 : null,
      frame_paths: frames,
      status: "transcribing",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playId)
    .eq("status", "uploading")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That upload was already finished. Refresh the page." };
  after(() => startTranscription(playId));
  revalidatePath(PATH);
  const play = await onePlay(playId);
  return play ? { play } : { error: "Couldn't load the play." };
}

// The page asks while a play is being read; moves it along if it can.
export async function checkPlay(playId: string): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  await advancePlay(playId);
  const play = await onePlay(playId);
  return play ? { play } : { error: "That play is gone." };
}

// Read the video again (a failed read, or a bad draft). The coach's words
// don't change, so a play that already has them goes straight back to being
// read; only a play that never got its words is transcribed again.
export async function rereadPlay(playId: string): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data: row } = await db.from("team_plays").select("transcript").eq("id", playId).maybeSingle();
  const haveWords = Array.isArray((row as { transcript?: unknown } | null)?.transcript);
  const patch = haveWords
    ? { status: "reading", error: null }
    : { status: "transcribing", error: null, assemblyai_id: null, transcript: null };
  const { data, error } = await db
    .from("team_plays")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", playId)
    .in("status", ["failed", "draft"])
    .not("video_path", "is", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only a draft or a failed play with a video can be read again." };
  after(() => (haveWords ? readPlay(playId) : startTranscription(playId)));
  const play = await onePlay(playId);
  return play ? { play } : { error: "That play is gone." };
}

// A play typed in by hand, without a video.
export async function createBlankPlay(): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("team_plays")
    .insert({ status: "draft", name: "New play", diagram: blankDiagram(), created_by: gate.userId })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add the play." };
  revalidatePath(PATH);
  const play = await onePlay(data.id as string);
  return play ? { play } : { error: "Couldn't load the play." };
}

export async function savePlay(playId: string, edit: PlayEdit): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const diagram = normalizeDiagram(edit.diagram);
  if (!diagram) return { error: "A play needs at least one player and one step." };
  const db = await createClient();
  const { data, error } = await db
    .from("team_plays")
    .update({
      name: clean(edit.name, 80) || "Untitled play",
      call_name: clean(edit.call_name, 40),
      category: clean(edit.category, 60),
      team_ids: uuidList(edit.team_ids),
      coach_name: clean(edit.coach_name, 80),
      video_link: cleanLink(edit.video_link),
      diagram,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playId)
    .in("status", ["draft", "shared"])
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That play can't be saved right now. Refresh the page." };
  revalidatePath(PATH);
  const play = await onePlay(playId);
  return play ? { play } : { error: "Couldn't load the play." };
}

// Share with the team (every approved member sees it), or take it back to a draft.
export async function setPlayShared(playId: string, shared: boolean): Promise<Result<{ play: TeamPlay }>> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("team_plays")
    .update({
      status: shared ? "shared" : "draft",
      shared_at: shared ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playId)
    .in("status", shared ? ["draft"] : ["shared"])
    .not("diagram", "is", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That play isn't ready to share. Refresh the page." };
  revalidatePath(PATH);
  const play = await onePlay(playId);
  return play ? { play } : { error: "Couldn't load the play." };
}

export async function deletePlay(playId: string): Promise<Result> {
  const gate = await requirePlaybookEditor();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db.from("team_plays").delete().eq("id", playId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That play is already gone." };
  try {
    const admin = createAdminClient();
    const bucket = admin.storage.from(PLAYBOOK_BUCKET);
    const { data: files } = await bucket.list(`plays/${playId}`);
    if (files?.length) await bucket.remove(files.map((f) => `plays/${playId}/${f.name}`));
  } catch {
    // The play is gone; a leftover file only takes space.
  }
  revalidatePath(PATH);
  return {};
}
