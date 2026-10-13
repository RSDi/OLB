"use server";

// Importing the Treasurer's season spreadsheet into club finances (0131).
// Two steps, both reading the uploaded file: previewFinanceImport says what
// would be added and asks about anything it can't match (a team name, whose
// fees a Nelson's shift goes toward); runFinanceImport adds it with those
// answers. Nothing from the preview is trusted on the way back: the file is
// read and matched again. The Payments permission.

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { centralToday } from "./data";
import { formatAmount, groupFamilies, parseAmount, totalsFor } from "./logic";
import { ensureDefaults, familyBalances, latestBoard } from "./club-data";
import { DEFAULT_FUNDS, GENERAL_FUND } from "./club-types";
import { NELSONS_LABEL, NELSONS_REF, applySpill, familySpill, type SpillPiece } from "./club-logic";
import { IMPORT_NOTE, compareBalances, duplicateUniformCharges, parseFinanceWorkbook, personKey, teamKey, type ImportChoices, type ImportPreview, type SheetPlan, type SheetPlayer, type SiteMoney, type UniformCharge, uniformPiecesOf, type UniformChoices } from "./import-sheet";

// Next.js stops server-action uploads at 1 MB anyway; the spreadsheet is ~40 KB.
const MAX_BYTES = 1024 * 1024;

type Admin = ReturnType<typeof createAdminClient>;

async function readUpload(form: FormData): Promise<{ error: string } | { name: string; sheets: { name: string; rows: never[][] }[] }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the spreadsheet (.xlsx) first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 1 MB, which is bigger than this spreadsheet should be." };
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const sheets = wb.SheetNames.map((n) => ({
      name: n,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) as never[][],
    }));
    return { name: file.name, sheets };
  } catch {
    return { error: "That doesn't open as an Excel spreadsheet. Save it as .xlsx and try again." };
  }
}

interface Context {
  db: Admin;
  boardId: string;
  season: string;
  userId: string;
  plan: SheetPlan;
  file: string;
  teams: { id: string; name: string }[];
  players: { id: string; full_name: string }[];
}

async function load(form: FormData): Promise<Context | { error: string }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const upload = await readUpload(form);
  if ("error" in upload) return upload;
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const start = Number(board.season.slice(0, 4)) || new Date().getFullYear();
  const plan = parseFinanceWorkbook(upload.sheets, start);
  if (!plan.lines.length && !plan.income.length && !plan.programs.length && !plan.shifts.length) {
    return { error: "Nothing to import: this file has no Payables, Receivables, workouts, clinics or Nelson's sheets." };
  }
  const [{ data: teams }, { data: players }] = await Promise.all([
    db.from("olb_teams").select("id, name").eq("board_id", board.id).order("sort_order"),
    db.from("olb_players").select("id, full_name").eq("board_id", board.id).order("full_name"),
  ]);
  return {
    db,
    boardId: board.id,
    season: board.season,
    userId: gate.userId,
    plan,
    file: upload.name,
    teams: (teams as { id: string; name: string }[] | null) ?? [],
    players: (players as { id: string; full_name: string }[] | null) ?? [],
  };
}

function matchTeam(ctx: Context, name: string): string | null {
  const key = teamKey(name);
  return ctx.teams.find((t) => teamKey(t.name) === key)?.id ?? null;
}

// A roster player by full name; or, failing that, the only player with that
// last name (a parent working for their one kid).
function matchPlayer(ctx: Context, name: string, byLastName: boolean): string | null {
  const key = personKey(name);
  const exact = ctx.players.find((p) => personKey(p.full_name) === key);
  if (exact || !byLastName) return exact?.id ?? null;
  const last = key.split(" ").slice(1).join(" ");
  if (!last) return null;
  const same = ctx.players.filter((p) => personKey(p.full_name).split(" ").slice(1).join(" ") === last);
  return same.length === 1 ? same[0].id : null;
}

async function alreadyImported(ctx: Context): Promise<boolean> {
  const { count } = await ctx.db.from("olb_budget_lines").select("id", { count: "exact", head: true }).eq("board_id", ctx.boardId).eq("note", IMPORT_NOTE).is("voided_at", null);
  return (count ?? 0) > 0;
}

