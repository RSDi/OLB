// Club YouTube connection row. Service-role only. The refresh token is
// encrypted with FILM_YOUTUBE_TOKEN_KEY before insert.

import { createAdminClient } from "../supabase/admin.ts";
import { decryptSecret, encryptSecret, youtubeTokenKey } from "./crypto.ts";
import type { YoutubeConnection, YoutubePrivacy } from "./youtube-meta.ts";

export type { YoutubeConnection, YoutubePrivacy };

export type YoutubeConnectionSecret = YoutubeConnection & {
  refreshToken: string | null;
};

const COLS =
  "id, refresh_token_enc, channel_id, channel_title, connected_at, connected_by, privacy_status, made_for_kids, updated_at";

type Row = {
  refresh_token_enc: string | null;
  channel_id: string | null;
  channel_title: string | null;
  connected_at: string | null;
  privacy_status: YoutubePrivacy;
  made_for_kids: boolean;
};

function publicView(row: Row | null): YoutubeConnection {
  return {
    connected: Boolean(row?.refresh_token_enc),
    channelId: row?.channel_id ?? null,
    channelTitle: row?.channel_title ?? null,
    connectedAt: row?.connected_at ?? null,
    privacyStatus: row?.privacy_status === "private" || row?.privacy_status === "public" ? row.privacy_status : "unlisted",
    madeForKids: Boolean(row?.made_for_kids),
  };
}

async function loadRow(): Promise<Row | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("game_film_youtube").select(COLS).eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row | null) ?? null;
}

export async function getYoutubeConnection(): Promise<YoutubeConnection> {
  return publicView(await loadRow());
}

export async function getYoutubeConnectionSecret(
  env: Record<string, string | undefined> = process.env
): Promise<YoutubeConnectionSecret> {
  const row = await loadRow();
  const pub = publicView(row);
  if (!row?.refresh_token_enc) return { ...pub, refreshToken: null };
  const token = decryptSecret(row.refresh_token_enc, youtubeTokenKey(env));
  return { ...pub, refreshToken: token };
}

export async function saveYoutubeConnection(input: {
  refreshToken: string;
  channelId: string | null;
  channelTitle: string | null;
  connectedBy: string;
  env?: Record<string, string | undefined>;
}): Promise<YoutubeConnection> {
  const env = input.env ?? process.env;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube")
    .update({
      refresh_token_enc: encryptSecret(input.refreshToken, youtubeTokenKey(env)),
      channel_id: input.channelId,
      channel_title: input.channelTitle,
      connected_at: new Date().toISOString(),
      connected_by: input.connectedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube connection.");
  await recordYoutubeWorkerHealth(null);
  return publicView(data as Row);
}

export async function disconnectYoutube(): Promise<YoutubeConnection> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube")
    .update({
      refresh_token_enc: null,
      channel_id: null,
      channel_title: null,
      connected_at: null,
      connected_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't disconnect YouTube.");
  return publicView(data as Row);
}

export async function saveYoutubePrefs(input: {
  privacyStatus: YoutubePrivacy;
  madeForKids: boolean;
}): Promise<YoutubeConnection> {
  const privacy =
    input.privacyStatus === "private" || input.privacyStatus === "public" ? input.privacyStatus : "unlisted";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube")
    .update({
      privacy_status: privacy,
      made_for_kids: input.madeForKids,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save YouTube settings.");
  return publicView(data as Row);
}

/**
 * Why the upload worker can't reach YouTube right now (null when it can).
 * Read on its own so a missing column never breaks the worker or Settings.
 */
export async function getYoutubeWorkerError(): Promise<{ error: string; at: string | null } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("game_film_youtube")
      .select("refresh_token_enc, worker_error, worker_error_at")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { refresh_token_enc: string | null; worker_error: string | null; worker_error_at: string | null };
    if (!row.worker_error) return null;
    return { error: row.worker_error, at: row.worker_error_at };
  } catch {
    return null;
  }
}

/**
 * Records the worker's last check. `error` null clears it. Writes only when
 * the message changes, so a healthy every-minute tick doesn't touch the row.
 */
export async function recordYoutubeWorkerHealth(error: string | null, now = new Date()): Promise<void> {
  try {
    const current = await getYoutubeWorkerError();
    if ((current?.error ?? null) === error) return;
    const admin = createAdminClient();
    const stamp = now.toISOString();
    const patch = error
      ? { worker_error: error, worker_error_at: stamp }
      : { worker_error: null, worker_error_at: null, worker_ok_at: stamp };
    await admin.from("game_film_youtube").update(patch).eq("id", true);
  } catch {
    // Health is advisory; never block the upload worker on it.
  }
}
