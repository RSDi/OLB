"use server";
// Notes on players (0124), for the board and anyone with the Registrations
// permission. RLS checks the same, and that only a note's author (or a
// super-admin) changes it; these guards fail fast with a clear message.
// Attachments are uploaded from the browser under the note's id before it's
// saved (lib/teams/player-note-upload.ts); files are only ever removed here,
// with the service role, once the note they belong to is checked.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { requirePlayerNotes } from "../auth/guards";
import { PLAYER_NOTE_FILES_BUCKET, cleanAttachments, cleanNoteBody, type NoteAttachment, type NoteOwner } from "./player-notes";

type Result = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIGNED_URL_TTL_SECONDS = 3600;

function refresh() {
  revalidatePath("/portal/directory", "layout");
}

export async function addPlayerNote(input: {
  id: string;
  owner: NoteOwner;
  body: string;
  attachments: NoteAttachment[];
}): Promise<Result> {
  const gate = await requirePlayerNotes();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(input.id ?? "")) return { error: "Something went wrong. Refresh the page and try again." };
  const body = cleanNoteBody(input.body);
  const files = cleanAttachments(input.id, input.attachments);
  if ("error" in files) return { error: files.error };
  if (!body && files.value.length === 0) return { error: "Write a note or attach a file." };

  const db = await createClient();
  const owner =
    "playerId" in input.owner
      ? await db.from("olb_players").select("id, board_id").eq("id", input.owner.playerId).maybeSingle()
      : await db.from("olb_registrations").select("id, board_id").eq("id", input.owner.registrationId).maybeSingle();
  const board = (owner.data as { board_id: string } | null)?.board_id;
  if (!board) return { error: "That player isn't there any more. Refresh the page." };

  // Every file named is really there, in this note's folder.
  if (files.value.length > 0) {
    const { data: stored } = await createAdminClient().storage.from(PLAYER_NOTE_FILES_BUCKET).list(input.id, { limit: 100 });
    const there = new Set((stored ?? []).map((o) => `${input.id}/${o.name}`));
    if (files.value.some((f) => !there.has(f.path))) {
      return { error: "An attachment didn't upload properly. Remove it and add it again." };
    }
  }

  const { error } = await db.from("olb_player_notes").insert({
    id: input.id,
    board_id: board,
    player_id: "playerId" in input.owner ? input.owner.playerId : null,
    registration_id: "registrationId" in input.owner ? input.owner.registrationId : null,
    body,
    attachments: files.value,
    created_by: gate.userId,
  });
  if (error) return { error: error.message };
  refresh();
  return {};
}

// The words only; attachments stay as they are.
export async function updatePlayerNote(id: string, body: string): Promise<Result> {
  const gate = await requirePlayerNotes();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data: note } = await db.from("olb_player_notes").select("attachments").eq("id", id).is("deleted_at", null).maybeSingle();
  const clean = cleanNoteBody(body);
  if (!clean && !((note?.attachments as NoteAttachment[] | null) ?? []).length) {
    return { error: "A note needs some words or an attachment. Use Delete to take it off." };
  }
  const { data, error } = await db
    .from("olb_player_notes")
    .update({ body: clean, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the person who wrote a note can change it." };
  refresh();
  return {};
}

// Kept in the database, shown nowhere; its files are deleted.
export async function deletePlayerNote(id: string): Promise<Result> {
  const gate = await requirePlayerNotes();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_player_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, attachments");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the person who wrote a note can delete it." };
  const paths = ((data[0].attachments as NoteAttachment[] | null) ?? []).map((a) => a.path);
  if (paths.length > 0) await createAdminClient().storage.from(PLAYER_NOTE_FILES_BUCKET).remove(paths);
  refresh();
  return {};
}

// Files uploaded for a note that was never saved (Cancel, or one removed
// before saving). Only under that note's folder, and only while no saved
// note has that id.
export async function discardNoteUploads(noteId: string, paths: string[]): Promise<void> {
  const gate = await requirePlayerNotes();
  if ("error" in gate || !UUID.test(noteId ?? "")) return;
  const mine = (paths ?? []).filter((p) => typeof p === "string" && p.startsWith(`${noteId}/`) && !p.includes(".."));
  if (mine.length === 0) return;
  const admin = createAdminClient();
  const { data: saved } = await admin.from("olb_player_notes").select("id").eq("id", noteId).maybeSingle();
  if (saved) return;
  await admin.storage.from(PLAYER_NOTE_FILES_BUCKET).remove(mine);
}

// A fresh link to one attachment, for a page that's been open a while.
export async function openNoteFile(noteId: string, path: string): Promise<{ url?: string; error?: string }> {
  const gate = await requirePlayerNotes();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data: note } = await db.from("olb_player_notes").select("attachments").eq("id", noteId).is("deleted_at", null).maybeSingle();
  if (!((note?.attachments as NoteAttachment[] | null) ?? []).some((a) => a.path === path)) {
    return { error: "That attachment isn't there any more. Refresh the page." };
  }
  const { data, error } = await db.storage.from(PLAYER_NOTE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return { error: error?.message ?? "Couldn't open that file." };
  return { url: data.signedUrl };
}
