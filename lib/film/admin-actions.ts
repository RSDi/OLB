"use server";
// Coach inbox mutations for /portal/film. View vs manage is the Game film
// permissions (film_view / film_manage). Super-admins hold both.

import { revalidatePath } from "next/cache";
import { filmFileErrorMessage } from "./file-error.ts";
import { requireFilmAccess, requireFilmManage } from "../auth/guards";
import { SIGNED_DOWNLOAD_TTL_S } from "./types.ts";
import { filmStorage } from "./storage.ts";
import { churchToday } from "../dates/today.ts";
import { parseFilmGameFields } from "./game-meta.ts";
import { EVENT_NAME_MAX, cleanEventName } from "./watch.ts";
import { parseFilmPart } from "./parts.ts";
import { parseFilmLinks, type FilmLink } from "./links.ts";
import { replaceFilmLinks } from "./links-data.ts";
import { parseFilmLineupPlayerIds, saveGameLineup } from "./lineups.ts";
import {
  attachToMatchingStream,
  deleteFilmUploadRow,
  getFilmUpload,
  setFilmStatus,
  updateFilmUploadGame,
  updateFilmUploadPlaylist,
} from "./uploads.ts";
import { parseYoutubePlaylistId } from "./youtube-meta.ts";
import { deleteFilmMarkerRow, insertFilmMarker } from "./markers.ts";
import { parseMarkerInput, type FilmMarker } from "./player-logic.ts";
import { processYoutubeQueue, queuePlaylistIfNeeded, retryPlaylistAdd, YOUTUBE_KICK_BUDGET_MS } from "./youtube.ts";
import { after } from "next/server";

function refresh() {
  revalidatePath("/portal/film");
  revalidatePath("/portal/film/status");
}

export async function signedFilmDownload(
  id: string
): Promise<{ url?: string; filename?: string; error?: string }> {
  const gate = await requireFilmAccess();
  if ("error" in gate) return { error: gate.error };
  const row = await getFilmUpload(id);
  if (!row) return { error: "That upload isn't there any more." };
  if (!gate.allTeams && (!row.team_id || !gate.teamIds.includes(row.team_id))) {
    return { error: "You don't have permission to download that team's film." };
  }
  if (row.file_deleted_at) {
    return { error: "The original file was removed after it went to YouTube. Watch it on YouTube." };
  }
  try {
    const url = await filmStorage().signedDownloadUrl(row.storage_path, SIGNED_DOWNLOAD_TTL_S);
    return { url, filename: row.filename };
  } catch (err) {
    return { error: filmFileErrorMessage(err, row.filename) };
  }
}

export async function markFilmMoved(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await setFilmStatus(id, "moved");
  if (!row) return { error: "That upload isn't there any more." };
  refresh();
  return { ok: true };
}

export async function restoreFilmHolding(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await setFilmStatus(id, "holding");
  if (!row) return { error: "That upload isn't there any more." };
  refresh();
  return { ok: true };
}

