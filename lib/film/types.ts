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
// The phone's original is deleted this many days after YouTube reports Ready.
export const ORIGINAL_KEEP_DAYS = 30;
// Uploads that never went to YouTube are queued by the cron after this long
// (gives the phone and /film/complete first go), up to this many days back.
export const UNSENT_SWEEP_AFTER_MS = 6 * 60 * 60 * 1000;
export const UNSENT_SWEEP_MAX_DAYS = 30;
export const SLACK_DRAFT_RETAIN_DAYS = 30;

export type FilmStatus = "holding" | "moved";
export type YoutubeStatus = "queued" | "uploading" | "done" | "failed";
export type YoutubePlaylistStatus = "queued" | "done" | "failed";
export type FilmSlackDraftStatus = "pending" | "posting" | "posted" | "discarded";
export type YoutubePrivacy = "public" | "unlisted" | "private";
export type YoutubeProcessing = "uploaded" | "processed" | "failed" | "rejected" | "deleted" | "missing";

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
  // Set when the original file was deleted after YouTube had it.
  file_deleted_at: string | null;
  game_date: string | null;
  opponent: string | null;
  our_score: number | null;
  their_score: number | null;
  // Tournament or event name a coach typed; the team film page groups by it.
  event_name: string | null;
  youtube_status: YoutubeStatus | null;
  youtube_video_id: string | null;
  youtube_error: string | null;
  youtube_updated_at: string | null;
  youtube_playlist_id: string | null;
  youtube_playlist_status: YoutubePlaylistStatus | null;
  youtube_playlist_error: string | null;
  youtube_playlist_item_id: string | null;
  youtube_playlist_updated_at: string | null;
  // Real YouTube status from videos.list part=status. Shared with GET
  // /api/agent/film: youtube_privacy + youtube_synced_at. youtube_processing
  // is uploadStatus (uploaded / processed / failed / rejected / deleted / missing).
  youtube_privacy: YoutubePrivacy | null;
  youtube_processing: YoutubeProcessing | null;
  youtube_synced_at: string | null;
  // A livestream link (no file): youtube_video_id is the stream. Shows as
  // "Streamed" until a recording replaces it (0179).
  streamed: boolean;
  // On a recording: the streamed game it replaces once it's on YouTube.
  replaces_stream_id: string | null;
  // Which part of the game: h1/h2, q1–q4, ot… (lib/film/parts.ts). Null is
  // the whole game (0182).
  part: string | null;
}

export type YoutubeEventKind =
  | "received"
  | "upload_started"
  | "progress"
  | "finished"
  | "playlist_added"
  | "retry"
  | "error"
  | "stalled";

export interface YoutubeJob {
  upload_id: string;
  upload_uri: string | null;
  bytes_sent: number;
  bytes_total: number | null;
  attempts: number;
  started_at: string | null;
  last_progress_at: string | null;
  updated_at: string;
}

export interface YoutubeEvent {
  id: string;
  upload_id: string;
  at: string;
  kind: YoutubeEventKind;
  message: string;
  detail: string | null;
  bytes_sent: number | null;
  bytes_total: number | null;
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
  discarded_at: string | null;
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
  /** A fresh signed token for an upload already started at this path, so the
   * phone can carry on from where Storage stopped instead of starting over. */
  resignUpload(path: string): Promise<{ bucket: string; endpoint: string; token: string }>;
  signedDownloadUrl(path: string, expiresInSeconds: number): Promise<string>;
  deleteObject(path: string): Promise<void>;
  objectExists(path: string): Promise<boolean>;
}
