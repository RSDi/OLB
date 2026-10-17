"use server";
// Coach inbox mutations for /portal/film. View vs manage is the Game film
// permissions (film_view / film_manage). Super-admins hold both.

import { revalidatePath } from "next/cache";
import { requireFilmManage, requireFilmView } from "../auth/guards";
import { SIGNED_DOWNLOAD_TTL_S } from "./types";
import { filmStorage } from "./storage";
import { deleteFilmUploadRow, getFilmUpload, setFilmStatus } from "./uploads";
import { publishFilmToYouTube } from "./youtube";

function refresh() {
  revalidatePath("/portal/film");
}

export async function signedFilmDownload(
  id: string
): Promise<{ url?: string; filename?: string; error?: string }> {
  const gate = await requireFilmView();
  if ("error" in gate) return { error: gate.error };
  const row = await getFilmUpload(id);
  if (!row) return { error: "That upload isn't there any more." };
  try {
    const url = await filmStorage().signedDownloadUrl(row.storage_path, SIGNED_DOWNLOAD_TTL_S);
    return { url, filename: row.filename };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't make a download link." };
  }
}

export async function markFilmMoved(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await setFilmStatus(id, "moved");
  if (!row) return { error: "That upload isn't there any more." };
  refresh();
  return { ok: true };
}

export async function restoreFilmHolding(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await setFilmStatus(id, "holding");
  if (!row) return { error: "That upload isn't there any more." };
  refresh();
  return { ok: true };
}

export async function deleteFilmUpload(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await deleteFilmUploadRow(id);
  if (!row) return { error: "That upload isn't there any more." };
  try {
    await filmStorage().deleteObject(row.storage_path);
  } catch {
    // Row is gone; a missing object is fine.
  }
  refresh();
  return { ok: true };
}

// Later: a "Publish to YouTube" button can call this. It is a stub today.
export async function publishFilm(id: string): Promise<{ error: string }> {
  const gate = await requireFilmManage();
  if ("error" in gate) return { error: gate.error };
  const row = await getFilmUpload(id);
  if (!row) return { error: "That upload isn't there any more." };
  const result = await publishFilmToYouTube(row);
  return { error: result.reason };
}
