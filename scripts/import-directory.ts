/*
 * One-shot bootstrap import of Luann's MCC-YYYY.xlsx directory.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-directory.ts <path> [--dry-run]
 *
 * The script parses three sheets:
 *   - "Attend MCC"             → directory_category='regular'
 *   - "Extended FamilyFriends" → directory_category='extended'
 *   - "Asleep in Jesus"        → directory_category='memorial'
 *
 * Sheets "Birthdays" and "Anniversaries" are derived views of the same data,
 * so they're skipped.
 *
 * Parsing rules (matching the actual sheet layout):
 *   - A header row has no leading whitespace on column A. The cell holds
 *     "LASTNAME" or "LASTNAME   -   M/D/YYYY" (anniversary). Address is in
 *     column C, home phone in column D (prefixed "h. ").
 *   - A member row has 2-space indent on column A: "Firstname Middle
 *     (Nickname)". Birthday in B, email in C, cell phone in D (prefixed
 *     "c. ").
 *   - A blank row terminates the household.
 *
 * Relationship inference:
 *   - Anniversary present AND ≥2 members → first two = spouses, rest = their
 *     children (spouse bidirectional + parent↔child bidirectional).
 *   - Anniversary absent → no relationships inferred. The household-grouping
 *     UI falls back to shared-address matching.
 *
 * Match strategy (per parsed member):
 *   1. by lowercased email → update existing
 *   2. else by lowercased full_name → update existing
 *   3. else → insert new (status='approved', role='member', no user_id)
 *
 * Shared emails (e.g. Ed & Becky Baker both at ebaker@abbnebraska.com): the
 * unique index from migration 0017 doesn't allow duplicates. Track emails
 * seen during this run; on collision drop the email from the second row but
 * keep the person.
 */

import ExcelJS from "exceljs";
import { createAdminClient } from "../lib/supabase/admin";

type DirectoryCategory = "regular" | "extended" | "memorial";
type RelKind = "spouse" | "parent" | "child";

interface ParsedMember {
  fullName: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;       // cell
  homePhone: string | null;   // only set on the household head
  birthday: string | null;    // YYYY-MM-DD
  address: string | null;
  anniversary: string | null; // YYYY-MM-DD; only set on the spouses
  deceasedAt: string | null;  // YYYY-MM-DD; memorial only
  category: DirectoryCategory;
  sourceLabel: string;        // for the report — "Attend MCC R6", etc.
}

interface ParsedHousehold {
  lastName: string;
  anniversary: string | null;
  address: string | null;
  homePhone: string | null;
  members: ParsedMember[];
  category: DirectoryCategory;
  sourceSheet: string;
  sourceRow: number;
}

