"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteGame, reopenGame, saveGame, type GameEdit } from "../../../../../lib/stats/actions";
import type { GameView } from "../../../../../lib/stats/data";
import { PERIODS, PERIOD_LABEL, badMarks, checkGame, lineTotals, quarterChecks, type LineInput, type Period } from "../../../../../lib/stats/marks";
import { fmtGameDate } from "../../../../../lib/stats/types";
import s from "../../stats.module.css";

type EditLine = GameEdit["lines"][number];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function GameCheck({ view }: { view: GameView }) {
  const { game, books, roster } = view;
  const router = useRouter();
  const [date, setDate] = useState(game.game_date);
  const [gameNo, setGameNo] = useState(game.game_no);
  const [opponent, setOpponent] = useState(game.opponent);
  const [theirScore, setTheirScore] = useState(game.their_score == null ? "" : String(game.their_score));
  const [lines, setLines] = useState<EditLine[]>(() =>
    view.lines.map((l) => ({
      id: l.id,
      player_id: l.player_id,
      jersey: l.jersey,
      book_name: l.book_name,
      q1: l.q1,
      q2: l.q2,
      q3: l.q3,
      q4: l.q4,
      ot: l.ot,
      rebounds: l.rebounds,
      fouls: l.fouls,
      played: l.played,
      tp_written: l.tp_written,
      ft_written: l.ft_written,
    })),
  );
  const [busy, setBusy] = useState<"" | "draft" | "save" | "delete">("");
  const [error, setError] = useState("");

  const book = game.quarter_scores ?? {};
  const asInput: LineInput[] = lines;
  const flags = checkGame(asInput, book);
  const checks = quarterChecks(asInput.filter((l) => l.played), book);
  const flagged = new Set(flags.map((f) => f.lineId).filter(Boolean));
  const ours = lines.filter((l) => l.played).reduce((sum, l) => sum + lineTotals(l).points, 0);
  const ftAll = lines.filter((l) => l.played).reduce((t, l) => {
    const x = lineTotals(l);
    return { m: t.m + x.ftm, a: t.a + x.fta };
  }, { m: 0, a: 0 });
  const hasOt = lines.some((l) => l.ot.trim());
  const photo = books.find((b) => b.photo_url)?.photo_url ?? null;
  const unsure = books.flatMap((b) => b.unsure);
  const failed = books.find((b) => b.status === "failed");

  const update = (id: string, patch: Partial<EditLine>) => setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function save(finish: boolean) {
    setBusy(finish ? "save" : "draft");
    setError("");
    const res = await saveGame(game.id, { game_date: date, game_no: gameNo, opponent, their_score: theirScore, overtime: hasOt, lines }, finish);
    setBusy("");
    if (res.error !== undefined) {
      setError(res.error);
      return;
    }
    if (finish) router.push(`/portal/stats/games/${game.id}`);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this game and its scorebook photo? Its stats come off the season.")) return;
    setBusy("delete");
    const res = await deleteGame(game.id);
    setBusy("");
    if (res.error !== undefined) {
      setError(res.error);
      return;
    }
    router.push(`/portal/stats${game.team_id ? `?team=${game.team_id}` : ""}`);
  }

  async function backToDraft() {
    setBusy("draft");
    const res = await reopenGame(game.id);
    setBusy("");
    if (res.error !== undefined) setError(res.error);
    else router.refresh();
  }

  return (
    <>
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--rsd-display)", fontSize: 34, textTransform: "uppercase", color: "var(--gw-fg)" }}>
          Check the book
        </h1>
        <p className={s.muted}>
          {view.teamName} · {fmtGameDate(date, true)}
          {game.status === "saved" ? " · saved; changes here update it" : " · not counted until you save"}
        </p>
      </div>

      {failed && <p className={s.error}>{failed.error ?? "The book couldn't be read."} Delete this game and upload the photo again.</p>}

      <section className={`rsd-card ${s.card}`}>
        <div className={s.fields}>
          <label className={s.field}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={s.field}>
            Game that day
            <select value={gameNo} onChange={(e) => setGameNo(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {["1st", "2nd", "3rd", "4th", "5th"][n - 1]} game
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            Opponent
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Not on our page — type it" maxLength={80} />
          </label>
          <label className={s.field}>
            Their final score
            <input inputMode="numeric" value={theirScore} onChange={(e) => setTheirScore(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="If you know it" />
          </label>
        </div>
      </section>

      <section className={`rsd-card ${s.card}`}>
        <h2 className={s.h2}>Marks vs the book</h2>
        <div className={s.checks}>
          {checks.map((c) => {
            const bad = c.book !== null && c.book !== c.marks;
            return (
              <div key={c.period} className={`${s.check} ${bad ? s.checkBad : ""}`}>
                <span>{c.label}</span>
                <b>
                  {c.marks} {c.book === null ? "" : bad ? "!" : "✓"}
                </b>
                <span>{c.book === null ? "book: not written" : `book: ${c.book}`}</span>
              </div>
            );
          })}
          <div className={`${s.check} ${typeof book.final === "number" && book.final !== ours ? s.checkBad : ""}`}>
            <span>Final</span>
            <b>
              {ours} {typeof book.final === "number" ? (book.final === ours ? "✓" : "!") : ""}
            </b>
            <span>{typeof book.final === "number" ? `book: ${book.final}` : "book: not written"}</span>
          </div>
          <div className={s.check}>
            <span>Free throws</span>
            <b>
              {ftAll.m}/{ftAll.a}
            </b>
            <span>{book.ft ? `book: ${book.ft}` : "made / tries"}</span>
          </div>
        </div>
        {flags.length > 0 ? (
          <ul className={s.flags}>
            {flags.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        ) : (
          <p className={s.muted}>Everything adds up to what the book says.</p>
        )}
        {unsure.length > 0 && (
          <p className={s.muted}>
            <b>Hard to read:</b> {unsure.join(" · ")}
          </p>
        )}
      </section>

      <div className={s.row}>
        {photo && (
          <aside className={s.side} style={{ maxWidth: 360 }}>
            <a href={photo} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Photo of the scorebook page" className={s.photo} />
            </a>
            <p className={s.muted}>Tap the photo to open it full size.</p>
          </aside>
        )}
        <section className={`rsd-card ${s.card} ${s.main}`}>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.l}>#</th>
                  <th className={s.l}>Player</th>
                  {PERIODS.map((p) => (
                    <th key={p}>{PERIOD_LABEL[p]}</th>
                  ))}
                  <th>Reb</th>
                  <th>Fouls</th>
                  <th>Pts</th>
                  <th>Played</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const t = lineTotals(l);
                  const who = l.book_name || (l.jersey ? `#${l.jersey}` : "player");
                  return (
                    <tr key={l.id} className={!l.played ? s.notPlayed : flagged.has(l.id) ? s.rowFlag : undefined}>
                      <td className={s.l}>
                        <input className={s.num} style={{ width: 44 }} value={l.jersey} maxLength={4} aria-label={`${who}: jersey number`} onChange={(e) => update(l.id, { jersey: e.target.value })} />
                      </td>
                      <td className={s.l}>
                        <select
                          className={`${s.pick} ${l.played && !l.player_id ? s.warn : ""}`}
                          value={l.player_id ?? ""}
                          aria-label={`Who is ${who}`}
                          onChange={(e) => update(l.id, { player_id: e.target.value || null })}
                        >
                          <option value="">{l.book_name ? `“${l.book_name}” — who is this?` : "Who is this?"}</option>
                          {roster.map((p) => (
                            <option key={p.id} value={p.id} disabled={lines.some((x) => x.id !== l.id && x.player_id === p.id)}>
                              {p.jersey ? `#${p.jersey} ` : ""}
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {(l.tp_written != null || l.ft_written) && (
                          <div className={s.dim} style={{ fontSize: 12, marginTop: 2 }}>
                            Book: {l.tp_written != null ? `${l.tp_written} pts` : ""}
                            {l.tp_written != null && l.ft_written ? " · " : ""}
                            {l.ft_written ? `FT ${l.ft_written}` : ""}
                          </div>
                        )}
                      </td>
                      {PERIODS.map((p: Period) => (
                        <td key={p}>
                          <input
                            className={`${s.marks} ${badMarks(l[p]) ? s.warn : ""}`}
                            value={l[p]}
                            inputMode="numeric"
                            aria-label={`${who}, ${PERIOD_LABEL[p]} quarter marks`}
                            onChange={(e) => update(l.id, { [p]: e.target.value.slice(0, 80) })}
                          />
                        </td>
                      ))}
                      <td>
                        <input className={s.num} inputMode="numeric" value={l.rebounds} aria-label={`${who}: rebounds`} onChange={(e) => update(l.id, { rebounds: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0 })} />
                      </td>
                      <td>
                        <input className={s.num} inputMode="numeric" value={l.fouls} aria-label={`${who}: fouls`} onChange={(e) => update(l.id, { fouls: Math.min(9, Number(e.target.value.replace(/\D/g, "").slice(0, 1)) || 0) })} />
                      </td>
                      <td>
                        <b>{t.points}</b>
                      </td>
                      <td>
                        <input type="checkbox" checked={l.played} aria-label={`${who} played`} onChange={(e) => update(l.id, { played: e.target.checked })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <p className={s.muted} style={{ maxWidth: 560 }}>
              Type marks the way the book has them: <b>2</b> and <b>3</b> are baskets, <b>1</b> a made free throw, <b>0</b> a missed one. Rebounds are the R marks.
            </p>
            <button
              type="button"
              className={s.btn}
              onClick={() =>
                setLines((all) => [
                  ...all,
                  { id: newId(), player_id: null, jersey: "", book_name: "", q1: "", q2: "", q3: "", q4: "", ot: "", rebounds: 0, fouls: 0, played: true, tp_written: null, ft_written: "" },
                ])
              }
            >
              Add a player
            </button>
          </div>
        </section>
      </div>

      {error && <p className={s.error}>{error}</p>}
      <div className={s.actions} style={{ justifyContent: "space-between" }}>
        <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={!!busy} onClick={remove}>
          {busy === "delete" ? "Deleting…" : "Delete game"}
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {game.status === "draft" ? (
            <button type="button" className={s.btn} disabled={!!busy} onClick={() => save(false)}>
              {busy === "draft" ? "Saving…" : "Save for later"}
            </button>
          ) : (
            <button type="button" className={s.btn} disabled={!!busy} onClick={backToDraft}>
              Take off the season
            </button>
          )}
          <button type="button" className={`${s.btn} ${s.btnAccent}`} disabled={!!busy} onClick={() => save(true)}>
            {busy === "save" ? "Saving…" : "Save stats"}
          </button>
        </div>
      </div>
    </>
  );
}