export async function previewFinanceImport(form: FormData): Promise<ImportPreview | { error: string }> {
  const ctx = await load(form);
  if ("error" in ctx) return ctx;
  const { plan } = ctx;
  const groups = new Map<string, number>();
  for (const l of plan.lines) groups.set(l.group, (groups.get(l.group) ?? 0) + 1);
  const sheetTeams = [...new Set(plan.lines.map((l) => l.team).filter((t): t is string => !!t))];
  const workers = new Map<string, { shifts: number; cents: number }>();
  for (const s of plan.shifts.filter((x) => x.destination === "family")) {
    const w = workers.get(s.worker_name) ?? { shifts: 0, cents: 0 };
    workers.set(s.worker_name, { shifts: w.shifts + 1, cents: w.cents + s.amount_cents });
  }

  // Regular Season against Payments.
  const checks: string[] = [];
  if (plan.players.length) {
    const ids = ctx.players.map((p) => p.id);
    const [{ data: pays }, { data: comps }] = await Promise.all([
      ids.length ? ctx.db.from("olb_payments").select("player_id, amount_cents").eq("board_id", ctx.boardId).is("voided_at", null) : Promise.resolve({ data: [] }),
      ctx.db.from("olb_charges").select("player_id").eq("board_id", ctx.boardId).eq("kind", "credit").in("category", ["coach_comp", "covered"]).is("voided_at", null),
    ]);
    const paid = new Map<string, number>();
    for (const p of (pays as { player_id: string; amount_cents: number }[] | null) ?? []) paid.set(p.player_id, (paid.get(p.player_id) ?? 0) + p.amount_cents);
    const comped = new Set(((comps as { player_id: string }[] | null) ?? []).map((c) => c.player_id));
    const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
    for (const sp of plan.players) {
      const name = `${sp.first} ${sp.last}`;
      const id = matchPlayer(ctx, name, false);
      if (!id) {
        checks.push(`${name} is on the spreadsheet's roster but not this season's on the site.`);
        continue;
      }
      if (sp.comped && !comped.has(id)) checks.push(`${name} is "CK" on the spreadsheet; on the site nothing takes their fee off yet (Take their fee off, below).`);
      const sheetPaid = sp.paid_cents ?? 0;
      const sitePaid = paid.get(id) ?? 0;
      if (!sp.comped && sheetPaid !== sitePaid) {
        checks.push(
          `${name}: the spreadsheet says ${dollars(sheetPaid)} paid${sp.nelsons_cents ? ` (${dollars(sp.nelsons_cents)} of it from Nelson's)` : ""}; Payments has ${dollars(sitePaid)}.`
        );
      }
    }
  }

  const programs = plan.programs.map((p) => ({
    name: p.name,
    signups: p.signups.length,
    onRoster: p.signups.filter((s) => matchPlayer(ctx, `${s.first} ${s.last}`, false)).length,
  }));
  return {
    file: ctx.file,
    season: ctx.season,
    alreadyImported: await alreadyImported(ctx),
    counts: {
      lines: plan.lines.length,
      budget: plan.lines.reduce((n, l) => n + l.budget_cents, 0),
      paid: plan.lines.reduce((n, l) => n + (l.payment?.amount_cents ?? 0), 0),
      groups: [...groups].map(([name, lines]) => ({ name, lines })),
      income: plan.income.length,
      incomeIn: plan.income.reduce((n, i) => n + i.amount_cents, 0),
      programs,
      shifts: plan.shifts.length,
      toFamilies: plan.shifts.filter((s) => s.destination === "family").reduce((n, s) => n + s.amount_cents, 0),
      toFund: plan.shifts.filter((s) => s.destination === "fund").reduce((n, s) => n + s.amount_cents, 0),
    },
    teams: sheetTeams.map((name) => ({ name, match: matchTeam(ctx, name) })),
    workers: [...workers].map(([name, w]) => ({ name, ...w, match: matchPlayer(ctx, name, true) })),
    players: ctx.players.map((p) => ({ id: p.id, name: p.full_name })),
    siteTeams: ctx.teams,
    checks,
    notes: plan.notes,
    uniforms: await uniformPlan(ctx),
    payments: await paymentPlan(ctx),
    uniformDupes: await uniformDupePlan(ctx.db, ctx.boardId, ctx.players),
    coaches: await coachPlan(ctx),
    compare: await comparePlan(ctx),
  };
}

async function idFor(db: Admin, table: string, boardId: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data } = await db.from(table).select("id").eq("board_id", boardId).eq("name", name).limit(1);
  const found = (data as { id: string }[] | null)?.[0];
  if (found) return found.id;
  const { data: made, error } = await db.from(table).insert({ board_id: boardId, name, ...extra }).select("id").single();
  if (error) throw new Error(error.message);
  return (made as { id: string }).id;
}

