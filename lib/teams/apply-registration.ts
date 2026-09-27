// Applies one player registration to the season board: finds or creates the
// player, fills in their registration details, and links them to their
// parents as members. New parents are pre-created pending with no login: when
// one signs up with their registration email, the row becomes their access
// request, and a super-admin approves it in Settings → Members.
//
// Shared by the spreadsheet import (scripts/import-registrations.ts, service
// role) and the Team manager's Approve button (a super-admin's client). A
// plain module, not "use server": it takes the client to write with.
//
// Players are matched on the board by name, and by birthdate when both have
// one, so re-applying a registration updates the same player and keeps the
// team they were put on.
//
// Parents are matched to a member by email, else (no email) by name among
// members with no email. A member who has never signed in is refreshed from
// the registration; one who has signed in only gets blanks filled, so their
// own edits stick. members.email is unique, so when two different people
// share one email (a couple on one address), the second is linked without it.
// Deleted or revoked members are never relinked.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ParentRelationship = "father" | "mother" | "guardian";

export interface RegistrationParent {
  relationship: ParentRelationship;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  volunteerInterests: string | null;
}

export interface RegistrationRecord {
  firstName: string;
  lastName: string;
  dob: string | null;
  ageGroup: string | null;
  newToProgram: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  registrationFee: string | null;
  paymentMethod: string | null;
  shirtSize: string | null;
  waiverSigned: boolean;
  waiverSignedOn: string | null;
  directoryOptin: boolean;
  parents: RegistrationParent[];
}

export interface ApplyResult {
  playerId: string;
  created: boolean;
  parentsLinked: number;
  membersCreated: number;
  // Things a person should look at, e.g. an email that couldn't be used.
  notes: string[];
}

// Forms get "N/A" typed into required fields for a parent who isn't there.
const PLACEHOLDER = /^(n\/?a|none|unknown|tbd|-+)$/i;

export function cleanName(...parts: (string | null | undefined)[]): string | null {
  const words = parts
    .flatMap((p) => (p ?? "").split(/\s+/))
    .filter((w) => w && !PLACEHOLDER.test(w));
  return words.length ? words.join(" ") : null;
}

// Drops malformed addresses and placeholders like "N/A@gmail.com".
export function cleanEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim();
  if (!e || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return null;
  return PLACEHOLDER.test(e.split("@")[0]) ? null : e;
}

// ILIKE treats % and _ as wildcards; match them literally.
function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

// "Matt" and "Matthew" on two siblings' forms are one person; "Andrew" and
// "Jessica" sharing an email are two.
function samePerson(a: string | null, b: string | null): boolean {
  const first = (n: string | null) => (n ?? "").trim().split(/\s+/)[0].toLowerCase();
  const x = first(a);
  const y = first(b);
  if (!x || !y) return true;
  return x.startsWith(y.slice(0, 3)) || y.startsWith(x.slice(0, 3));
}