interface RelEdge {
  fromIdx: number; // index into the flat parsedMembers array
  toIdx: number;
  kind: RelKind;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function parseDateLoose(raw: string): string | null {
  // Accepts "6/13/1998", "10/25/08", etc. Returns YYYY-MM-DD or null.
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  if (y.length === 2) {
    // 2-digit year: <50 → 20xx, >=50 → 19xx. Matches sheet conventions.
    const n = parseInt(y, 10);
    y = (n < 50 ? 2000 + n : 1900 + n).toString();
  }
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function dateToIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    // exceljs returns dates in UTC midnight. Use the UTC components so a
    // birthday cell of 1970-04-08 stays 1970-04-08 regardless of local TZ.
    const yyyy = v.getUTCFullYear();
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(v.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "string") return parseDateLoose(v);
  return null;
}

// Convert an ExcelJS cell value to a plain string, handling hyperlinks,
// rich text, and formula cells. Returns null when no usable text is found —
// the previous `String(v)` fallback turned rich-text objects into the
// literal string "[object Object]", which got written to the DB.
function flattenCellValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
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

function cellText(v: unknown): string | null {
  const t = flattenCellValue(v);
  if (t == null) return null;
  const trimmed = t.trim();
  return trimmed === "" ? null : trimmed;
}

function rawCellText(v: unknown): string | null {
  // Like cellText but preserves leading whitespace (we use it for the name
  // column to detect indent).
  const t = flattenCellValue(v);
  if (t == null) return null;
  return t === "" ? null : t;
}

function stripPhonePrefix(raw: string | null): string | null {
  if (!raw) return null;
  // "h. 895-6265", "c. 830-5735" — drop the type prefix.
  return raw.replace(/^[hc]\.\s*/i, "").trim() || null;
}

function parseNicknameAndFirstName(raw: string): { firstName: string; nickname: string | null } {
  // "Edward (Ed)" → firstName="Edward", nickname="Ed"
  // "Rebecca (Becky) Ann" → firstName="Rebecca Ann", nickname="Becky"
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
  if (!m) return { firstName: raw.trim(), nickname: null };
  const before = m[1].trim();
  const inner = m[2].trim();
  const after = m[3].trim();
  const firstName = [before, after].filter(Boolean).join(" ").trim();
  return { firstName, nickname: inner || null };
}

function normLastName(raw: string): string {
  // Convert "BACKENS" → "Backens", "McGEE" → "McGee".
  // Heuristic: if the input is all-caps (or mostly), title-case it; otherwise
  // leave it. Names like McGee, O'Brien are awkward in title-case; leave the
  // mixed case alone if present.
  if (/^[A-Z'.\s-]+$/.test(raw)) {
    return raw
      .toLowerCase()
      .replace(/(^|[\s'.-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
  }
  return raw.trim();
}

// ─── parsing ─────────────────────────────────────────────────────────────

function parseHouseholdSheet(
  ws: ExcelJS.Worksheet,
  category: "regular" | "extended",
  startRow: number,
  sheetName: string
): ParsedHousehold[] {
  const households: ParsedHousehold[] = [];
  let current: ParsedHousehold | null = null;

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber < startRow) return;

    const nameRaw = rawCellText(row.getCell(1).value);

    // Blank → end household.
    if (nameRaw == null || nameRaw.trim() === "") {
      if (current && current.members.length > 0) households.push(current);
      current = null;
      return;
    }

    // Header (no leading space).
    if (!nameRaw.startsWith(" ")) {
      if (current && current.members.length > 0) households.push(current);
      const text = nameRaw.trim();
      // Split on dash with surrounding spaces. Spreadsheet uses "   -   "
      // but allow flex.
      const dashIdx = text.search(/\s-\s/);
      let lastName: string;
      let anniversary: string | null = null;
      if (dashIdx >= 0) {
        lastName = text.slice(0, dashIdx).trim();
        const annRaw = text.slice(dashIdx + 2).trim();
        anniversary = parseDateLoose(annRaw);
      } else {
        lastName = text;
      }
      const addressCell = cellText(row.getCell(3).value);
      const phoneCell = cellText(row.getCell(4).value);
      current = {
        lastName: normLastName(lastName),
        anniversary,
        address: addressCell && !addressCell.startsWith("*") ? addressCell : null,
        homePhone: stripPhonePrefix(phoneCell),
        members: [],
        category,
        sourceSheet: sheetName,
        sourceRow: rowNumber,
      };
      return;
    }

    // Member row (indented).
    if (!current) return;
    const memberRaw = nameRaw.trim();
    if (memberRaw.startsWith("*")) return; // sheet annotations like "*baby due"
    const { firstName, nickname } = parseNicknameAndFirstName(memberRaw);
    const birthdayCell = row.getCell(2).value;
    const emailCell = cellText(row.getCell(3).value);
    const phoneCell = cellText(row.getCell(4).value);
    const memberIdx = current.members.length;
    current.members.push({
      fullName: `${firstName} ${current.lastName}`.trim(),
      nickname,
      email: emailCell && emailCell.includes("@") ? emailCell.toLowerCase() : null,
      phone: stripPhonePrefix(phoneCell),
      homePhone: memberIdx === 0 ? current.homePhone : null,
      birthday: dateToIso(birthdayCell),
      address: current.address,
      anniversary: current.anniversary && memberIdx < 2 ? current.anniversary : null,
      deceasedAt: null,
      category,
      sourceLabel: `${sheetName} R${rowNumber}`,
    });
  });

  if (current && (current as ParsedHousehold).members.length > 0) {
    households.push(current);
  }
  return households;
}

function parseMemorialSheet(ws: ExcelJS.Worksheet, startRow: number): ParsedMember[] {
  // Each "household" = a family-context grouping of deceased people. We don't
  // build relationships; we just emit one memorial member per indented row,
  // tagging the header's parenthetical context (e.g. "Cory & Erica's child")
  // into nickname.
  const members: ParsedMember[] = [];
  let currentLast = "";
  let currentContext: string | null = null;

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber < startRow) return;

    const nameRaw = rawCellText(row.getCell(1).value);
    if (nameRaw == null || nameRaw.trim() === "") {
      currentContext = null;
      return;
    }

    if (!nameRaw.startsWith(" ")) {
      // Header: "LASTNAME (context)" — context may include anniversary,
      // relation, etc.
      const m = nameRaw.trim().match(/^([^(]+?)(?:\s*\(([^)]+)\))?$/);
      currentLast = normLastName((m?.[1] ?? nameRaw).trim());
      currentContext = m?.[2]?.trim() ?? null;
      return;
    }

    const memberRaw = nameRaw.trim();
    const { firstName, nickname: innerNick } = parseNicknameAndFirstName(memberRaw);
    // Combine the member-level nickname with the household context.
    const nick = [innerNick, currentContext].filter(Boolean).join("; ") || null;
    const birth = dateToIso(row.getCell(2).value);
    const death = dateToIso(row.getCell(3).value);
    members.push({
      fullName: `${firstName} ${currentLast}`.trim(),
      nickname: nick,
      email: null,
      phone: null,
      homePhone: null,
      birthday: birth,
      address: null,
      anniversary: null,
      deceasedAt: death,
      category: "memorial",
      sourceLabel: `Asleep in Jesus R${rowNumber}`,
    });
  });

  return members;
}

