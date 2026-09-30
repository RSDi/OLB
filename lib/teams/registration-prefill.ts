// What the public registration form fills in for a returning family, found
// by an email whose code was typed back (0103): every player the email's
// parent (or the player themselves) is linked to, with their address and
// both parents. Server-only, and called with the service role, since the
// visitor isn't signed in. Never call it for an email that wasn't checked.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REGISTRATION_SEASON,
  splitInterests,
  splitName,
  type FamilyPrefill,
  type PrefillParent,
  type PrefillPlayer,
} from "./registration-form";
import { VOLUNTEER_OPTIONS } from "./volunteer-options";

type Relationship = "father" | "mother" | "guardian";

interface PlayerRow {
  id: string;
  full_name: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  directory_optin: boolean;
  registered_at: string | null;
  board: { season: string } | null;
  parents: {
    relationship: Relationship;
    member: { full_name: string | null; email: string | null; phone: string | null; volunteer_interests: string | null; deleted_at: string | null } | null;
  }[];
}

// ILIKE treats % and _ as wildcards; match them literally.
function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

export async function findFamily(db: SupabaseClient, rawEmail: string): Promise<FamilyPrefill | null> {
  const email = rawEmail.trim().toLowerCase();
  const { data: members } = await db
    .from("members")
    .select("id, full_name")
    .ilike("email", ilikeExact(email))
    .is("deleted_at", null)
    .is("access_revoked_at", null);
  const memberIds = ((members as { id: string; full_name: string | null }[] | null) ?? []).map((m) => m.id);

  const [{ data: links }, { data: own }] = await Promise.all([
    memberIds.length
      ? db.from("olb_player_parents").select("player_id, relationship").in("member_id", memberIds)
      : Promise.resolve({ data: [] as { player_id: string; relationship: Relationship }[] }),
    db.from("olb_players").select("id").ilike("email", ilikeExact(email)),
  ]);
  const linkRows = (links as { player_id: string; relationship: Relationship }[] | null) ?? [];
  const ownIds = ((own as { id: string }[] | null) ?? []).map((p) => p.id);
  const ids = [...new Set([...linkRows.map((l) => l.player_id), ...ownIds])];
  if (ids.length === 0) return null;

  const { data } = await db
    .from("olb_players")
    .select(
      "id, full_name, dob, phone, email, address_line1, address_line2, city, state, postal_code, directory_optin, registered_at, " +
        "board:olb_boards(season), parents:olb_player_parents(relationship, member:members(full_name, email, phone, volunteer_interests, deleted_at))"
    )
    .in("id", ids);
  const rows = (data as unknown as PlayerRow[] | null) ?? [];

  // One entry per child: the same player on several seasons' boards keeps
  // their latest season.
  const latest = new Map<string, PlayerRow>();
  for (const r of rows) {
    const key = `${r.full_name.trim().toLowerCase()}|${r.dob ?? ""}`;
    const seen = latest.get(key);
    if (!seen || (r.board?.season ?? "") > (seen.board?.season ?? "")) latest.set(key, r);
  }
  const players = [...latest.values()]
    .sort((a, b) => (a.dob ?? "9999").localeCompare(b.dob ?? "9999") || a.full_name.localeCompare(b.full_name))
    .map(toPrefillPlayer);

  const member = (members as { id: string; full_name: string | null }[] | null)?.[0];
  const rel = linkRows[0]?.relationship;
  const isPlayer = !member && ownIds.length > 0;
  const ownPlayer = isPlayer ? players.find((p) => ownIds.includes(p.key)) : undefined;
  return {
    firstName: (member ? splitName(member.full_name)[0] : ownPlayer?.first) || null,
    relationship: isPlayer ? "player" : rel === "father" || rel === "mother" ? rel : null,
    players,
  };
}

function toPrefillPlayer(r: PlayerRow): PrefillPlayer {
  const [first, last] = splitName(r.full_name);
  const live = r.parents.filter((p) => p.member && !p.member.deleted_at);
  const pick = (rel: Relationship) => live.find((p) => p.relationship === rel)?.member ?? null;
  let father = pick("father");
  let mother = pick("mother");
  // A guardian takes whichever of the form's two parent spots is free.
  const guardian = pick("guardian");
  if (guardian && !mother) mother = guardian;
  else if (guardian && !father) father = guardian;
  return {
    key: r.id,
    first,
    last,
    dob: r.dob ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    registeredThisSeason: r.board?.season === REGISTRATION_SEASON && !!r.registered_at,
    directoryOptin: r.directory_optin,
    address: {
      line1: r.address_line1 ?? "",
      line2: r.address_line2 ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip: r.postal_code ?? "",
    },
    father: toParent(father),
    mother: toParent(mother),
  };
}

function toParent(m: PlayerRow["parents"][number]["member"]): PrefillParent | null {
  if (!m) return null;
  const [first, last] = splitName(m.full_name);
  const { picked, other } = splitInterests(m.volunteer_interests, VOLUNTEER_OPTIONS);
  return { first, last, email: m.email ?? "", phone: m.phone ?? "", volunteer: picked, volunteer_other: other };
}
