// Club YouTube connection row. Service-role only. The refresh token is
// encrypted with FILM_YOUTUBE_TOKEN_KEY before insert.

import { createAdminClient } from "../supabase/admin.ts";
import { decryptSecret, encryptSecret, youtubeTokenKey } from "./crypto.ts";
import type { YoutubeConnection, YoutubePrivacy } from "./youtube-meta.ts";

export type { YoutubeConnection, YoutubePrivacy };

export type YoutubeConnectionSecret = YoutubeConnection & {
  refreshToken: string | null;
};

const BASE_COLS =
  "id, refresh_token_enc, channel_id, channel_title, connected_at, connected_by, privacy_status, made_for_kids, updated_at";
// 0162. Read separately so the connection still loads if that migration
// hasn't landed yet.
const AUTH_COLS = "auth_error, auth_error_at";
const COLS = `${BASE_COLS}, ${AUTH_COLS}`;

type Row = {
  refresh_token_enc: string | null;
  channel_id: string | null;
  channel_title: string | null;
  connected_at: string | null;
  privacy_status: YoutubePrivacy;
  made_for_kids: boolean;
  auth_error?: string | null;
  auth_error_at?: string | null;
};

function publicView(row: Row | null): YoutubeConnection {
  return {
    connected: Boolean(row?.refresh_token_enc),
    channelId: row?.channel_id ?? null,
    channelTitle: row?.channel_title ?? null,
    connectedAt: row?.connected_at ?? null,
    privacyStatus: row?.privacy_status === "private" || row?.privacy_status === "public" ? row.privacy_status : "unlisted",
    madeForKids: Boolean(row?.made_for_kids),
    authError: row?.refresh_token_enc ? row.auth_error ?? null : null,
    authErrorAt: row?.refresh_token_enc ? row.auth_error_at ?? null : null,
  };
}

async function loadRow(): Promise<Row | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("game_film_youtube").select(COLS).eq("id", true).maybeSingle();
  if (!error) return (data as Row | null) ?? null;
  if (!authColumnsMissing(error.message)) throw new Error(error.message);
  const base = await admin.from("game_film_youtube").select(BASE_COLS).eq("id", true).maybeSingle();
  if (base.error) throw new Error(base.error.message);
  return (base.data as Row | null) ?? null;
}

function authColumnsMissing(message: string): boolean {
  return /auth_error/.test(message);
}

/**
 * Called by the upload cron after each token refresh. Writes only when the
 * message changes, so a healthy connection costs no write per minute.
 */
export async function recordYoutubeAuthResult(
  current: string | null,
  next: string | null
): Promise<void> {
  if ((current ?? null) === (next ?? null)) return;
  await writeAuthError(next);
}

async function writeAuthError(next: string | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_film_youtube")
    .update({ auth_error: next, auth_error_at: next ? new Date().toISOString() : null })
    .eq("id", true);
  if (error && !authColumnsMissing(error.message)) throw new Error(error.message);
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
    .select(BASE_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube connection.");
  await writeAuthError(null);
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
    .select(BASE_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't disconnect YouTube.");
  await writeAuthError(null);
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
    .select(BASE_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save YouTube settings.");
  return publicView(await loadRow());
}
