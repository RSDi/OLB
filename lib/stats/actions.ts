"use server";
// Stats: upload a photo of the scorebook, read it, check and save the game.
// Coaches, the board and Teams & volunteers (requireStatsEditor); RLS checks
// the same people again (can_edit_stats(), 0172). Storage is signed with the
// service role after that check.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { loadRoster, requireStatsEditor } from "./data";
import { readScorebook, type BookRead } from "./read";
import { PERIODS, lineTotals, matchPlayer, normalizeMarks, parseBookDate, type BookScores } from "./marks.ts";
import { SCOREBOOK_BUCKET } from "./types.ts";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function todayChicago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function smallInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function refresh(gameId?: string) {
  revalidatePath("/portal/stats");
  if (gameId) revalidatePath(`/portal/stats/games/${gameId}`);
}

// Step 1: a draft game, a row for the photo, and a signed upload so the
// browser sends the JPEG straight to Storage.
export async function startBook(input: { teamId: string }): Promise<Result<{ gameId: string; bookId: string; path: string; token: string }>> {
  const gate = await requireStatsEditor();
  if ("error" in gate) return gate;
  if (!UUID.test(input.teamId ?? "")) return { error: "Pick a team first." };
  const db = await createClient();
  const { data: team } = await createAdminClient().from("olb_teams").select("id").eq("id", input.teamId).maybeSingle();
  if (!team) return { error: "That team isn't in the Directory." };

  const { data: game, error } = await db
    .from("stats_games")
    .insert({ team_id: input.teamId, game_date: todayChicago(), created_by: gate.userId })
    .select("id")
    .single();
  if (error || !game) return { error: error?.message ?? "Couldn't start the game." };
  const gameId = (game as { id: string }).id;
  const bookId = randomUUID();
  const path = `${gameId}/${bookId}.jpg`;
  const { error: bookErr } = await db
    .from("stats_books")
    .insert({ id: bookId, game_id: gameId, photo_path: path, created_by: gate.userId });
  if (bookErr) return { error: bookErr.message };
  const { data: signed, error: signErr } = await createAdminClient().storage.from(SCOREBOOK_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) return { error: signErr?.message ?? "Couldn't get an upload link." };
  return { gameId, bookId, path, token: signed.token };
}

