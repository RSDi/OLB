// Rows in public.game_film_uploads. Parent uploads write through the admin
// client (no portal login). The inbox reads through the same client after a
// permission check, so a missing RLS helper can't hide the list from someone
// who was granted Game film.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { GAME_FILM_BUCKET, MOVED_RETENTION_DAYS, type FilmStatus, type FilmUpload } from "./types.ts";
import { storageObjectName } from "./validation.ts";

export const FILM_UPLOAD_COLUMNS =
  "id, team, team_id, uploader_name, filename, content_type, size_bytes, storage_path, status, created_at, moved_at, game_date, opponent, our_score, their_score";

export function filmStoragePath(team: string, uploadId: string, filename: string): string {
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${team}/${y}/${m}/${uploadId}/${storageObjectName(filename)}`;
}

export function newUploadId(): string {
  return randomUUID();
}

export async function insertHoldingUpload(input: {
  id: string;
  team: string;
  teamId: string;
  uploaderName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  gameDate: string;
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
}): Promise<FilmUpload> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .insert({
      id: input.id,
      team: input.team,
      team_id: input.teamId,
      uploader_name: input.uploaderName,
      filename: input.filename,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      status: "holding",
      game_date: input.gameDate,
      opponent: input.opponent,
      our_score: input.ourScore,
      their_score: input.theirScore,
    })
    .select(FILM_UPLOAD_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't log the upload.");
  return data as FilmUpload;
}

export async function listFilmUploads(teamIds?: string[]): Promise<FilmUpload[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .order("game_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (teamIds) {
    if (teamIds.length === 0) return [];
    query = query.in("team_id", teamIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export async function getFilmUpload(id: string): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function setFilmStatus(id: string, status: FilmStatus): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const patch =
    status === "moved"
      ? { status, moved_at: new Date().toISOString() }
      : { status, moved_at: null };
  const { data, error } = await admin
    .from("game_film_uploads")
    .update(patch)
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function deleteFilmUploadRow(id: string): Promise<FilmUpload | null> {
  const row = await getFilmUpload(id);
  if (!row) return null;
  const admin = createAdminClient();
  const { error } = await admin.from("game_film_uploads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return row;
}

export async function listExpiredMovedUploads(now = new Date()): Promise<FilmUpload[]> {
  const cutoff = new Date(now.getTime() - MOVED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .eq("status", "moved")
    .not("moved_at", "is", null)
    .lt("moved_at", cutoff);
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export { GAME_FILM_BUCKET };
