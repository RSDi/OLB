"use server";
// Streamed games on /portal/film (0179): add a livestream as a game, attach
// or detach the recording that replaces it, and move the stream's jump-to
// points onto the recording. Manage permission (film_manage), like Edit.

import { revalidatePath } from "next/cache";
import { requireFilmManage } from "../auth/guards";
import { createAdminClient } from "../supabase/admin.ts";
import { churchToday } from "../dates/today.ts";
import { parseFilmGameFields } from "./game-meta.ts";
import { EVENT_NAME_MAX, cleanEventName } from "./watch.ts";
import { parseYoutubeVideoId, shiftStreamMarkers } from "./streams.ts";
import { parseTimecode } from "./player-logic.ts";
import { getFilmTeamById } from "./teams.ts";
import { getFilmUpload, getStreamRecording, insertStreamedGame, setReplacesStream } from "./uploads.ts";
import { listFilmMarkers, moveFilmMarkers } from "./markers.ts";
import { syncYoutubeVideoStatus } from "./youtube-status.ts";
import { after } from "next/server";

function refresh() {
  revalidatePath("/portal/film");
  revalidatePath("/portal/film/status");
}

async function memberName(userId: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("members").select("full_name, nickname").eq("user_id", userId).maybeSingle();
    const row = data as { full_name: string | null; nickname: string | null } | null;
    return row?.nickname?.trim() || row?.full_name?.trim() || "Staff";
  } catch {
    return "Staff";
  }
}

export async function addStreamedGame(input: {
  teamId: unknown;
  link: unknown;
  gameDate: unknown;
  opponent: unknown;
  ourScore: unknown;
  theirScore: unknown;
  eventName: unknown;
}): Promise<{ error?: string; id?: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const videoId = parseYoutubeVideoId(input.link);
  if (!videoId) return { error: "Paste the YouTube link of the stream (youtube.com/live/… or youtu.be/…)." };
  if (typeof input.teamId !== "string" || !input.teamId) return { error: "Pick the team." };
  const team = await getFilmTeamById(input.teamId);
  if (!team) return { error: "That team isn't there any more." };
  const parsed = parseFilmGameFields(input, churchToday(), { emptyDate: "error" });
  if (!parsed.ok) return { error: parsed.error };
  const cleaned = cleanEventName(input.eventName);
  if (!cleaned.ok) return { error: `Keep the tournament name under ${EVENT_NAME_MAX} characters.` };

  const admin = createAdminClient();
  const { data: dupe } = await admin
    .from("game_film_uploads")
    .select("id")
    .eq("youtube_video_id", videoId)
    .limit(1)
    .maybeSingle();
  if (dupe) return { error: "That video is already on Film." };

  let row;
  try {
    row = await insertStreamedGame({
      team: team.slug,
      teamId: team.id,
      addedBy: await memberName(gate.userId),
      videoId,
      gameDate: parsed.gameDate,
      opponent: parsed.opponent,
      ourScore: parsed.ourScore,
      theirScore: parsed.theirScore,
      eventName: cleaned.value,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't add the streamed game." };
  }
  // Read its privacy from YouTube now, so a private stream shows as one.
  after(async () => {
    try {
      await syncYoutubeVideoStatus({ videoIds: [videoId], force: true });
    } catch {
      // The regular status sync picks it up.
    }
  });
  refresh();
  return { id: row.id };
}

/** Attach a recording to a streamed game of the same team, or detach it (null). */
export async function setRecordingStream(
  recordingId: string,
  streamId: string | null
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const rec = await getFilmUpload(recordingId);
  if (!rec) return { error: "That upload isn't there any more." };
  if (rec.streamed) return { error: "That's a stream, not a recording." };
  if (streamId) {
    const stream = await getFilmUpload(streamId);
    if (!stream || !stream.streamed) return { error: "That streamed game isn't there any more." };
    if (stream.team_id !== rec.team_id) return { error: "Pick a streamed game from the same team." };
    const other = await getStreamRecording(streamId);
    if (other && other.id !== rec.id) return { error: "Another recording already replaces that stream." };
  }
  try {
    await setReplacesStream(recordingId, streamId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save." };
  }
  refresh();
  return { ok: true };
}

/**
 * Move the stream's jump-to points onto its recording. Each moves by the gap
 * between the tip-off times ("6:41" in the stream, "0:54" in the recording).
 */
export async function lineUpStreamMarkers(
  recordingId: string,
  input: { streamTipOff: unknown; recordingTipOff: unknown }
): Promise<{ error?: string; moved?: number; dropped?: number }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const rec = await getFilmUpload(recordingId);
  if (!rec || !rec.replaces_stream_id) return { error: "That recording doesn't replace a stream." };
  const streamTip = typeof input.streamTipOff === "string" ? parseTimecode(input.streamTipOff) : null;
  const recTip = typeof input.recordingTipOff === "string" ? parseTimecode(input.recordingTipOff) : null;
  if (streamTip == null || recTip == null) return { error: "Type both tip-off times, like 6:41." };
  let markers;
  try {
    markers = (await listFilmMarkers([rec.replaces_stream_id]))[rec.replaces_stream_id] ?? [];
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read the stream's jump-to points." };
  }
  if (markers.length === 0) return { error: "The stream has no jump-to points to move." };
  const { moved, dropped } = shiftStreamMarkers(markers, streamTip, recTip);
  const keep = new Set(moved.map((m) => m.id));
  try {
    await moveFilmMarkers({
      fromUploadId: rec.replaces_stream_id,
      toUploadId: rec.id,
      markers: moved,
      dropIds: markers.filter((m) => !keep.has(m.id)).map((m) => m.id),
      createdBy: gate.userId,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't move the jump-to points." };
  }
  refresh();
  return { moved: moved.length, dropped };
}