// ─── matching + apply ────────────────────────────────────────────────────

interface ExistingMember {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface ApplyResult {
  inserted: number;
  updated: number;
  unchanged: number;
  nameOnlyMatches: string[];
  emailCollisionsDropped: string[];
  relationshipsCreated: number;
}

async function applyImport(
  members: ParsedMember[],
  households: ParsedHousehold[],
  dryRun: boolean
): Promise<ApplyResult> {
  const supabase = createAdminClient();

  // Pull existing members in one shot.
  const { data: existing, error: fetchErr } = await supabase
    .from("members")
    .select("id, email, full_name");
  if (fetchErr) throw new Error(`Fetch existing failed: ${fetchErr.message}`);
  const existingRows = (existing as ExistingMember[] | null) ?? [];

  const byEmail = new Map<string, ExistingMember>();
  const byName = new Map<string, ExistingMember[]>();
  for (const m of existingRows) {
    if (m.email) byEmail.set(m.email.toLowerCase(), m);
    if (m.full_name) {
      const k = m.full_name.toLowerCase().trim();
      const arr = byName.get(k) ?? [];
      arr.push(m);
      byName.set(k, arr);
    }
  }

  // Resolve each parsed member to a DB id (existing or to-be-created).
  //
  // Email-collision policy: within a single run, the first parsed member to
  // claim a given email keeps it; subsequent occurrences drop it. This is
  // independent of DB state — even if a DB row already has the email, a
  // *second* parsed member with that same email is treated as a collision.
  // Without this, on re-runs the byEmail check would match the collision
  // row to whichever DB row had the email, clobbering its identity.
  const claimedInThisRun = new Set<string>();
  const emailCollisions: string[] = [];
  const nameOnlyMatches: string[] = [];
  const resolved: Array<{
    parsed: ParsedMember;
    id: string | null;
    action: "insert" | "update" | "unchanged";
    matchedExisting?: ExistingMember;
    matchReason?: "email" | "name";
  }> = [];

  for (const pm of members) {
    // Email collision dedupe within this run.
    let email = pm.email;
    if (email) {
      if (claimedInThisRun.has(email)) {
        emailCollisions.push(`${pm.sourceLabel}: dropped ${email} (already used in this run)`);
        email = null;
      } else {
        claimedInThisRun.add(email);
      }
    }
    const patched: ParsedMember = { ...pm, email };

    // Match.
    let match: ExistingMember | undefined;
    let matchReason: "email" | "name" | undefined;
    if (patched.email) {
      match = byEmail.get(patched.email);
      if (match) matchReason = "email";
    }
    if (!match) {
      const candidates = byName.get(patched.fullName.toLowerCase().trim()) ?? [];
      if (candidates.length === 1) {
        match = candidates[0];
        matchReason = "name";
        nameOnlyMatches.push(`${patched.fullName}  ←  ${patched.sourceLabel}`);
      } else if (candidates.length > 1) {
        // Ambiguous — skip the match, insert as new and flag.
        nameOnlyMatches.push(`AMBIGUOUS ${patched.fullName}  (${candidates.length} candidates) — inserting new`);
      }
    }

    resolved.push({
      parsed: patched,
      id: match?.id ?? null,
      action: match ? "update" : "insert",
      matchedExisting: match,
      matchReason,
    });
  }

  if (dryRun) {
    console.log("\n=== DRY RUN — no writes performed ===");
    const ins = resolved.filter((r) => r.action === "insert").length;
    const upd = resolved.filter((r) => r.action === "update").length;
    console.log(`Would insert: ${ins}`);
    console.log(`Would update: ${upd}`);
    console.log(`Households parsed: ${households.length}`);

    const updates = resolved.filter((r) => r.action === "update");
    if (updates.length) {
      console.log(`\nUpdates (existing DB row ← spreadsheet row):`);
      for (const r of updates) {
        const existingName = r.matchedExisting?.full_name ?? "(no name)";
        const existingEmail = r.matchedExisting?.email ?? "(no email)";
        console.log(
          `  [${r.matchReason}] ${existingName} <${existingEmail}>  ←  ${r.parsed.fullName} (${r.parsed.sourceLabel})`
        );
      }
    }
    if (nameOnlyMatches.length) {
      console.log(`\nName-only matches (spot-check these):`);
      for (const n of nameOnlyMatches.slice(0, 30)) console.log(`  ${n}`);
      if (nameOnlyMatches.length > 30) console.log(`  …and ${nameOnlyMatches.length - 30} more`);
    }
    if (emailCollisions.length) {
      console.log(`\nEmail collisions (kept person, dropped email):`);
      for (const c of emailCollisions.slice(0, 30)) console.log(`  ${c}`);
      if (emailCollisions.length > 30) console.log(`  …and ${emailCollisions.length - 30} more`);
    }
    return { inserted: ins, updated: upd, unchanged: 0, nameOnlyMatches, emailCollisionsDropped: emailCollisions, relationshipsCreated: 0 };
  }

  // Apply writes. Inserts first to assign ids, then updates, then relationships.
  let inserted = 0;
  let updated = 0;

  for (const r of resolved) {
    if (r.action === "insert") {
      const { data, error } = await supabase
        .from("members")
        .insert(toInsertRow(r.parsed))
        .select("id")
        .single();
      if (error) {
        console.error(`INSERT failed for ${r.parsed.fullName} (${r.parsed.sourceLabel}): ${error.message}`);
        continue;
      }
      r.id = data.id;
      inserted++;
    } else if (r.action === "update" && r.id) {
      const { error } = await supabase.from("members").update(toUpdateRow(r.parsed)).eq("id", r.id);
      if (error) {
        console.error(`UPDATE failed for ${r.parsed.fullName} (${r.parsed.sourceLabel}): ${error.message}`);
        continue;
      }
      updated++;
    }
  }

  // Build relationship edges from households. Index lookup by parsedMember
  // identity (we kept order in `resolved`, but we also need to map back from
  // a household member to its resolved entry).
  const parsedToResolvedId = new Map<ParsedMember, string | null>();
  resolved.forEach((r) => parsedToResolvedId.set(r.parsed, r.id));
  // Re-bind via fullName + sourceLabel because we patched (email) on a copy.
  // Easier: build by (fullName, sourceLabel) key from the original `members`.
  const idByLabel = new Map<string, string | null>();
  resolved.forEach((r) => idByLabel.set(r.parsed.sourceLabel, r.id));

  const relEdges: { member_id: string; related_member_id: string; relationship: RelKind }[] = [];
  for (const hh of households) {
    if (!hh.anniversary || hh.members.length < 2) continue;
    const ids = hh.members.map((m) => idByLabel.get(m.sourceLabel) ?? null);
    if (!ids[0] || !ids[1]) continue;
    const aId = ids[0];
    const bId = ids[1];
    relEdges.push({ member_id: aId, related_member_id: bId, relationship: "spouse" });
    relEdges.push({ member_id: bId, related_member_id: aId, relationship: "spouse" });
    // Convention (per MembersTab + addMemberRelationship): a row
    // (member_id=X, rel='parent', related_id=Y) means "Y is X's parent".
    // For a kid C with parents A and B:
    //   (C, parent, A)  — "A is C's parent"
    //   (A, child, C)   — "C is A's child"
    //   (C, parent, B)  — "B is C's parent"
    //   (B, child, C)   — "C is B's child"
    for (let i = 2; i < hh.members.length; i++) {
      const cId = ids[i];
      if (!cId) continue;
      relEdges.push({ member_id: cId, related_member_id: aId, relationship: "parent" });
      relEdges.push({ member_id: aId, related_member_id: cId, relationship: "child" });
      relEdges.push({ member_id: cId, related_member_id: bId, relationship: "parent" });
      relEdges.push({ member_id: bId, related_member_id: cId, relationship: "child" });
    }
  }

  // Drop any self-edges. Shouldn't happen given the algorithm, but if two
  // parsed members resolve to the same DB id (cross-sheet name collision)
  // we'd otherwise violate the 0017 no-self check constraint.
  const idToName = new Map<string, string>();
  resolved.forEach((r) => {
    if (r.id) idToName.set(r.id, r.parsed.fullName);
  });
  const selfEdges = relEdges.filter((e) => e.member_id === e.related_member_id);
  if (selfEdges.length > 0) {
    console.log(`Dropped ${selfEdges.length} self-edges:`);
    for (const e of selfEdges) {
      console.log(`  ${idToName.get(e.member_id) ?? "?"} <-${e.relationship}-> self`);
    }
  }
  const cleanEdges = relEdges.filter((e) => e.member_id !== e.related_member_id);
  console.log(`Built ${cleanEdges.length} relationship edges from ${households.length} households (after self-edge filter)`);

  let relationshipsCreated = 0;
  if (cleanEdges.length > 0) {
    const { error: relErr, data } = await supabase
      .from("member_relationships")
      .upsert(cleanEdges, {
        onConflict: "member_id,related_member_id,relationship",
        ignoreDuplicates: true,
      })
      .select("member_id");
    if (relErr) {
      console.error(`Relationship upsert failed: ${relErr.message}`);
    } else {
      relationshipsCreated = data?.length ?? 0;
    }
  }

  return {
    inserted,
    updated,
    unchanged: 0,
    nameOnlyMatches,
    emailCollisionsDropped: emailCollisions,
    relationshipsCreated,
  };
}

// Directory columns only — never includes role/status/email/etc. that the
// 0021 column-restriction trigger forbids changing on existing rows.
function toUpdateRow(pm: ParsedMember) {
  return {
    full_name: pm.fullName,
    nickname: pm.nickname,
    phone: pm.phone,
    home_phone: pm.homePhone,
    birthday: pm.birthday,
    address: pm.address,
    anniversary: pm.anniversary,
    deceased_at: pm.deceasedAt,
    directory_category: pm.category,
  };
}

// Insert payload includes the columns we want set once on new directory
// entries (status='approved', role='member', email from sheet).
function toInsertRow(pm: ParsedMember) {
  return {
    ...toUpdateRow(pm),
    email: pm.email,
    status: "approved",
    role: "member",
  };
}

// ─── main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: tsx scripts/import-directory.ts <path-to-xlsx> [--dry-run]");
    process.exit(1);
  }

  console.log(`Loading ${file}…`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // Sheet 1: Attend MCC, headers at R3, data starts R4.
  const attendWs = wb.getWorksheet("Attend MCC");
  if (!attendWs) throw new Error("Sheet 'Attend MCC' not found");
  const regularHouseholds = parseHouseholdSheet(attendWs, "regular", 4, "Attend MCC");

  // Sheet 2: Extended FamilyFriends, headers at R1, data starts R3.
  const extWs = wb.getWorksheet("Extended FamilyFriends");
  if (!extWs) throw new Error("Sheet 'Extended FamilyFriends' not found");
  const extendedHouseholds = parseHouseholdSheet(extWs, "extended", 3, "Extended FamilyFriends");

  // Sheet 5: Asleep in Jesus, headers at R1, data starts R3.
  const memorialWs = wb.getWorksheet("Asleep in Jesus");
  if (!memorialWs) throw new Error("Sheet 'Asleep in Jesus' not found");
  const memorialMembers = parseMemorialSheet(memorialWs, 3);

  const allHouseholds = [...regularHouseholds, ...extendedHouseholds];
  const allMembers: ParsedMember[] = [
    ...allHouseholds.flatMap((h) => h.members),
    ...memorialMembers,
  ];

  console.log(`Parsed: ${regularHouseholds.length} regular households, ${extendedHouseholds.length} extended households, ${memorialMembers.length} memorials`);
  console.log(`Total members: ${allMembers.length}`);

  const result = await applyImport(allMembers, allHouseholds, dryRun);

  console.log("\n=== RESULT ===");
  console.log(`Inserted:               ${result.inserted}`);
  console.log(`Updated:                ${result.updated}`);
  console.log(`Relationships created:  ${result.relationshipsCreated}`);
  console.log(`Name-only matches:      ${result.nameOnlyMatches.length}`);
  console.log(`Email collisions:       ${result.emailCollisionsDropped.length}`);

  if (!dryRun && result.nameOnlyMatches.length > 0) {
    console.log("\nName-only matches (review for false positives):");
    for (const n of result.nameOnlyMatches.slice(0, 30)) console.log(`  ${n}`);
    if (result.nameOnlyMatches.length > 30) console.log(`  …and ${result.nameOnlyMatches.length - 30} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