function oneLineAddress(r: RegistrationRecord): string | null {
  const cityLine = [r.city, [r.state, r.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [r.addressLine1, r.addressLine2, cityLine].filter(Boolean).join(", ") || null;
}

interface MemberRow {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  volunteer_interests: string | null;
  deleted_at: string | null;
  access_revoked_at: string | null;
}

const MEMBER_COLUMNS =
  "id, user_id, email, full_name, phone, address, volunteer_interests, deleted_at, access_revoked_at";

export async function applyRegistration(
  db: SupabaseClient,
  boardId: string,
  reg: RegistrationRecord,
): Promise<ApplyResult> {
  const fullName = `${reg.firstName.trim()} ${reg.lastName.trim()}`;
  const notes: string[] = [];

  // ── Player ──────────────────────────────────────────────────────────
  const { data: candidates, error: findErr } = await db
    .from("olb_players")
    .select("id, dob, age_group, registered_at")
    .eq("board_id", boardId)
    .ilike("full_name", ilikeExact(fullName));
  if (findErr) throw new Error(`Looking up ${fullName} failed: ${findErr.message}`);
  const existing =
    (candidates ?? []).find((p) => reg.dob && p.dob === reg.dob) ??
    (candidates ?? []).find((p) => !reg.dob || !p.dob) ??
    null;

  const details = {
    full_name: fullName,
    new_to_program: reg.newToProgram,
    address_line1: reg.addressLine1,
    address_line2: reg.addressLine2,
    city: reg.city,
    state: reg.state,
    postal_code: reg.postalCode,
    phone: reg.phone,
    email: cleanEmail(reg.email),
    registration_fee: reg.registrationFee,
    payment_method: reg.paymentMethod,
    shirt_size: reg.shirtSize,
    waiver_signed: reg.waiverSigned,
    waiver_signed_on: reg.waiverSignedOn,
    directory_optin: reg.directoryOptin,
  };

  let playerId: string;
  if (existing) {
    const { error } = await db
      .from("olb_players")
      .update({
        ...details,
        dob: reg.dob ?? existing.dob,
        age_group: reg.ageGroup ?? existing.age_group,
        registered_at: existing.registered_at ?? new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`Updating ${fullName} failed: ${error.message}`);
    playerId = existing.id;
  } else {
    const { data, error } = await db
      .from("olb_players")
      .insert({
        ...details,
        board_id: boardId,
        team_id: null,
        dob: reg.dob,
        age_group: reg.ageGroup,
        registered_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Adding ${fullName} failed: ${error?.message}`);
    playerId = data.id as string;
  }

  // ── Parents ─────────────────────────────────────────────────────────
  const address = oneLineAddress(reg);
  const usedEmails = new Set<string>();
  const links = new Map<string, ParentRelationship>();
  let membersCreated = 0;

  for (const pa of reg.parents) {
    const name = cleanName(pa.fullName);
    if (!name) continue;
    let email = cleanEmail(pa.email);
    if (email && usedEmails.has(email.toLowerCase())) {
      notes.push(`${name} shares ${email} with the other parent, so was linked without it`);
      email = null;
    }

    let member: MemberRow | null = null;
    if (email) {
      const { data } = await db
        .from("members")
        .select(MEMBER_COLUMNS)
        .ilike("email", ilikeExact(email))
        .maybeSingle();
      member = (data as MemberRow | null) ?? null;
      if (member && !samePerson(member.full_name, name)) {
        notes.push(`${name} shares ${email} with ${member.full_name}, so was linked without it`);
        member = null;
        email = null;
      }
    }
    if (!email) {
      const { data } = await db
        .from("members")
        .select(MEMBER_COLUMNS)
        .is("email", null)
        .ilike("full_name", ilikeExact(name))
        .limit(1);
      member = ((data as MemberRow[] | null) ?? [])[0] ?? null;
    }
    if (email) usedEmails.add(email.toLowerCase());

    if (member && (member.deleted_at || member.access_revoked_at)) {
      notes.push(`${name} matches a deleted or revoked member, so wasn't linked`);
      continue;
    }

    const fromForm = {
      full_name: name,
      phone: pa.phone,
      address,
      volunteer_interests: pa.volunteerInterests,
    };

    if (!member) {
      const { data, error } = await db
        .from("members")
        .insert({ ...fromForm, email, status: "pending", role: "member" })
        .select("id")
        .single();
      if (error || !data) {
        notes.push(`Adding ${name} as a member failed: ${error?.message}`);
        continue;
      }
      membersCreated++;
      if (!links.has(data.id)) links.set(data.id, pa.relationship);
      continue;
    }

    const m = member;
    const update = m.user_id
      ? Object.fromEntries(
          Object.entries(fromForm).filter(([k, v]) => v != null && m[k as keyof MemberRow] == null),
        )
      : fromForm;
    if (Object.keys(update).length > 0) {
      const { error } = await db.from("members").update(update).eq("id", m.id);
      if (error) notes.push(`Updating member ${name} failed: ${error.message}`);
    }
    if (!links.has(m.id)) links.set(m.id, pa.relationship);
  }

  if (links.size > 0) {
    const { error } = await db.from("olb_player_parents").upsert(
      [...links].map(([member_id, relationship]) => ({ player_id: playerId, member_id, relationship })),
      { onConflict: "player_id,member_id" },
    );
    if (error) throw new Error(`Linking ${fullName}'s parents failed: ${error.message}`);
  }

  return { playerId, created: !existing, parentsLinked: links.size, membersCreated, notes };
}
