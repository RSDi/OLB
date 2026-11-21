// Rows in public.game_film_links (0183). Read and written through the admin
// client after the caller's own check (service-role only), like markers.

import { createAdminClient } from "../supabase/admin.ts";
import type { FilmLink, FilmLinkInput } from "./links.ts";

const COLUMNS = "id, upload_id, url, note, position";

/** Links per upload, in order. */
export async function listFilmLinks(uploadIds: string[]): Promise<Record<string, FilmLink[]>> {
  const out: Record<string, FilmLink[]> = {};
  if (uploadIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("game_film_links")
    .select(COLUMNS)
    .in("upload_id", uploadIds)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const row of (data as FilmLink[] | null) ?? []) (out[row.upload_id] ??= []).push(row);
  return out;
}

/** Replace an upload's links with these, in this order. */
export async function replaceFilmLinks(uploadId: string, links: FilmLinkInput[], userId: string | null): Promise<FilmLink[]> {
  const admin = createAdminClient();
  const { error: delError } = await admin.from("game_film_links").delete().eq("upload_id", uploadId);
  if (delError) throw new Error(delError.message);
  if (links.length === 0) return [];
  const { data, error } = await admin
    .from("game_film_links")
    .insert(links.map((l, i) => ({ upload_id: uploadId, url: l.url, note: l.note, position: i, created_by: userId })))
    .select(COLUMNS)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilmLink[] | null) ?? [];
}
