// Rows in public.game_film_markers. Read and written through the admin
// client after the Film page's own permission check (service-role only).

import { createAdminClient } from "../supabase/admin.ts";
import type { FilmMarker } from "./player-logic.ts";

const COLUMNS = "id, upload_id, at_seconds, label, created_at";

function normalize(row: FilmMarker): FilmMarker {
  return { ...row, at_seconds: Number(row.at_seconds) };
}

export async function listFilmMarkers(uploadIds: string[]): Promise<Record<string, FilmMarker[]>> {
  const out: Record<string, FilmMarker[]> = {};
  if (uploadIds.length === 0) return out;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_markers")
    .select(COLUMNS)
    .in("upload_id", uploadIds)
    .order("at_seconds", { ascending: true });
  if (error) throw new Error(error.message);
  for (const row of (data as FilmMarker[]) ?? []) {
    (out[row.upload_id] ??= []).push(normalize(row));
  }
  return out;
}

export async function insertFilmMarker(input: {
  uploadId: string;
  atSeconds: number;
  label: string;
  createdBy: string;
}): Promise<FilmMarker> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_markers")
    .insert({ upload_id: input.uploadId, at_seconds: input.atSeconds, label: input.label, created_by: input.createdBy })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as FilmMarker);
}

export async function deleteFilmMarkerRow(id: string): Promise<{ upload_id: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_markers")
    .delete()
    .eq("id", id)
    .select("upload_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { upload_id: string } | null) ?? null;
}

/**
 * Move a stream's jump-to points onto its recording at new times (the
 * caller shifts them). Inserts first, then deletes the stream's own, so a
 * failure part-way leaves points on both rather than on neither.
 */
export async function moveFilmMarkers(input: {
  fromUploadId: string;
  toUploadId: string;
  markers: { id: string; at_seconds: number; label: string }[];
  dropIds: string[];
  createdBy: string;
}): Promise<number> {
  const admin = createAdminClient();
  if (input.markers.length > 0) {
    const { error } = await admin.from("game_film_markers").insert(
      input.markers.map((m) => ({
        upload_id: input.toUploadId,
        at_seconds: m.at_seconds,
        label: m.label,
        created_by: input.createdBy,
      }))
    );
    if (error) throw new Error(error.message);
  }
  const ids = [...input.markers.map((m) => m.id), ...input.dropIds];
  if (ids.length > 0) {
    const { error } = await admin.from("game_film_markers").delete().eq("upload_id", input.fromUploadId).in("id", ids);
    if (error) throw new Error(error.message);
  }
  return input.markers.length;
}