// Step 2: Claude reads the photo; the game and its player lines are filled in
// from what it read, players matched to the team's roster by number.
export async function readBook(bookId: string): Promise<Result<{ gameId: string }>> {
  const gate = await requireStatsEditor();
  if ("error" in gate) return gate;
  if (!UUID.test(bookId ?? "")) return { error: "Unknown book." };
  const db = await createClient();
  const { data } = await db.from("stats_books").select("id, game_id, photo_path, status").eq("id", bookId).maybeSingle();
  const book = data as { id: string; game_id: string; photo_path: string; status: string } | null;
  if (!book) return { error: "That book is gone." };
  await db.from("stats_books").update({ status: "reading", error: null, updated_at: new Date().toISOString() }).eq("id", bookId);

  let read: BookRead;
  try {
    const { data: blob, error } = await createAdminClient().storage.from(SCOREBOOK_BUCKET).download(book.photo_path);
    if (error || !blob) throw new Error("The photo didn't upload.");
    read = await readScorebook(new Uint8Array(await blob.arrayBuffer()));
  } catch (err) {
    const message = `Couldn't read the book: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    await db.from("stats_books").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", bookId);
    refresh(book.game_id);
    return { error: message };
  }

  const { data: g } = await db.from("stats_games").select("team_id, game_date, status").eq("id", book.game_id).maybeSingle();
  const game = g as { team_id: string | null; game_date: string; status: string } | null;
  if (!game) return { error: "That game is gone." };
  const roster = await loadRoster(game.team_id);
  const date = parseBookDate(read.date, Number(game.game_date.slice(0, 4))) ?? game.game_date;

  let gameNo = 1;
  if (game.team_id) {
    const { count } = await db
      .from("stats_games")
      .select("id", { count: "exact", head: true })
      .eq("team_id", game.team_id)
      .eq("game_date", date)
      .neq("id", book.game_id);
    gameNo = Math.min(9, (count ?? 0) + 1);
  }

  const used = new Set<string>();
  const lines = read.players.slice(0, 20).map((p, i) => {
    const marks = {
      q1: normalizeMarks(p.q1),
      q2: normalizeMarks(p.q2),
      q3: normalizeMarks(p.q3),
      q4: normalizeMarks(p.q4),
      ot: normalizeMarks(p.ot),
    };
    let playerId = matchPlayer(p.number, p.name, roster);
    if (playerId && used.has(playerId)) playerId = null;
    if (playerId) used.add(playerId);
    const fouls = smallInt(p.fouls, 0, 9) ?? 0;
    const rebounds = smallInt(p.rebounds, 0, 99) ?? 0;
    return {
      game_id: book.game_id,
      player_id: playerId,
      jersey: clean(p.number, 4),
      book_name: clean(p.name, 60),
      ...marks,
      rebounds,
      fouls,
      played: PERIODS.some((k) => marks[k] !== "") || fouls > 0 || rebounds > 0,
      tp_written: smallInt(p.total, 0, 200),
      ft_written: clean(p.ft, 12),
      ...lineTotals(marks),
      sort_order: i,
    };
  });

  const scores: BookScores = {
    q1: smallInt(read.scores.q1, 0, 300),
    half: smallInt(read.scores.half, 0, 300),
    q3: smallInt(read.scores.q3, 0, 300),
    final: smallInt(read.scores.final, 0, 300),
    ft: clean(read.team_ft, 12) || null,
  };
  const ourScore = scores.final ?? lines.filter((l) => l.played).reduce((s, l) => s + l.points, 0);

  await db.from("stats_lines").delete().eq("game_id", book.game_id);
  if (lines.length) {
    const { error } = await db.from("stats_lines").insert(lines);
    if (error) return { error: error.message };
  }
  const { error: gameErr } = await db
    .from("stats_games")
    .update({
      game_date: date,
      game_no: gameNo,
      quarter_scores: scores,
      our_score: ourScore,
      overtime: lines.some((l) => l.ot !== ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", book.game_id);
  if (gameErr) return { error: gameErr.message };
  await db
    .from("stats_books")
    .update({ status: "read", read, error: null, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  refresh(book.game_id);
  return { gameId: book.game_id };
}

export interface GameEdit {
  game_date: string;
  game_no: number;
  opponent: string;
  their_score: string;
  overtime: boolean;
  lines: {
    id: string;
    player_id: string | null;
    jersey: string;
    book_name: string;
    q1: string;
    q2: string;
    q3: string;
    q4: string;
    ot: string;
    rebounds: number;
    fouls: number;
    played: boolean;
    tp_written: number | null;
    ft_written: string;
  }[];
}

// Saves the coach's checks. finish: the game is done and counts in the
// season numbers; otherwise it stays a draft.
export async function saveGame(gameId: string, edit: GameEdit, finish: boolean): Promise<Result> {
  const gate = await requireStatsEditor();
  if ("error" in gate) return gate;
  if (!UUID.test(gameId ?? "")) return { error: "Unknown game." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(edit.game_date ?? "") ? edit.game_date : null;
  if (!date) return { error: "Pick the game's date." };
  const opponent = clean(edit.opponent, 80);
  if (finish && !opponent) return { error: "Add who you played before saving." };
  const db = await createClient();
  const { data: g } = await db.from("stats_games").select("team_id, quarter_scores").eq("id", gameId).maybeSingle();
  const game = g as { team_id: string | null; quarter_scores: BookScores } | null;
  if (!game) return { error: "That game is gone." };
  const roster = new Set((await loadRoster(game.team_id)).map((p) => p.id));

  const seen = new Set<string>();
  const lines = (edit.lines ?? []).slice(0, 25).map((l, i) => {
    const marks = {
      q1: normalizeMarks(l.q1),
      q2: normalizeMarks(l.q2),
      q3: normalizeMarks(l.q3),
      q4: normalizeMarks(l.q4),
      ot: normalizeMarks(l.ot),
    };
    const playerId = l.player_id && roster.has(l.player_id) && !seen.has(l.player_id) ? l.player_id : null;
    if (playerId) seen.add(playerId);
    return {
      id: UUID.test(l.id ?? "") ? l.id : randomUUID(),
      game_id: gameId,
      player_id: playerId,
      jersey: clean(l.jersey, 4),
      book_name: clean(l.book_name, 60),
      ...marks,
      rebounds: smallInt(l.rebounds, 0, 99) ?? 0,
      fouls: smallInt(l.fouls, 0, 9) ?? 0,
      played: !!l.played,
      tp_written: smallInt(l.tp_written, 0, 200),
      ft_written: clean(l.ft_written, 12),
      ...lineTotals(marks),
      sort_order: i,
    };
  });
  if (finish && lines.some((l) => l.played && !l.player_id)) {
    return { error: "Pick who each player is (or mark them as didn't play) before saving." };
  }

  const ourScore = lines.filter((l) => l.played).reduce((s, l) => s + l.points, 0);
  const { error: delErr } = await db.from("stats_lines").delete().eq("game_id", gameId);
  if (delErr) return { error: delErr.message };
  if (lines.length) {
    const { error } = await db.from("stats_lines").insert(lines);
    if (error) return { error: error.message };
  }
  const now = new Date().toISOString();
  const { error } = await db
    .from("stats_games")
    .update({
      game_date: date,
      game_no: smallInt(edit.game_no, 1, 9) ?? 1,
      opponent,
      our_score: ourScore,
      their_score: smallInt(edit.their_score, 0, 300),
      overtime: !!edit.overtime || lines.some((l) => l.ot !== ""),
      updated_at: now,
      ...(finish ? { status: "saved", saved_by: gate.userId, saved_at: now } : {}),
    })
    .eq("id", gameId);
  if (error) return { error: error.message };
  refresh(gameId);
  return {};
}

export async function reopenGame(gameId: string): Promise<Result> {
  const gate = await requireStatsEditor();
  if ("error" in gate) return gate;
  if (!UUID.test(gameId ?? "")) return { error: "Unknown game." };
  const db = await createClient();
  const { error } = await db.from("stats_games").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", gameId);
  if (error) return { error: error.message };
  refresh(gameId);
  return {};
}

export async function deleteGame(gameId: string): Promise<Result> {
  const gate = await requireStatsEditor();
  if ("error" in gate) return gate;
  if (!UUID.test(gameId ?? "")) return { error: "Unknown game." };
  const db = await createClient();
  const { data: books } = await db.from("stats_books").select("photo_path").eq("game_id", gameId);
  const paths = ((books as { photo_path: string }[] | null) ?? []).map((b) => b.photo_path);
  const { error } = await db.from("stats_games").delete().eq("id", gameId);
  if (error) return { error: error.message };
  if (paths.length) await createAdminClient().storage.from(SCOREBOOK_BUCKET).remove(paths);
  refresh();
  return {};
}
