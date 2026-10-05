/*
 * Records the club Gmail's Venmo payments against players on the season
 * board. Each Venmo received that we can tie to a family, for an amount that
 * matches what those players owe (their registration fee, or their balance
 * once charges are on), becomes a payment: How they paid = Venmo, Paid on =
 * the Venmo's date, the Venmo note in the payment's note. See
 * lib/finances/venmo-match.ts for the matching rules.
 *
 * Everything else lands in an exceptions spreadsheet for the Treasurer to
 * record by hand on the Payments page.
 *
 * Usage:
 *   npm run import-venmo -- <venmo-export.xlsx> [--apply] [--season 2026-2027]
 *                           [--since YYYY-MM-DD] [--out exceptions.xlsx]
 *
 * Without --apply it's a preview: nothing is written to the database, but the
 * exceptions sheet is. --since skips Venmos before that day (default: the
 * day the season's first registration came in). Safe to re-run: each payment
 * keeps the Venmo's Gmail message id in its reference, and Venmos already in
 * are skipped.
 *
 * The export's first sheet has a header row with name, amount, notes,
 * paid_or_received, paid_to_or_received_from, what_it_was_about, date,
 * gmail_message_id.
 *
 * Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { createAdminClient } from "../lib/supabase/admin";
import { registrationFeeCents } from "../lib/finances/logic";
import { matchVenmo, type MatchPlayer, type VenmoRow } from "../lib/finances/venmo-match";
import type { Charge, Payment } from "../lib/finances/types";

const USAGE =
  "Usage: npm run import-venmo -- <venmo-export.xlsx> [--apply] [--season 2026-2027] [--since YYYY-MM-DD] [--out exceptions.xlsx]";

function text(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === "object" && "text" in v && typeof v.text === "string") return v.text.trim() || null;
  if (typeof v === "object" && "result" in v) return text(v.result as ExcelJS.CellValue);
  const s = String(v).trim();
  return s || null;
}

function readExport(ws: ExcelJS.Worksheet): VenmoRow[] {
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = text(cell.value);
    if (h) header.set(h.toLowerCase(), col);
  });
  for (const need of ["amount", "paid_or_received", "date", "gmail_message_id"]) {
    if (!header.has(need)) throw new Error(`The Venmo sheet has no "${need}" column.`);
  }
  const col = (row: ExcelJS.Row, name: string) => (header.has(name) ? text(row.getCell(header.get(name)!).value) : null);
  const rows: VenmoRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    rows.push({
      row: n,
      type: col(row, "paid_or_received") ?? "",
      from: col(row, "paid_to_or_received_from"),
      amount: col(row, "amount"),
      about: col(row, "what_it_was_about") ?? col(row, "notes"),
      date: col(row, "date"),
      messageId: col(row, "gmail_message_id"),
    });
  });
  return rows;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: "boolean", default: false },
      season: { type: "string", default: "2026-2027" },
      since: { type: "string" },
      out: { type: "string" },
    },
  });
  const file = positionals[0];
  if (!file) throw new Error(USAGE);
  const out = values.out ?? join(dirname(file), `${basename(file, ".xlsx")}-exceptions.xlsx`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows = readExport(wb.worksheets[0]);
  console.log(`Read ${rows.length} Venmo rows from "${wb.worksheets[0].name}"`);

  const supabase = createAdminClient();
  const { data: board, error: boardErr } = await supabase
    .from("olb_boards")
    .select("id, season")
    .eq("season", values.season!)
    .maybeSingle();
  if (boardErr) throw new Error(`Loading the season board failed: ${boardErr.message}`);
  if (!board) throw new Error(`No season board for ${values.season}.`);

  const [p, c, pay] = await Promise.all([
    supabase
      .from("olb_players")
      .select(
        "id, full_name, registration_fee, registered_at, team:olb_teams(name), parents:olb_player_parents(member_id, member:members(full_name))"
      )
      .eq("board_id", board.id),
    supabase.from("olb_charges").select("player_id, kind, amount_cents, voided_at").eq("board_id", board.id),
    supabase.from("olb_payments").select("player_id, amount_cents, paid_on, reference, voided_at").eq("board_id", board.id),
  ]);
  for (const r of [p, c, pay]) if (r.error) throw new Error(`Loading the board failed: ${r.error.message}`);

  type Row = {
    id: string;
    full_name: string;
    registration_fee: string | null;
    registered_at: string | null;
    team: { name: string } | null;
    parents: { member_id: string; member: { full_name: string | null } | null }[];
  };
  const playerRows = p.data as unknown as Row[];
  const players: MatchPlayer[] = playerRows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    team: r.team?.name ?? null,
    fee_cents: registrationFeeCents(r.registration_fee),
    parent_ids: r.parents.map((pa) => pa.member_id),
    parent_names: r.parents.map((pa) => pa.member?.full_name ?? "").filter(Boolean),
  }));

  const firstRegistration = playerRows
    .map((r) => r.registered_at?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort()[0];
  const since = values.since ?? firstRegistration ?? null;
  console.log(`${players.length} players on ${board.season}; matching Venmos from ${since ?? "any date"}`);

  const result = matchVenmo(
    rows,
    players,
    c.data as Pick<Charge, "player_id" | "kind" | "amount_cents" | "voided_at">[],
    pay.data as Pick<Payment, "player_id" | "amount_cents" | "paid_on" | "reference" | "voided_at">[],
    { since }
  );

  const nameOf = new Map(players.map((pl) => [pl.id, pl.full_name]));
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  console.log(`\nMatched (${result.applied.length}):`);
  for (const a of result.applied) {
    const who = a.splits.map((s) => `${nameOf.get(s.player_id)} ${dollars(s.amount_cents)}`).join(", ");
    console.log(`  ${a.paid_on}  ${a.row.from}  ${dollars(a.amount_cents)} → ${who}  [${a.how}]`);
  }
  console.log(`\nExceptions: ${result.exceptions.length}`);
  console.log(`Already imported: ${result.alreadyImported.length}`);
  console.log(`Not money received (transfers, payments out, notices): ${result.notPayments.length}`);

  // The exceptions workbook, plus what was (or would be) applied.
  const xb = new ExcelJS.Workbook();
  const ex = xb.addWorksheet("Exceptions");
  ex.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "From", key: "from", width: 24 },
    { header: "Amount", key: "amount", width: 11, style: { numFmt: "$#,##0.00" } },
    { header: "What it was about", key: "about", width: 40 },
    { header: "Why it wasn't applied", key: "reason", width: 50 },
    { header: "Possible players", key: "candidates", width: 70 },
    { header: "Gmail message id", key: "id", width: 20 },
  ];
  for (const e of result.exceptions) {
    ex.addRow({
      date: e.paid_on ?? e.row.date,
      from: e.row.from,
      amount: e.amount_cents == null ? e.row.amount : e.amount_cents / 100,
      about: e.row.about,
      reason: e.reason,
      candidates: e.candidates,
      id: e.row.messageId,
    });
  }
  const ap = xb.addWorksheet(values.apply ? "Applied" : "Would apply");
  ap.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "From", key: "from", width: 24 },
    { header: "Amount", key: "amount", width: 11, style: { numFmt: "$#,##0.00" } },
    { header: "Player", key: "player", width: 26 },
    { header: "Player's share", key: "share", width: 14, style: { numFmt: "$#,##0.00" } },
    { header: "Matched by", key: "how", width: 26 },
    { header: "Note", key: "note", width: 60 },
  ];
  for (const a of result.applied) {
    for (const s of a.splits) {
      ap.addRow({
        date: a.paid_on,
        from: a.row.from,
        amount: a.amount_cents / 100,
        player: nameOf.get(s.player_id),
        share: s.amount_cents / 100,
        how: a.how,
        note: a.note,
      });
    }
  }
  for (const ws of [ex, ap]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columnCount } };
  }
  await xb.xlsx.writeFile(out);
  console.log(`\nWrote ${out}`);

  if (!values.apply) {
    console.log("Preview: nothing written to the database. Run again with --apply to record the matched payments.");
    return;
  }

  let written = 0;
  for (const a of result.applied) {
    const group_id = crypto.randomUUID();
    const { error } = await supabase.from("olb_payments").insert(
      a.splits.map((s) => ({
        board_id: board.id,
        group_id,
        player_id: s.player_id,
        amount_cents: s.amount_cents,
        paid_on: a.paid_on,
        method: "venmo",
        reference: a.reference,
        note: a.note,
      }))
    );
    if (error) console.error(`Row ${a.row.row} (${a.row.from} ${a.row.amount}): ${error.message}`);
    else written++;
  }
  console.log(`Recorded ${written} of ${result.applied.length} Venmo payments.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
