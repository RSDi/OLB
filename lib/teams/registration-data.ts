// Registrations from the public form, for the Directory's banner and its
// Registrations page: New (to review), Waitlist (0115), Approved, and
// Removed (families who withdrew or were taken off the roster, and tests). Runs
// under the viewer's own access: only people with the Registrations
// permission get rows back (0102).

import { createClient } from "../supabase/server";
import { matchRoster, type RegistrationExtra, type RosterMatch } from "./roster-logic";
import type { SentMessage } from "./family-mail";

// "waiting" is the New tab; the key stays for old links.
export type RegistrationTab = "waiting" | "waitlist" | "approved" | "removed";
const STATUS: Record<RegistrationTab, string> = { waiting: "pending", waitlist: "waitlisted", approved: "approved", removed: "rejected" };

export interface RosterPlayer {
  id: string;
  full_name: string;
  dob: string | null;
  team: { id: string; name: string; age_group: string | null } | null;
}

export type RegistrationMessage = SentMessage;

export interface PendingRegistration {
  id: string;
  board_id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  created_at: string;
  parent_email: string | null;
  extra: RegistrationExtra;
  // A player already on the roster with this name.
  match: RosterMatch<RosterPlayer> | null;
  notes: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  contacted_at: string | null;
  contacted_by_name: string | null;
  // Approved: the player it made.
  player: { id: string; full_name: string; team: { name: string; age_group: string | null } | null } | null;
  // Waitlist: emails sent to the family from the page, newest first.
  messages: RegistrationMessage[];
}

interface Row {
  id: string;
  board_id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  created_at: string;
  parent_email: string | null;
  extra: (RegistrationExtra & { signature_image?: unknown }) | null;
  notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  contacted_at: string | null;
  contacted_by: string | null;
  player: PendingRegistration["player"];
}

export async function countRegistrations(): Promise<Record<RegistrationTab, number>> {
  const db = await createClient();
  const count = async (tab: RegistrationTab) => {
    const { count: n } = await db.from("olb_registrations").select("id", { count: "exact", head: true }).eq("status", STATUS[tab]);
    return n ?? 0;
  };
  const [waiting, waitlist, approved, removed] = await Promise.all([count("waiting"), count("waitlist"), count("approved"), count("removed")]);
  return { waiting, waitlist, approved, removed };
}

// New and Waitlist oldest first (the order they came in, so the waitlist
// reads first in line first); Approved and Removed newest first.
export async function loadRegistrations(tab: RegistrationTab): Promise<PendingRegistration[]> {
  const db = await createClient();
  const { data } = await db
    .from("olb_registrations")
    .select(
      "id, board_id, first_name, last_name, dob, created_at, parent_email, extra, notes, reviewed_at, reviewed_by, contacted_at, contacted_by, " +
        "player:olb_players(id, full_name, team:olb_teams(name, age_group))"
    )
    .eq("status", STATUS[tab])
    .order(tab === "approved" || tab === "removed" ? "reviewed_at" : "created_at", { ascending: tab === "waiting" || tab === "waitlist" });
  const rows = (data as unknown as Row[] | null) ?? [];
  if (rows.length === 0) return [];

  const [roster, messages] = await Promise.all([
    tab === "approved" ? Promise.resolve([] as (RosterPlayer & { board_id: string })[]) : loadRoster(rows),
    tab === "waitlist" || tab === "removed" ? loadMessages(rows.map((r) => r.id)) : Promise.resolve([] as (RegistrationMessage & { registration_id: string; sent_by: string | null })[]),
  ]);
  const names = await loadNames([
    ...rows.flatMap((r) => [r.reviewed_by, r.contacted_by]),
    ...messages.map((m) => m.sent_by),
  ]);

  return rows.map((r) => {
    // The drawn signature is a whole image; the page only says it's signed.
    const extra: RegistrationExtra & { signature_image?: unknown } = { ...r.extra };
    delete extra.signature_image;
    return {
      id: r.id,
      board_id: r.board_id,
      first_name: r.first_name,
      last_name: r.last_name,
      dob: r.dob,
      created_at: r.created_at,
      parent_email: r.parent_email,
      extra,
      match: tab === "approved" ? null : matchRoster(r, roster.filter((p) => p.board_id === r.board_id)),
      notes: r.notes,
      reviewed_at: r.reviewed_at,
      reviewed_by_name: r.reviewed_by ? names.get(r.reviewed_by) ?? null : null,
      contacted_at: r.contacted_at,
      contacted_by_name: r.contacted_by ? names.get(r.contacted_by) ?? null : null,
      player: r.player,
      messages: messages
        .filter((m) => m.registration_id === r.id)
        .map((m) => ({ ...m, sent_by_name: m.sent_by ? names.get(m.sent_by) ?? null : null })),
    };
  });
}

async function loadRoster(rows: Row[]) {
  const db = await createClient();
  const boards = [...new Set(rows.map((r) => r.board_id))];
  const { data } = await db
    .from("olb_players")
    .select("id, board_id, full_name, dob, team:olb_teams(id, name, age_group)")
    .in("board_id", boards);
  return (data as unknown as (RosterPlayer & { board_id: string })[] | null) ?? [];
}

async function loadMessages(ids: string[]) {
  const db = await createClient();
  const { data } = await db
    .from("olb_registration_messages")
    .select("id, registration_id, subject, body, sent_to, sent_at, sent_by")
    .in("registration_id", ids)
    .order("sent_at", { ascending: false });
  return (data as (RegistrationMessage & { registration_id: string; sent_by: string | null })[] | null) ?? [];
}

// Who reviewed, contacted or sent: logins to the names people know them by.
export async function loadNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const db = await createClient();
  const { data } = await db.from("members").select("user_id, full_name, nickname").in("user_id", ids);
  return new Map(
    ((data as { user_id: string; full_name: string | null; nickname: string | null }[] | null) ?? []).map((m) => [
      m.user_id,
      m.nickname?.trim() || m.full_name?.split(" ")[0] || "Someone",
    ])
  );
}
