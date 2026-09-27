/*
 * Imports the season registration spreadsheet: players into `players`, their
 * parents into `members` (so they can sign in), and the links between them
 * into `player_parents`.
 *
 * Usage:
 *   npm run import-registrations -- <path-to-xlsx> [--season 2026-27] [--dry-run]
 *
 * Reads the sheet whose name contains "Season Registration". Layout:
 *   - Row 1 is the form's column headers.
 *   - A row with only column A filled ("10U", "12U", …) starts a team; the
 *     players below it belong to that team.
 *   - Most player rows follow the headers (name, birthdate, age, new, address
 *     split into parts, athlete phone/email, father first/last/email/phone/
 *     serving, mother first/last/email/phone/serving, waiver, waiver date,
 *     fee). A few late registrations were pasted in from a newer form export
 *     with a different column order (one-line address, parents' full names,
 *     payment method, shirt size, waiver at the far right). Those are spotted
 *     by an email address in column H, where the standard layout has the city.
 *   - Rows with only a name and birthdate are imported as players with no
 *     parents. A parent whose name is a placeholder ("N/A") is skipped, and
 *     malformed or placeholder emails ("N/A@gmail.com") are dropped.
 *
 * Parents:
 *   - Matched to an existing member by email (case-insensitive), else, for a
 *     parent with no email, by full name among members with no email.
 *   - New parents are inserted approved, with no login. When they sign up or
 *     sign in with that email, resolveMembership links the row to their login
 *     and they land in the portal approved.
 *   - A matched member who has never signed in gets their name, phone,
 *     address and serving interests refreshed from the sheet. One who has
 *     signed in only has blank fields filled, so their own edits stick.
 *   - members.email is unique, so when two different parents share an email
 *     (e.g. father and mother on one address), the second is imported without
 *     it and listed in the report; they can be given their own email later.
 *   - Deleted or revoked members are never relinked; they're reported.
 *
 * Players are matched on season + first name + last name + birthdate, so the
 * script is safe to re-run after the spreadsheet changes.
 *
 * Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { createAdminClient } from "../lib/supabase/admin";

const USAGE =
  "Usage: npm run import-registrations -- <path-to-xlsx> [--season 2026-27] [--dry-run]";

type Relationship = "father" | "mother";

interface ParsedParent {
  relationship: Relationship;
  fullName: string;
  email: string | null;
  phone: string | null;
  volunteerInterests: string | null;
}

interface ParsedPlayer {
  row: number;
  team: string | null;
  firstName: string;
  lastName: string;
  birthdate: string | null;
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
  parents: ParsedParent[];
}

// ─── cell helpers ────────────────────────────────────────────────────────

function flattenCellValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return dateToIso(v);
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text === "string") return o.text;
  if (Array.isArray(o.richText)) {
    return o.richText
      .map((r) => (typeof (r as { text?: unknown })?.text === "string" ? (r as { text: string }).text : ""))
      .join("");
  }
  if ("result" in o) return flattenCellValue(o.result);
  return null;
}

function text(v: unknown): string | null {
  const t = flattenCellValue(v)?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

// exceljs returns dates at UTC midnight; use the UTC parts so a birthdate
// doesn't shift a day with the local timezone.
function dateToIso(v: unknown): string | null {
  if (v instanceof Date) {
    const yyyy = v.getUTCFullYear();
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(v.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = typeof v === "string" ? v.trim() : "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function isYes(v: unknown): boolean {
  return /^yes/i.test(text(v) ?? "");
}

// Forms get "N/A" typed into required fields for a parent who isn't there.
const PLACEHOLDER = /^(n\/?a|none|unknown|tbd|-+)$/i;

function joinName(...parts: (string | null)[]): string | null {
  const n = parts.filter((p) => p && !PLACEHOLDER.test(p)).join(" ");
  return n || null;
}

// Drops malformed addresses and placeholders like "N/A@gmail.com".
function cleanEmail(raw: string | null): string | null {
  if (!raw || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(raw)) return null;
  return PLACEHOLDER.test(raw.split("@")[0]) ? null : raw;
}

// "540 S 68th Ave, Omaha, Nebraska 68106" → parts. Anything that doesn't
// split cleanly stays whole in address_line1.
function splitAddress(raw: string | null) {
  const empty = { addressLine1: raw, city: null, state: null, postalCode: null };
  if (!raw) return empty;
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length < 3) return empty;
  const m = parts[parts.length - 1].match(/^(.*?)\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return empty;
  return {
    addressLine1: parts.slice(0, -2).join(", "),
    city: parts[parts.length - 2],
    state: m[1],
    postalCode: m[2],
  };
}

function parent(
  relationship: Relationship,
  fullName: string | null,
  email: string | null,
  phone: string | null,
  volunteerInterests: string | null
): ParsedParent[] {
  const name = fullName && joinName(...fullName.split(" "));
  if (!name) return [];
  return [{ relationship, fullName: name, email: cleanEmail(email), phone, volunteerInterests }];
}

// ─── parsing ─────────────────────────────────────────────────────────────

function parseSheet(ws: ExcelJS.Worksheet): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  let team: string | null = null;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // c(1) is column A.
    const c = (n: number) => row.getCell(n).value;
    const first = text(c(1));
    if (!first) return;
    const last = text(c(2));

    if (!last && c(3) == null) {
      team = first;
      return;
    }
    if (!last) {
      console.warn(`Row ${rowNumber}: no last name, skipped`);
      return;
    }

    const base = {
      row: rowNumber,
      team,
      firstName: first,
      lastName: last,
      birthdate: dateToIso(c(3)),
      newToProgram: isYes(c(5)),
    };

    const alternate = (text(c(8)) ?? "").includes("@") || text(c(31)) != null;

    if (alternate) {
      const fatherName = text(c(10));
      const motherName = text(c(14));
      players.push({
        ...base,
        ...splitAddress(text(c(6))),
        addressLine2: null,
        phone: text(c(7)),
        email: cleanEmail(text(c(8))),
        registrationFee: text(c(18)),
        paymentMethod: text(c(21)),
        shirtSize: text(c(23)),
        waiverSigned: text(c(31)) === "Captured",
        waiverSignedOn: dateToIso(c(32)),
        parents: [
          ...parent("father", fatherName, text(c(11)), text(c(12)), text(c(13))),
          ...parent("mother", motherName, text(c(15)), text(c(16)), text(c(17))),
        ],
      });
      return;
    }

    players.push({
      ...base,
      addressLine1: text(c(6)),
      addressLine2: text(c(7)),
      city: text(c(8)),
      state: text(c(9)),
      postalCode: text(c(10)),
      phone: text(c(11)),
      email: cleanEmail(text(c(12))),
      registrationFee: text(c(25)),
      paymentMethod: null,
      shirtSize: null,
      waiverSigned: text(c(23)) === "Captured",
      waiverSignedOn: dateToIso(c(24)),
      parents: [
        ...parent("father", joinName(text(c(13)), text(c(14))), text(c(15)), text(c(16)), text(c(17))),
        ...parent("mother", joinName(text(c(18)), text(c(19))), text(c(20)), text(c(21)), text(c(22))),
      ],
    });
  });

  return players;
}

function oneLineAddress(p: ParsedPlayer): string | null {
  const cityLine = [p.city, [p.state, p.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const line = [p.addressLine1, p.addressLine2, cityLine].filter(Boolean).join(", ");
  return line || null;
}

// ─── import ──────────────────────────────────────────────────────────────

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

interface ParentPlan {
  key: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  volunteerInterests: string | null;
  existing: MemberRow | null;
  id: string | null;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      season: { type: "string", default: "2026-27" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const file = positionals[0];
  if (!file) {
    console.error(USAGE);
    process.exit(1);
  }
  const season = values.season!;
  const dryRun = values["dry-run"]!;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets.find((w) => /season registration/i.test(w.name));
  if (!ws) throw new Error("No sheet named like 'Season Registration' in the workbook");

  const players = parseSheet(ws);
  const teams = [...new Set(players.map((p) => p.team ?? "(no team)"))];
  console.log(`Parsed ${players.length} players from "${ws.name}" (${teams.join(", ")})`);

  const supabase = createAdminClient();

  const { data: memberData, error: memberErr } = await supabase.from("members").select(MEMBER_COLUMNS);
  if (memberErr) throw new Error(`Loading members failed: ${memberErr.message}`);
  const members = (memberData ?? []) as MemberRow[];
  const byEmail = new Map<string, MemberRow>();
  const byNameNoEmail = new Map<string, MemberRow>();
  for (const m of members) {
    if (m.email) byEmail.set(m.email.toLowerCase(), m);
    else if (m.full_name) byNameNoEmail.set(m.full_name.toLowerCase(), m);
  }

  // One plan per distinct parent. Siblings list the same parent, so key on
  // name + email.
  const plans = new Map<string, ParentPlan>();
  const planFor = new Map<ParsedParent, ParentPlan | null>();
  const emailOwner = new Map<string, { key: string; relationship: Relationship }>();
  const emailDropped: string[] = [];
  const skipped: string[] = [];

  for (const p of players) {
    for (const pa of p.parents) {
      const lowerName = pa.fullName.toLowerCase();
      let email = pa.email;
      let lowerEmail = email?.toLowerCase() ?? null;
      let plan: ParentPlan | undefined;
      if (lowerEmail) {
        const owner = emailOwner.get(lowerEmail);
        if (owner && owner.relationship === pa.relationship) {
          // Same email as a sibling's father (or mother): the same person,
          // even if the name is spelled differently on the two forms.
          plan = plans.get(owner.key);
        } else if (owner) {
          emailDropped.push(`${pa.fullName} (row ${p.row}) shares ${email} with ${plans.get(owner.key)!.fullName}`);
          email = null;
          lowerEmail = null;
        }
      }
      const key = `${lowerName}|${lowerEmail ?? ""}`;
      plan ??= plans.get(key);
      if (!plan) {
        const existing =
          (lowerEmail ? byEmail.get(lowerEmail) : byNameNoEmail.get(lowerName)) ?? null;
        if (existing && (existing.deleted_at || existing.access_revoked_at)) {
          skipped.push(`${pa.fullName} (row ${p.row}): matches a deleted or revoked member, not linked`);
          planFor.set(pa, null);
          continue;
        }
        plan = {
          key,
          fullName: pa.fullName,
          email,
          phone: pa.phone,
          address: oneLineAddress(p),
          volunteerInterests: pa.volunteerInterests,
          existing,
          id: existing?.id ?? null,
        };
        plans.set(key, plan);
        if (lowerEmail) emailOwner.set(lowerEmail, { key, relationship: pa.relationship });
      } else {
        plan.phone ??= pa.phone;
        plan.volunteerInterests ??= pa.volunteerInterests;
      }
      planFor.set(pa, plan);
    }
  }

  const { data: playerData, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, birthdate")
    .eq("season", season);
  if (playerErr) throw new Error(`Loading players failed: ${playerErr.message}`);
  const playerKey = (first: string, last: string, birthdate: string | null) =>
    `${first.toLowerCase()}|${last.toLowerCase()}|${birthdate ?? ""}`;
  const existingPlayers = new Map(
    (playerData ?? []).map((r) => [playerKey(r.first_name, r.last_name, r.birthdate), r.id as string])
  );

  const planList = [...plans.values()];
  const newParents = planList.filter((pl) => !pl.existing);
  const newPlayers = players.filter((p) => !existingPlayers.has(playerKey(p.firstName, p.lastName, p.birthdate)));

  console.log(`Parents: ${planList.length} (${newParents.length} new, ${planList.length - newParents.length} already members)`);
  console.log(`  with an email they can sign in with: ${planList.filter((pl) => pl.email).length}`);
  console.log(`Players: ${players.length} (${newPlayers.length} new, ${players.length - newPlayers.length} updated)`);
  const noParents = players.filter((p) => p.parents.length === 0);
  if (noParents.length) {
    console.log(`Players with no parent info: ${noParents.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}`);
  }
  for (const line of emailDropped) console.log(`Shared email, imported without it: ${line}`);
  for (const line of skipped) console.log(`Skipped: ${line}`);

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  // Parents.
  let failures = 0;
  for (const pl of planList) {
    const sheet = {
      full_name: pl.fullName,
      phone: pl.phone,
      address: pl.address,
      volunteer_interests: pl.volunteerInterests,
    };
    if (!pl.existing) {
      const { data, error } = await supabase
        .from("members")
        .insert({ ...sheet, email: pl.email, status: "approved", role: "member" })
        .select("id")
        .single();
      if (error) {
        console.error(`Adding member ${pl.fullName} failed: ${error.message}`);
        failures++;
        continue;
      }
      pl.id = data.id;
      continue;
    }
    const ex = pl.existing;
    const update = ex.user_id
      ? Object.fromEntries(
          Object.entries(sheet).filter(([k, v]) => v != null && ex[k as keyof MemberRow] == null)
        )
      : sheet;
    if (Object.keys(update).length === 0) continue;
    const { error } = await supabase.from("members").update(update).eq("id", ex.id);
    if (error) {
      console.error(`Updating member ${pl.fullName} failed: ${error.message}`);
      failures++;
    }
  }

  // Players and their parent links.
  let links = 0;
  for (const p of players) {
    const row = {
      season,
      team: p.team,
      first_name: p.firstName,
      last_name: p.lastName,
      birthdate: p.birthdate,
      new_to_program: p.newToProgram,
      address_line1: p.addressLine1,
      address_line2: p.addressLine2,
      city: p.city,
      state: p.state,
      postal_code: p.postalCode,
      phone: p.phone,
      email: p.email,
      registration_fee: p.registrationFee,
      payment_method: p.paymentMethod,
      shirt_size: p.shirtSize,
      waiver_signed: p.waiverSigned,
      waiver_signed_on: p.waiverSignedOn,
    };
    let id = existingPlayers.get(playerKey(p.firstName, p.lastName, p.birthdate)) ?? null;
    if (id) {
      const { error } = await supabase.from("players").update(row).eq("id", id);
      if (error) {
        console.error(`Updating player ${p.firstName} ${p.lastName} (row ${p.row}) failed: ${error.message}`);
        failures++;
        continue;
      }
    } else {
      const { data, error } = await supabase.from("players").insert(row).select("id").single();
      if (error) {
        console.error(`Adding player ${p.firstName} ${p.lastName} (row ${p.row}) failed: ${error.message}`);
        failures++;
        continue;
      }
      id = data.id as string;
    }

    // Deduped by member: one upsert can't touch the same row twice.
    const linkByMember = new Map<string, { player_id: string; member_id: string; relationship: Relationship }>();
    for (const pa of p.parents) {
      const memberId = planFor.get(pa)?.id;
      if (memberId && !linkByMember.has(memberId)) {
        linkByMember.set(memberId, { player_id: id, member_id: memberId, relationship: pa.relationship });
      }
    }
    const parentLinks = [...linkByMember.values()];
    if (parentLinks.length === 0) continue;
    const { error } = await supabase
      .from("player_parents")
      .upsert(parentLinks, { onConflict: "player_id,member_id" });
    if (error) {
      console.error(`Linking parents of ${p.firstName} ${p.lastName} failed: ${error.message}`);
      failures++;
      continue;
    }
    links += parentLinks.length;
  }

  console.log(`\nDone. ${links} parent links written${failures ? `, ${failures} failures (see above)` : ""}.`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
