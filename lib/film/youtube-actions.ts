"use server";
// Settings → Film YouTube connection and inbox retry. film_manage only.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireFilmManage } from "../auth/guards";
import { youtubeOAuthConfigured } from "./youtube-oauth.ts";
import {
  disconnectYoutube,
  getYoutubeConnection,
  saveYoutubePrefs,
  type YoutubeConnection,
} from "./youtube-settings.ts";
import type { YoutubePrivacy } from "./youtube-meta.ts";
import { processYoutubeQueue, retryYoutubeUpload, YOUTUBE_KICK_BUDGET_MS } from "./youtube.ts";

function refresh() {
  revalidatePath("/portal/film");
  revalidatePath("/portal/settings");
}

export async function loadYoutubeSettings(): Promise<
  { error: string } | { configured: boolean; connection: YoutubeConnection }
> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  try {
    const connection = await getYoutubeConnection();
    return { configured: youtubeOAuthConfigured(), connection };
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
