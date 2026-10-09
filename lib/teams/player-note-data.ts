// Notes on players (0124), newest first, with a short-lived link to each
// attachment. Runs under the viewer's own access: only the board and the
// Registrations grant get rows back.

import { createClient } from "../supabase/server";
import { loadNames } from "./registration-data";
import { PLAYER_NOTE_FILES_BUCKET, type NoteAttachment, type PlayerNote } from "./player-notes";

const SIGNED_URL_TTL_SECONDS = 3600;

interface Row {
  id: string;
  player_id: string | null;
  registration_id: string | null;
  body: string;
  attachments: NoteAttachment[] | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type NoteViewer = { userId: string; isSuperAdmin: boolean };

export async function loadPlayerNotes(playerId: string, viewer: NoteViewer): Promise<PlayerNote[]> {
  const rows = await loadRows("player_id", [playerId]);
  return (await withLinks(rows, viewer)).map(({ note }) => note);
}

// The waitlist: every registration's notes at once, by registration.
export async function loadRegistrationNotes(registrationIds: string[], viewer: NoteViewer): Promise<Map<string, PlayerNote[]>> {
  const byReg = new Map<string, PlayerNote[]>();
  if (registrationIds.length === 0) return byReg;
  const rows = await loadRows("registration_id", registrationIds);
  for (const { row, note } of await withLinks(rows, viewer)) {
    const list = byReg.get(row.registration_id!) ?? [];
    list.push(note);
    byReg.set(row.registration_id!, list);
  }
  return byReg;
}

async function loadRows(column: "player_id" | "registration_id", ids: string[]): Promise<Row[]> {
  const db = await createClient();
  const { data } = await db
    .from("olb_player_notes")
    .select("id, player_id, registration_id, body, attachments, created_at, updated_at, created_by")
    .in(column, ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data as Row[] | null) ?? [];
}

async function withLinks(rows: Row[], viewer: NoteViewer): Promise<{ row: Row; note: PlayerNote }[]> {
  if (rows.length === 0) return [];
  const db = await createClient();
  const paths = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await db.storage.from(PLAYER_NOTE_FILES_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const names = await loadNames(rows.map((r) => r.created_by));
  return rows.map((row) => ({
    row,
    note: {
      id: row.id,
      body: row.body,
      attachments: (row.attachments ?? []).map((a) => ({ ...a, url: urls.get(a.path) ?? null })),
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      author_name: row.created_by ? names.get(row.created_by) ?? null : null,
      can_edit: row.created_by === viewer.userId || viewer.isSuperAdmin,
    },
  }));
}
