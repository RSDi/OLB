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
import { ensureDefaults, latestBoard } from "./club-data";
import { IMPORT_NOTE, parseFinanceWorkbook, personKey, teamKey, type ImportChoices, type ImportPreview, type SheetPlan } from "./import-sheet";

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
      if (sp.comped && !comped.has(id)) checks.push(`${name} is "CK" on the spreadsheet; on the site nothing takes their fee off yet (Settings → Fees → Comp coaches' kids).`);
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
    const fundId = await idFor(db, "olb_program_funds", boardId, "Buckets for Bucks", { description: "The general program fund" });
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

    // Sign-ups, paid as the spreadsheet says. They're never charged to a
    // family's account: that money already came in.
    for (const p of plan.programs) {
      if (!p.signups.length) continue;
      const { error } = await db.from("olb_program_signups").insert(
        p.signups.map((s) => ({
          board_id: boardId,
          program_id: programIds.get(p.name)!,
          player_id: matchPlayer(ctx, `${s.first} ${s.last}`, false),
          child_first: s.first.slice(0, 60) || "?",
          child_last: s.last.slice(0, 60) || "?",
          level: s.level,
          price_cents: s.price_cents,
          paid_cents: s.waived ? 0 : s.price_cents,
          paid_on: today,
          paid_method: s.waived ? "waived" : "other",
          paid_ref: s.waived ? "NP: Nelson's Produce" : "Spreadsheet",
          note: IMPORT_NOTE,
        }))
      );
      if (error) throw new Error(error.message);
    }

    // Nelson's shifts.
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
      let charge_id: string | null = null;
      if (destination === "family" && player && choices.postCredits) {
        const { data: c, error } = await db
          .from("olb_charges")
          .insert({
            board_id: boardId,
            player_id: player,
            kind: "credit",
            category: "fundraising",
            description: ["Nelson's Produce", s.event_label].filter(Boolean).join(" – ").slice(0, 120),
            amount_cents: s.amount_cents,
            entry_date: today,
            note: `${s.worker_name}, ${s.hours} hours`,
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
        hours: s.hours,
        amount_cents: s.amount_cents,
        destination,
        player_id: destination === "family" ? player : null,
        fund_id: destination === "fund" ? fundId : null,
        charge_id,
        note: IMPORT_NOTE,
        recorded_by: userId,
      });
      if (error) throw new Error(error.message);
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
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/portal/payments");
  const lines = ((results[0] as { data: unknown[] | null }).data ?? []).length;
  return { notice: lines ? `Took back the import (${lines} costs and everything with them).` : "There was nothing imported to take back." };
}
