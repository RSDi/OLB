"use server";
// Settings → Film YouTube connection and inbox retry. film_manage only.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireFilmManage } from "../auth/guards";
import { refreshYoutubeAccess, youtubeOAuthConfigured } from "./youtube-oauth.ts";
import {
  disconnectYoutube,
  getYoutubeConnection,
  getYoutubeConnectionSecret,
  saveYoutubePrefs,
  type YoutubeConnection,
} from "./youtube-settings.ts";
import type { YoutubeChannelPlaylist, YoutubePrivacy } from "./youtube-meta.ts";
import { listYoutubeChannelPlaylists } from "./youtube-playlist.ts";
import { processYoutubeQueue, retryPlaylistAdd, retryYoutubeUpload, YOUTUBE_KICK_BUDGET_MS } from "./youtube.ts";

function refresh() {
  revalidatePath("/portal/film");
  revalidatePath("/portal/settings");
}

export async function loadYoutubeSettings(): Promise<
  | { error: string }
  | { configured: boolean; connection: YoutubeConnection; playlists: YoutubeChannelPlaylist[]; playlistError: string | null }
> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await getYoutubeConnection();
    let playlists: YoutubeChannelPlaylist[] = [];
    let playlistError: string | null = null;
    if (connection.connected && youtubeOAuthConfigured()) {
      try {
        const secret = await getYoutubeConnectionSecret();
        if (secret.refreshToken) {
          const access = await refreshYoutubeAccess(secret.refreshToken);
          playlists = await listYoutubeChannelPlaylists(access);
        }
      } catch (err) {
        playlistError =
          err instanceof Error
            ? err.message
            : "Couldn't list playlists. Disconnect and Connect YouTube again after adding the YouTube scope.";
      }
    }
    return { configured: youtubeOAuthConfigured(), connection, playlists, playlistError };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load YouTube settings." };
  }
}

export async function disconnectYoutubeChannel(): Promise<{ error?: string; connection?: YoutubeConnection }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await disconnectYoutube();
    refresh();
    return { connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't disconnect YouTube." };
  }
}

export async function saveYoutubeChannelPrefs(input: {
  privacyStatus: YoutubePrivacy;
  madeForKids: boolean;
}): Promise<{ error?: string; connection?: YoutubeConnection }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await saveYoutubePrefs(input);
    refresh();
    return { connection };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save YouTube settings." };
  }
}

export async function retryFilmPlaylist(id: string): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    await retryPlaylistAdd(id);
    after(() => {
      void processYoutubeQueue({ budgetMs: YOUTUBE_KICK_BUDGET_MS, uploadId: id });
    });
    refresh();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't retry the playlist." };
  }
}

export async function retryFilmYoutube(id: string): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    await retryYoutubeUpload(id);
    after(() => {
      void processYoutubeQueue({ budgetMs: YOUTUBE_KICK_BUDGET_MS, uploadId: id });
    });
    refresh();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't retry YouTube." };
  }
}
