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
}

export interface MintedUpload {
  bucket: string;
  path: string;
  endpoint: string;
  token: string;
}

export interface FilmStorageProvider {
  id: "supabase" | "r2" | "s3";
  mintUpload(input: { path: string; contentType: string }): Promise<MintedUpload>;
  signedDownloadUrl(path: string, expiresInSeconds: number): Promise<string>;
  deleteObject(path: string): Promise<void>;
}