export async function updateFilmGameFields(
  id: string,
  input: {
    gameDate?: unknown;
    opponent?: unknown;
    ourScore?: unknown;
    theirScore?: unknown;
    playerIds?: unknown;
    eventName?: unknown;
    /** Edit showed the "Replaces streamed game" field: leave the link to it. */
    keepStream?: boolean;
    part?: unknown;
  }
): Promise<{
  error?: string;
  ok?: true;
  upload?: {
    game_date: string | null;
    opponent: string | null;
    our_score: number | null;
    their_score: number | null;
    event_name: string | null;
    part: string | null;
  };
}> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That upload isn't there any more." };
  const parsed = parseFilmGameFields(input, churchToday(), { emptyDate: "error" });
  if (!parsed.ok) return { error: parsed.error };
  const lineup = Object.prototype.hasOwnProperty.call(input, "playerIds")
    ? parseFilmLineupPlayerIds(input.playerIds)
    : null;
  if (lineup && !lineup.ok) return { error: lineup.error };
  let eventName: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(input, "eventName")) {
    const cleaned = cleanEventName(input.eventName);
    if (!cleaned.ok) return { error: `Keep the tournament name under ${EVENT_NAME_MAX} characters.` };
    eventName = cleaned.value;
  }
  let part: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(input, "part")) {
    const picked = parseFilmPart(input.part);
    if (!picked.ok) return { error: picked.error };
    part = picked.part;
  }
  const before = await getFilmUpload(id);
  const row = await updateFilmUploadGame(id, { ...parsed, eventName, part });
  if (!row) return { error: "That upload isn't there any more." };
  // A recording whose new date or opponent matches a streamed game takes its
  // place. Only on a change, so a coach who picked "None" on Edit keeps it.
  if (!input.keepStream && before && (before.game_date !== row.game_date || (before.opponent ?? "") !== (row.opponent ?? ""))) {
    try {
      await attachToMatchingStream(row);
    } catch {
      // A coach can still pick the stream on Edit.
    }
  }
  if (lineup && row.team_id && row.game_date) {
    try {
      await saveGameLineup(row.team_id, row.game_date, row.opponent, lineup.ids);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't save who played." };
    }
  }
  refresh();
  return {
    ok: true,
    upload: {
      game_date: row.game_date,
      opponent: row.opponent,
      our_score: row.our_score,
      their_score: row.their_score,
      event_name: row.event_name,
      part: row.part,
    },
  };
}

export async function updateFilmPlaylistOverride(
  id: string,
  raw: unknown
): Promise<{ error?: string; ok?: true; youtube_playlist_id?: string | null }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That upload isn't there any more." };
  const parsed = parseYoutubePlaylistId(raw);
  if (!parsed.ok) return { error: parsed.error };
  const row = await updateFilmUploadPlaylist(id, parsed.id);
  if (!row) return { error: "That upload isn't there any more." };
  if (row.youtube_status === "done" && row.youtube_video_id && parsed.id) {
    try {
      await retryPlaylistAdd(id);
      after(() => {
        void processYoutubeQueue({ budgetMs: YOUTUBE_KICK_BUDGET_MS, uploadId: id });
      });
    } catch {
      await queuePlaylistIfNeeded(id);
    }
  }
  refresh();
  return { ok: true, youtube_playlist_id: row.youtube_playlist_id };
}

/** Replace a game video's links (each a link and a note), in this order. */
export async function saveFilmLinks(
  id: string,
  raw: unknown
): Promise<{ error?: string; ok?: true; links?: FilmLink[] }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That upload isn't there any more." };
  const parsed = parseFilmLinks(raw);
  if (!parsed.ok) return { error: parsed.error };
  const row = await getFilmUpload(id);
  if (!row) return { error: "That upload isn't there any more." };
  try {
    const links = await replaceFilmLinks(id, parsed.links, gate.userId ?? null);
    refresh();
    return { ok: true, links };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the links." };
  }
}

export async function deleteFilmUpload(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await deleteFilmUploadRow(id);
  if (!row) return { error: "That upload isn't there any more." };
  try {
    await filmStorage().deleteObject(row.storage_path);
  } catch {
    // Row is gone; a missing object is fine.
  }
  refresh();
  return { ok: true };
}


export async function addFilmMarker(
  uploadId: string,
  input: { atSeconds: unknown; label: unknown }
): Promise<{ error?: string; marker?: FilmMarker }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await getFilmUpload(uploadId);
  if (!row) return { error: "That upload isn't there any more." };
  const parsed = parseMarkerInput(input);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const marker = await insertFilmMarker({
      uploadId,
      atSeconds: parsed.atSeconds,
      label: parsed.label,
      createdBy: gate.userId,
    });
    return { marker };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the marker." };
  }
}

export async function removeFilmMarker(id: string): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const row = await deleteFilmMarkerRow(id);
    if (!row) return { error: "That marker isn't there any more." };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't remove the marker." };
  }
}