export async function runFinanceImport(form: FormData, choices: ImportChoices): Promise<{ error?: string; notice?: string }> {
  const ctx = await load(form);
  if ("error" in ctx) return ctx;
  if (await alreadyImported(ctx)) return { error: "This season's spreadsheet is already imported. Use Undo the import first to import it again." };
  const { db, boardId, userId, plan } = ctx;
  const players = new Set(ctx.players.map((p) => p.id));
  const teams = new Set(ctx.teams.map((t) => t.id));
  const today = centralToday();
  try {
    await ensureDefaults(db, boardId);
    const groupIds = new Map<string, string>();
    for (const name of new Set(plan.lines.map((l) => l.group))) groupIds.set(name, await idFor(db, "olb_budget_groups", boardId, name, { sort_order: 100 }));
    const eventIds = new Map<string, string>();
    for (const name of new Set([...plan.lines.map((l) => l.event), ...plan.income.map((i) => i.event)].filter((x): x is string => !!x))) {
      eventIds.set(name, await idFor(db, "olb_hosted_events", boardId, name));
    }
    const programIds = new Map<string, string>();
    for (const p of plan.programs) programIds.set(p.name, await idFor(db, "olb_programs", boardId, p.name, { kind: p.kind, levels: p.levels, open: false, created_by: userId }));
    for (const name of new Set([...plan.lines.map((l) => l.program), ...plan.income.map((i) => i.program)].filter((x): x is string => !!x))) {
      if (!programIds.has(name)) programIds.set(name, await idFor(db, "olb_programs", boardId, name, { kind: "clinic", levels: [], open: false, created_by: userId }));
    }
    const fundId = await idFor(db, "olb_program_funds", boardId, GENERAL_FUND, { description: DEFAULT_FUNDS[0].description });
    const nelsonsId = await idFor(db, "olb_fundraisers", boardId, "Nelson's Produce", { rate_cents: 1000 });

    // Budget lines, then what was paid on each.
    const teamOf = (name: string | null) => {
      if (!name) return null;
      const chosen = choices.teams[name];
      if (chosen !== undefined) return chosen && teams.has(chosen) ? chosen : null;
      return matchTeam(ctx, name);
    };
    // A millisecond apart, so the lines keep the spreadsheet's order.
    const base = Date.now();
    const lineRows = plan.lines.map((l, i) => {
      const team_id = teamOf(l.team);
      return {
        created_at: new Date(base + i).toISOString(),
        board_id: boardId,
        group_id: groupIds.get(l.group)!,
        team_id,
        program_id: l.program ? programIds.get(l.program) ?? null : null,
        event_id: l.event ? eventIds.get(l.event) ?? null : null,
        vendor: l.vendor,
        // A team the site doesn't have keeps its name on the line.
        description: (l.team && !team_id ? `${l.team}: ${l.description}` : l.description).slice(0, 120),
        month: l.month,
        budget_cents: l.budget_cents,
        note: IMPORT_NOTE,
        created_by: userId,
      };
    });
    const { data: made, error: lineErr } = lineRows.length ? await db.from("olb_budget_lines").insert(lineRows).select("id") : { data: [], error: null };
    if (lineErr) throw new Error(lineErr.message);
    const ids = ((made as { id: string }[] | null) ?? []).map((r) => r.id);
    const payRows = plan.lines
      .map((l, i) =>
        l.payment
          ? {
              board_id: boardId,
              line_id: ids[i],
              amount_cents: l.payment.amount_cents,
              paid_on: l.payment.paid_on ?? today,
              method: l.payment.method,
              reference: l.payment.reference,
              note: l.payment.paid_on ? IMPORT_NOTE : `${IMPORT_NOTE} (no date on it)`,
              recorded_by: userId,
            }
          : null
      )
      .filter((r): r is NonNullable<typeof r> => !!r && !!r.line_id);
    if (payRows.length) {
      const { error } = await db.from("olb_expense_payments").insert(payRows);
      if (error) throw new Error(error.message);
    }

    // Income.
    if (plan.income.length) {
      const { error } = await db.from("olb_income").insert(
        plan.income.map((i) => ({
          board_id: boardId,
          category: i.category,
          program_id: i.program ? programIds.get(i.program) ?? null : null,
          event_id: i.event ? eventIds.get(i.event) ?? null : null,
          from_name: i.from_name,
          description: i.description.slice(0, 120),
          amount_cents: i.amount_cents,
          received_on: i.amount_cents > 0 ? today : null,
          budget_cents: i.budget_cents,
          method: i.amount_cents > 0 ? "other" : null,
          note: [i.note, IMPORT_NOTE].filter(Boolean).join(" · "),
          recorded_by: userId,
        }))
      );
      if (error) throw new Error(error.message);
    }

    // Sign-ups, paid as the spreadsheet says: that money already came in.
    // NP ones were paid from Nelson's Produce earnings, so a roster player's
    // fee goes on the family's account, where their Nelson's credit pays it.
    for (const p of plan.programs) {
      if (!p.signups.length) continue;
      const rows = [];
      for (const s of p.signups) {
        const playerId = matchPlayer(ctx, `${s.first} ${s.last}`, false);
        let chargeId: string | null = null;
        if (s.waived && playerId && s.price_cents > 0) {
          const { data: charge, error } = await db
            .from("olb_charges")
            .insert({
              board_id: boardId,
              player_id: playerId,
              kind: "charge",
              category: "program",
              description: `${p.name} (${NELSONS_LABEL})`.slice(0, 120),
              amount_cents: s.price_cents,
              entry_date: today,
              note: IMPORT_NOTE,
              created_by: userId,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          chargeId = (charge as { id: string }).id;
        }
        rows.push({
          board_id: boardId,
          program_id: programIds.get(p.name)!,
          player_id: playerId,
          child_first: s.first.slice(0, 60) || "?",
          child_last: s.last.slice(0, 60) || "?",
          level: s.level,
          price_cents: s.price_cents,
          charge_id: chargeId,
          paid_cents: s.waived ? 0 : s.price_cents,
          paid_on: chargeId ? null : today,
          paid_method: chargeId ? null : s.waived ? "waived" : "other",
          paid_ref: s.waived ? NELSONS_REF : "Spreadsheet",
          note: IMPORT_NOTE,
        });
      }
      const { error } = await db.from("olb_program_signups").insert(rows);
      if (error) throw new Error(error.message);
    }

    // Nelson's shifts.
    const fb = choices.spill && choices.postCredits ? await familyBalances(db, boardId) : null;
    let credits = 0;
    let skipped = 0;
    for (const s of plan.shifts) {
      let destination = s.destination;
      let player: string | null = null;
      if (destination === "family") {
        const chosen = choices.workers[s.worker_name] ?? matchPlayer(ctx, s.worker_name, true) ?? "skip";
        if (chosen === "skip") {
          skipped++;
          continue;
        }
        if (chosen === "fund") destination = "fund";
        else if (players.has(chosen)) player = chosen;
        else {
          skipped++;
          continue;
        }
      }
      // Toward a player whose fees are paid, the rest goes on to their
      // brothers and sisters, while that's asked for.
      const pieces =
        destination === "family" && player && choices.postCredits && fb
          ? familySpill(s.amount_cents, s.hours, player, fb)
          : [{ player_id: player, amount_cents: s.amount_cents, hours: s.hours }];
      if (fb && destination === "family" && player && choices.postCredits) applySpill(fb, pieces as SpillPiece[]);
      for (const piece of pieces) {
        let charge_id: string | null = null;
        if (destination === "family" && piece.player_id && choices.postCredits) {
          const { data: c, error } = await db
            .from("olb_charges")
            .insert({
              board_id: boardId,
              player_id: piece.player_id,
              kind: "credit",
              category: "fundraising",
              description: ["Nelson's Produce", s.event_label].filter(Boolean).join(" – ").slice(0, 120),
              amount_cents: piece.amount_cents,
              entry_date: today,
              note: `${s.worker_name}, ${piece.hours} hours`,
              created_by: userId,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          charge_id = (c as { id: string }).id;
          credits++;
        }
        const { error } = await db.from("olb_fundraiser_shifts").insert({
          board_id: boardId,
          fundraiser_id: nelsonsId,
          event_label: s.event_label,
          worker_name: s.worker_name,
          hours: piece.hours,
          amount_cents: piece.amount_cents,
          destination,
          player_id: destination === "family" ? piece.player_id : null,
          fund_id: destination === "fund" ? fundId : null,
          charge_id,
          note: IMPORT_NOTE,
          recorded_by: userId,
        });
        if (error) throw new Error(error.message);
      }
    }

    revalidatePath("/portal/payments");
    return {
      notice:
        `Imported ${lineRows.length} costs, ${plan.income.length} income entries, ${plan.programs.reduce((n, p) => n + p.signups.length, 0)} sign-ups and ${plan.shifts.length - skipped} Nelson's shifts` +
        (credits ? ` (${credits} credits on families' accounts)` : "") +
        (skipped ? `. ${skipped} shifts were skipped.` : "."),
    };
  } catch (e) {
    return { error: `The import stopped part way: ${e instanceof Error ? e.message : "something went wrong"}. Use Undo the import, then try again.` };
  }
}

// Takes back everything the import added: its budget lines and payments,
// income, sign-ups and shifts are voided (or cancelled), and the Nelson's
// credits it put on families' accounts with them. What you added by hand
// stays.
export async function undoFinanceImport(): Promise<{ error?: string; notice?: string }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const now = new Date().toISOString();
  const voided = { voided_at: now, voided_by: gate.userId };
  const { data: shifts } = await db.from("olb_fundraiser_shifts").select("charge_id").eq("board_id", board.id).eq("note", IMPORT_NOTE).is("voided_at", null);
  const chargeIds = ((shifts as { charge_id: string | null }[] | null) ?? []).map((s) => s.charge_id).filter((x): x is string => !!x);
  const results = await Promise.all([
    db.from("olb_budget_lines").update(voided).eq("board_id", board.id).eq("note", IMPORT_NOTE).is("voided_at", null).select("id"),
    db.from("olb_expense_payments").update(voided).eq("board_id", board.id).like("note", `${IMPORT_NOTE}%`).is("voided_at", null),
    db.from("olb_income").update(voided).eq("board_id", board.id).like("note", `%${IMPORT_NOTE}`).is("voided_at", null),
    db.from("olb_program_signups").update({ cancelled_at: now }).eq("board_id", board.id).eq("note", IMPORT_NOTE).is("cancelled_at", null),
    db.from("olb_fundraiser_shifts").update(voided).eq("board_id", board.id).eq("note", IMPORT_NOTE).is("voided_at", null),
    chargeIds.length ? db.from("olb_charges").update(voided).in("id", chargeIds).is("voided_at", null) : Promise.resolve({ error: null }),
    // Payments recorded to match Regular Season.
    db.from("olb_payments").update(voided).eq("board_id", board.id).eq("note", IMPORT_NOTE).is("voided_at", null),
    // Uniform charges and coaches' kids' comps added from Regular Season.
    db.from("olb_charges").update(voided).eq("board_id", board.id).in("category", ["uniform", "coach_comp"]).eq("note", IMPORT_NOTE).is("voided_at", null),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/portal/payments");
  const lines = ((results[0] as { data: unknown[] | null }).data ?? []).length;
  return { notice: lines ? `Took back the import (${lines} costs and everything with them).` : "There was nothing imported to take back." };
}

// ─── Uniforms from Regular Season ───────────────────────────────────────────

type UniformPiece = { player_id: string; item: "Jersey" | "Shorts"; size: string };

// The jerseys and shorts Regular Season says were ordered, for players on
// this season's roster, less any already on their accounts as a uniform
// charge for that piece (from an earlier run, the uniform order, or by hand).
async function uniformPieces(ctx: Context): Promise<{ pieces: UniformPiece[]; unmatched: string[]; alreadyCharged: number }> {
  const wanted: UniformPiece[] = [];
  const unmatched: string[] = [];
  for (const p of ctx.plan.players) {
    if (!p.jersey && !p.shorts) continue;
    const id = matchPlayer(ctx, `${p.first} ${p.last}`, false);
    if (!id) {
      unmatched.push(`${p.first} ${p.last}`);
      continue;
    }
    if (p.jersey) wanted.push({ player_id: id, item: "Jersey", size: p.jersey });
    if (p.shorts) wanted.push({ player_id: id, item: "Shorts", size: p.shorts });
  }
  if (wanted.length === 0) return { pieces: [], unmatched, alreadyCharged: 0 };
  const { data } = await ctx.db
    .from("olb_charges")
    .select("player_id, description")
    .eq("board_id", ctx.boardId)
    .eq("category", "uniform")
    .is("voided_at", null);
  // A plain "Uniform" charge covers both pieces.
  const have = new Set(
    ((data as { player_id: string; description: string | null }[] | null) ?? []).flatMap((c) => uniformPiecesOf(c.description).map((piece) => `${c.player_id}|${piece}`))
  );
  const pieces = wanted.filter((w) => !have.has(`${w.player_id}|${w.item}`));
  return { pieces, unmatched, alreadyCharged: wanted.length - pieces.length };
}

async function uniformPlan(ctx: Context): Promise<ImportPreview["uniforms"]> {
  const { pieces, unmatched, alreadyCharged } = await uniformPieces(ctx);
  return {
    jerseys: pieces.filter((x) => x.item === "Jersey").length,
    shorts: pieces.filter((x) => x.item === "Shorts").length,
    players: new Set(pieces.map((x) => x.player_id)).size,
    unmatched,
    alreadyCharged,
  };
}

// A Uniform charge on each player's account for every jersey and pair of
// shorts Regular Season says was ordered: "Jersey (AM)". Safe to run again;
// pieces already charged are skipped. Runs whether or not the rest of the
// spreadsheet was imported.
export async function runUniformCharges(form: FormData, choices: UniformChoices): Promise<{ error?: string; notice?: string }> {
  const ctx = await load(form);
  if ("error" in ctx) return ctx;
  const price = { Jersey: parseAmount(choices.jersey), Shorts: parseAmount(choices.shorts) };
  if (!price.Jersey || !price.Shorts) return { error: "Enter what a jersey and shorts cost, like 55." };
  const { pieces } = await uniformPieces(ctx);
  if (pieces.length === 0) return { notice: "Every jersey and pair of shorts on Regular Season is already on families' accounts." };
  const today = centralToday();
  const { error } = await ctx.db.from("olb_charges").insert(
    pieces.map((x) => ({
      board_id: ctx.boardId,
      player_id: x.player_id,
      kind: "charge",
      category: "uniform",
      description: `${x.item} (${x.size})`,
      amount_cents: price[x.item]!,
      entry_date: today,
      note: IMPORT_NOTE,
      created_by: ctx.userId,
    }))
  );
  if (error) return { error: error.message };
  revalidatePath("/portal/payments");
  const players = new Set(pieces.map((x) => x.player_id)).size;
  return { notice: `Added ${pieces.length} uniform charges for ${players} players.` };
}

// ─── Payments to match Regular Season ───────────────────────────────────────

const dollarText = (c: number) => formatAmount(c);

// What each player has paid by the sheet (PAID, less the Nelson's column,
// which comes in as Fundraising credits) against what Payments has. Only
// gaps the sheet is ahead on are recorded; the rest are listed.
async function paymentGaps(ctx: Context): Promise<{ gaps: { player_id: string; cents: number }[]; over: string[] }> {
  const { data } = await ctx.db.from("olb_payments").select("player_id, amount_cents").eq("board_id", ctx.boardId).is("voided_at", null);
  const site = new Map<string, number>();
  for (const p of (data as { player_id: string; amount_cents: number }[] | null) ?? []) site.set(p.player_id, (site.get(p.player_id) ?? 0) + p.amount_cents);
  const gaps: { player_id: string; cents: number }[] = [];
  const over: string[] = [];
  for (const sp of ctx.plan.players) {
    if (sp.comped || !sp.paid_cents) continue;
    const id = matchPlayer(ctx, `${sp.first} ${sp.last}`, false);
    if (!id) continue;
    const cash = sp.paid_cents - (sp.nelsons_cents ?? 0);
    const have = site.get(id) ?? 0;
    if (cash > have) gaps.push({ player_id: id, cents: cash - have });
    else if (cash < have) over.push(`${sp.first} ${sp.last} (Payments ${dollarText(have)}, sheet ${dollarText(cash)})`);
  }
  return { gaps, over };
}

async function paymentPlan(ctx: Context): Promise<ImportPreview["payments"]> {
  const { gaps, over } = await paymentGaps(ctx);
  return { players: gaps.length, cents: gaps.reduce((n, g) => n + g.cents, 0), over };
}

// Records what Payments is missing against Regular Season: one payment per
// player for the difference, "From the spreadsheet". Safe to run again.
export async function runPaymentCatchUp(form: FormData): Promise<{ error?: string; notice?: string }> {
  const ctx = await load(form);
  if ("error" in ctx) return ctx;
  const { gaps } = await paymentGaps(ctx);
  if (gaps.length === 0) return { notice: "Payments already has everything the sheet says was paid." };
  const today = centralToday();
  const { error } = await ctx.db.from("olb_payments").insert(
    gaps.map((g) => ({
      board_id: ctx.boardId,
      group_id: crypto.randomUUID(),
      player_id: g.player_id,
      amount_cents: g.cents,
      paid_on: today,
      method: "other",
      reference: "From the spreadsheet",
      note: IMPORT_NOTE,
      recorded_by: ctx.userId,
    }))
  );
  if (error) return { error: error.message };
  revalidatePath("/portal/payments");
  return { notice: `Recorded ${dollarText(gaps.reduce((n, g) => n + g.cents, 0))} in payments for ${gaps.length} players, to match the sheet.` };
}

// ─── Coaches' kids from Regular Season ──────────────────────────────────────

// "CK" players on the sheet whose registration is charged on the site with
// no coach's-kid credit taking it off.
async function coachGaps(ctx: Context): Promise<{ player_id: string; name: string; cents: number }[]> {
  const ck = ctx.plan.players
    .filter((p) => p.comped)
    .map((p) => ({ name: `${p.first} ${p.last}`, id: matchPlayer(ctx, `${p.first} ${p.last}`, false) }))
    .filter((x): x is { name: string; id: string } => !!x.id);
  if (ck.length === 0) return [];
  const { data } = await ctx.db
    .from("olb_charges")
    .select("player_id, kind, category, amount_cents")
    .eq("board_id", ctx.boardId)
    .in("player_id", ck.map((x) => x.id))
    .in("category", ["registration", "coach_comp"])
    .is("voided_at", null);
  const rows = (data as { player_id: string; kind: string; category: string; amount_cents: number }[] | null) ?? [];
  return ck
    .map((x) => ({
      player_id: x.id,
      name: x.name,
      cents: rows.filter((r) => r.player_id === x.id && r.category === "registration" && r.kind !== "credit").reduce((n, r) => n + r.amount_cents, 0),
      comped: rows.some((r) => r.player_id === x.id && r.category === "coach_comp" && r.kind === "credit"),
    }))
    .filter((x) => x.cents > 0 && !x.comped)
    .map(({ player_id, name, cents }) => ({ player_id, name, cents }));
}

async function coachPlan(ctx: Context): Promise<ImportPreview["coaches"]> {
  const gaps = await coachGaps(ctx);
  return { players: gaps.map((g) => g.name), cents: gaps.reduce((n, g) => n + g.cents, 0) };
}

// A Coach's kid credit for the whole registration fee of each "CK" player
// still charged it, as the sheet comps them. Safe to run again.
export async function runCoachComps(form: FormData): Promise<{ error?: string; notice?: string }> {
  const ctx = await load(form);
  if ("error" in ctx) return ctx;
  const gaps = await coachGaps(ctx);
  if (gaps.length === 0) return { notice: "Every coach's kid on the sheet already has their fee taken off." };
  const today = centralToday();
  const { error } = await ctx.db.from("olb_charges").insert(
    gaps.map((g) => ({
      board_id: ctx.boardId,
      player_id: g.player_id,
      kind: "credit",
      category: "coach_comp",
      description: "Coach's kid",
      amount_cents: g.cents,
      entry_date: today,
      note: IMPORT_NOTE,
      created_by: ctx.userId,
    }))
  );
  if (error) return { error: error.message };
  revalidatePath("/portal/payments");
  return { notice: `Took ${dollarText(gaps.reduce((n, g) => n + g.cents, 0))} off for ${gaps.length} coaches' kids.` };
}

// ─── Balances against the sheet ─────────────────────────────────────────────

// Every family on this season's roster: what the site says they owe against
// the sheet's Amount Due, for the ones that differ.
async function comparePlan(ctx: Context): Promise<ImportPreview["compare"]> {
  const ids = ctx.players.map((p) => p.id);
  if (ids.length === 0 || ctx.plan.players.length === 0) return { families: [], siteOwed: 0, sheetDue: 0 };
  const [{ data: players }, { data: charges }, { data: payments }] = await Promise.all([
    ctx.db.from("olb_players").select("id, full_name, parents:olb_player_parents(member_id)").eq("board_id", ctx.boardId),
    ctx.db.from("olb_charges").select("player_id, kind, amount_cents, voided_at").eq("board_id", ctx.boardId).is("voided_at", null),
    ctx.db.from("olb_payments").select("player_id, amount_cents, voided_at").eq("board_id", ctx.boardId).is("voided_at", null),
  ]);
  const ps = ((players as unknown as { id: string; full_name: string; parents: { member_id: string }[] }[] | null) ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    parent_ids: (p.parents ?? []).map((x) => x.member_id),
  }));
  const cs = ((charges as { player_id: string; kind: string | null; amount_cents: number; voided_at: string | null }[] | null) ?? []).map((c) => ({
    ...c,
    kind: (c.kind ?? "charge") as "charge" | "credit",
  }));
  const pays = (payments as { player_id: string; amount_cents: number; voided_at: string | null }[] | null) ?? [];
  const site = new Map<string, SiteMoney>();
  for (const p of ps) {
    const t = totalsFor([p.id], cs, pays);
    site.set(p.id, { charged: t.charged, credited: t.credited, paid: t.paid });
  }
  const sheet = new Map<string, SheetPlayer>();
  for (const sp of ctx.plan.players) {
    const id = matchPlayer(ctx, `${sp.first} ${sp.last}`, false);
    if (id) sheet.set(id, sp);
  }
  const families = groupFamilies(ps).map((fam) => fam.map((p) => ({ id: p.id, name: p.full_name })));
  return compareBalances(families, site, sheet);
}

// ─── Uniform pieces charged twice ───────────────────────────────────────────

async function uniformDupes(db: Admin, boardId: string): Promise<UniformCharge[]> {
  const { data } = await db
    .from("olb_charges")
    .select("id, player_id, description, amount_cents, note")
    .eq("board_id", boardId)
    .eq("kind", "charge")
    .eq("category", "uniform")
    .is("voided_at", null);
  return duplicateUniformCharges((data as UniformCharge[] | null) ?? []);
}

async function uniformDupePlan(db: Admin, boardId: string, players: { id: string; full_name: string }[]): Promise<ImportPreview["uniformDupes"]> {
  const dupes = await uniformDupes(db, boardId);
  const names = new Map(players.map((p) => [p.id, p.full_name]));
  return {
    players: [...new Set(dupes.map((d) => names.get(d.player_id) ?? "A player"))].sort(),
    count: dupes.length,
    cents: dupes.reduce((n, d) => n + d.amount_cents, 0),
  };
}

// Voids the import's jersey and shorts charges for players who already had
// their own uniform charge. Only the import's are touched.
export async function removeDuplicateUniforms(): Promise<{ error?: string; notice?: string }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const dupes = await uniformDupes(db, board.id);
  if (dupes.length === 0) return { notice: "No uniform is charged twice." };
  const { error } = await db
    .from("olb_charges")
    .update({ voided_at: new Date().toISOString(), voided_by: gate.userId })
    .in("id", dupes.map((d) => d.id))
    .is("voided_at", null);
  if (error) return { error: error.message };
  revalidatePath("/portal/payments");
  const players = new Set(dupes.map((d) => d.player_id)).size;
  return { notice: `Removed ${dupes.length} duplicate uniform charges (${dollarText(dupes.reduce((n, d) => n + d.amount_cents, 0))}) for ${players} players.` };
}
