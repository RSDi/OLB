// Game-film upload shapes. A plain module on purpose — exporting types from a
// "use server" file breaks the build.

export const GAME_FILM_BUCKET = "game-film";

// 20 GiB. Phone recordings from a full game can be huge; the server and the
// bucket both refuse anything larger.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;

// Supabase TUS currently requires 6 MiB chunks. Do not change.
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export const FILM_COOKIE = "olb_film";
export const FILM_SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

export const SIGNED_DOWNLOAD_TTL_S = 6 * 60 * 60;
export const MOVED_RETENTION_DAYS = 30;

export type FilmStatus = "holding" | "moved";
export type YoutubeStatus = "queued" | "uploading" | "done" | "failed";
export type YoutubePlaylistStatus = "queued" | "done" | "failed";
export type FilmSlackDraftStatus = "pending" | "posting" | "posted" | "discarded";

export interface FilmTeam {
  slug: string;
  label: string;
}

export interface FilmUpload {
  id: string;
  team: string;
  team_id: string | null;
  uploader_name: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  status: FilmStatus;
  created_at: string;
  moved_at: string | null;
  game_date: string | null;
  opponent: string | null;
  our_score: number | null;
  their_score: number | null;
  youtube_status: YoutubeStatus | null;
  youtube_video_id: string | null;
  youtube_error: string | null;
  youtube_updated_at: string | null;
  youtube_playlist_id: string | null;
  youtube_playlist_status: YoutubePlaylistStatus | null;
  youtube_playlist_error: string | null;
  youtube_playlist_item_id: string | null;
  youtube_playlist_updated_at: string | null;
}

export interface FilmSlackDraft {
  id: string;
  upload_id: string;
  team_id: string | null;
  channel_id: string | null;
  body: string;
  status: FilmSlackDraftStatus;
  slack_ts: string | null;
  posted_channel_id: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilmSlackDraftView extends FilmSlackDraft {
  filename: string;
  team_label: string;
  team_slug: string;
}

export interface MintedUpload {
  bucket: string;
  path: string;
  endpoint: string;
  token: string;
  // TUS Location from server-side POST /upload/resumable/sign. The phone
  // PATCHes chunks here and never POSTs to Storage itself.
  uploadUrl?: string;
}

export interface FilmStorageProvider {
  id: "supabase" | "r2" | "s3";
  mintUpload(input: { path: string; contentType: string; sizeBytes: number }): Promise<MintedUpload>;
  signedDownloadUrl(path: string, expiresInSeconds: number): Promise<string>;
  deleteObject(path: string): Promise<void>;
}
