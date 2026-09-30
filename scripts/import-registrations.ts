/*
 * Imports the season registration spreadsheet onto the season board: each
 * player's registration details go on their olb_players row, and their
 * parents become members (so they can sign in), linked through
 * olb_player_parents. New players land under No team yet with their age
 * group; players already on the board (same name, and birthdate when both have
 * one) keep their team. See lib/teams/apply-registration.ts for the matching
 * rules. Safe to re-run after the spreadsheet changes.
 *
 * Usage:
 *   npm run import-registrations -- <path-to-xlsx> [--season 2026-2027] [--dry-run]
 *
 * Reads the sheet whose name contains "Season Registration". Layout:
 *   - Row 1 is the form's column headers.
 *   - A row with only column A filled ("10U", "12U", …) starts an age group;
 *     the players below it belong to it.
 *   - Most player rows follow the headers (name, birthdate, age, new, address
 *     split into parts, athlete phone/email, father first/last/email/phone/
 *     serving, mother first/last/email/phone/serving, waiver, waiver date,
 *     fee). A few late registrations were pasted in from a newer form export
 *     with a different column order (one-line address, parents' full names,
 *     payment method, shirt size, waiver at the far right). Those are spotted
 *     by an email address in column H, where the standard layout has the city.
 *   - Rows with only a name and birthdate are imported as players with no
 *     parents. Placeholder parents ("N/A") are skipped and placeholder emails
 *     ("N/A@gmail.com") dropped.
 *   - The sheet has no "add me to the directory?" column, so these players
 *     are listed in the Directory.
 *
 * Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { basename } from "node:path";
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { createAdminClient } from "../lib/supabase/admin";
import {
  applyRegistration,
  cleanEmail,
  cleanName,
  type RegistrationParent,
  type RegistrationRecord,
} from "../lib/teams/apply-registration";

const USAGE =
  "Usage: npm run import-registrations -- <path-to-xlsx> [--season 2026-2027] [--dry-run]";

type Parsed = RegistrationRecord & { row: number };

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
  relationship: RegistrationParent["relationship"],
  fullName: string | null,
  email: string | null,
  phone: string | null,
  volunteerInterests: string | null,
): RegistrationParent[] {
  const name = cleanName(fullName);
  return name ? [{ relationship, fullName: name, email: cleanEmail(email), phone, volunteerInterests }] : [];
}

// ─── parsing ─────────────────────────────────────────────────────────────

function parseSheet(ws: ExcelJS.Worksheet): Parsed[] {
  const players: Parsed[] = [];
  let ageGroup: string | null = null;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // c(1) is column A.
    const c = (n: number) => row.getCell(n).value;
    const first = text(c(1));
    if (!first) return;
    const last = text(c(2));

    if (!last && c(3) == null) {
      ageGroup = first;
      return;
    }
    if (!last) {
      console.warn(`Row ${rowNumber}: no last name, skipped`);
      return;
    }

    const base = {
      row: rowNumber,
      ageGroup,
      firstName: first,
      lastName: last,
      dob: dateToIso(c(3)),
      newToProgram: isYes(c(5)),
      directoryOptin: true,
    };

    const alternate = (text(c(8)) ?? "").includes("@") || text(c(31)) != null;

    if (alternate) {
      players.push({
        ...base,
        ...splitAddress(text(c(6))),
        addressLine2: null,
        phone: text(c(7)),
        email: text(c(8)),
        registrationFee: text(c(18)),
        paymentMethod: text(c(21)),
        shirtSize: text(c(23)),
        waiverSigned: text(c(31)) === "Captured",
        waiverSignedOn: dateToIso(c(32)),
        parents: [
          ...parent("father", text(c(10)), text(c(11)), text(c(12)), text(c(13))),
          ...parent("mother", text(c(14)), text(c(15)), text(c(16)), text(c(17))),
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
      email: text(c(12)),
      registrationFee: text(c(25)),
      paymentMethod: null,
      shirtSize: null,
      waiverSigned: text(c(23)) === "Captured",
      waiverSignedOn: dateToIso(c(24)),
      parents: [
        ...parent("father", cleanName(text(c(13)), text(c(14))), text(c(15)), text(c(16)), text(c(17))),
        ...parent("mother", cleanName(text(c(18)), text(c(19))), text(c(20)), text(c(21)), text(c(22))),
      ],
    });
  });

  return players;
}

// ─── main ────────────────────────────────────────────────────────────────

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      season: { type: "string", default: "2026-2027" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const file = positionals[0];
  if (!file) {
    console.error(USAGE);
    process.exit(1);
  }
  const season = values.season!;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets.find((w) => /season registration/i.test(w.name));
  if (!ws) throw new Error("No sheet named like 'Season Registration' in the workbook");

  const players = parseSheet(ws);
  const groups = [...new Set(players.map((p) => p.ageGroup ?? "(none)"))];
  console.log(`Parsed ${players.length} players from "${ws.name}" (${groups.join(", ")})`);
  const noParents = players.filter((p) => p.parents.length === 0);
  if (noParents.length) {
    console.log(`Players with no parent info: ${noParents.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}`);
  }

  const db = createAdminClient();
  const { data: board, error: boardErr } = await db
    .from("olb_boards")
    .select("id")
    .eq("season", season)
    .maybeSingle();
  if (boardErr) throw new Error(`Loading the season board failed: ${boardErr.message}`);
  if (!board) throw new Error(`No season board for ${season}. Run migration 0089 first.`);

  // Fail before writing anything if 0090 isn't applied.
  const { error: schemaErr } = await db.from("olb_player_parents").select("player_id").limit(1);
  if (schemaErr) throw new Error(`olb_player_parents isn't there yet. Run migration 0090 first. (${schemaErr.message})`);

  if (values["dry-run"]) {
    console.log("\nDry run: nothing written.");
    return;
  }

  let created = 0;
  let updated = 0;
  let links = 0;
  let members = 0;
  let failures = 0;
  for (const p of players) {
    try {
      const r = await applyRegistration(db, board.id as string, p);
      if (r.created) created++;
      else updated++;
      links += r.parentsLinked;
      members += r.membersCreated;
      for (const note of r.notes) console.log(`Row ${p.row} (${p.firstName} ${p.lastName}): ${note}`);
    } catch (err) {
      failures++;
      console.error(`Row ${p.row} (${p.firstName} ${p.lastName}): ${(err as Error).message}`);
    }
  }

  const summary = { source: "registrations", players: players.length, created, updated, members, links, failures };
  await db.from("olb_import_batches").insert({ board_id: board.id, filename: basename(file), summary });

  console.log(
    `\nDone. Players: ${created} added, ${updated} updated. Parents: ${members} new members, ${links} links.` +
      (failures ? ` ${failures} failures (see above).` : ""),
  );
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
