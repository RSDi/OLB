"use client";
// The scorer's table (0165): type the PIN once; then every game on every
// court in one list. Score saves a final (live page, TVs, winners move on);
// Fix changes or clears one; Edit game moves it (day, time, court) or picks
// its teams, and offers a swap when the new slot is taken. The last change
// can be undone. The list refreshes by itself so two phones stay in step.

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HostedGame } from "../../../../lib/hosted/types";
import type { LiveData } from "../../../../lib/hosted/live";
import { clearTableScore, editTableGame, enterScorerPin, leaveScorer, saveTableScore, swapTableGames, type TableGamePatch } from "../../../../lib/hosted/scorer-actions";
import { gameState, isFinal, sideView, sortGames, whenLabel, type Clock } from "../../../../lib/hosted/live-view";
import { formatDay } from "../../../../lib/hosted/logic";
import s from "../live.module.css";

export function PinForm({ weekendId }: { weekendId: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className={s.sk}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await enterScorerPin(weekendId, pin);
          if (r.error) setError(r.error);
          else router.refresh();
        });
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>Type the PIN from the tournament desk. You only do this once on this phone.</p>
      <input
        className={s.pinInput}
        id="scorer-pin"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
          setError(null);
        }}
        aria-label="PIN"
        placeholder="••••"
        autoFocus
      />
      {error && <div className={s.err}>{error}</div>}
      <button className={s.save} type="submit" disabled={busy || pin.length < 4}>
        {busy ? "Checking…" : "Start scoring"}
      </button>
    </form>
  );
}

type View = { kind: "list" } | { kind: "score"; id: string } | { kind: "edit"; id: string };
type Last = { line: string; undo: () => Promise<{ error?: string }> };

const SNAP = (g: HostedGame): TableGamePatch => ({
  plays_on: g.plays_on,
  starts_at: g.starts_at ? g.starts_at.slice(0, 5) : null,
  court: g.court,
  home_team_id: g.home_team_id,
  away_team_id: g.away_team_id,
  home_from: g.home_from,
  away_from: g.away_from,
});

export function ScorerApp({ data, court, courts, now }: { data: LiveData; court: number | null; courts: number; now: Clock }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [view, setView] = useState<View>({ kind: "list" });
  const [last, setLast] = useState<Last | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => [...new Set(data.games.map((g) => g.plays_on).filter((d): d is string => !!d))].sort(), [data.games]);
  const [day, setDay] = useState(() => (days.includes(now.date) ? now.date : (days.find((d) => d > now.date) ?? days[days.length - 1] ?? "")));
  const [ct, setCt] = useState<number | null>(court);

  // Keep the list current while it's on screen (the other phone's saves).
  useEffect(() => {
    if (view.kind !== "list") return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [view.kind, router]);

  const divName = (g: HostedGame) => {
    const d = data.divisions.find((x) => x.id === g.division_id);
    return d ? d.code || d.name : "";
  };
  const matchup = (g: HostedGame) => `${sideView(data, g, "home").name} vs ${sideView(data, g, "away").name}`;
  const where = (g: HostedGame) => `${whenLabel(g, g.plays_on !== now.date)}${g.court ? ` · Ct ${g.court}` : ""}`;

  function run(fn: () => Promise<{ error?: string }>, after: (ok: boolean) => void) {
    start(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        after(false);
        return;
      }
      setError(null);
      after(true);
      router.refresh();
    });
  }

  function undoLast() {
    if (!last) return;
    const l = last;
    run(l.undo, (ok) => ok && setLast(null));
  }

  const game = view.kind !== "list" ? data.games.find((g) => g.id === view.id) : undefined;
  const back = () => {
    setError(null);
    setView({ kind: "list" });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className={s.sk}>
      {last && (
        <div className={s.toast} role="status">
          <span>{last.line}</span>
          <button type="button" className={s.link} onClick={undoLast} disabled={busy}>
            Undo
          </button>
        </div>
      )}

      {view.kind === "list" || !game ? (
        <GameList
          data={data}
          days={days}
          day={day}
          setDay={setDay}
          ct={ct}
          setCt={setCt}
          courts={courts}
          now={now}
          divName={divName}
          onScore={(g) => {
            setError(null);
            setView({ kind: "score", id: g.id });
            window.scrollTo({ top: 0 });
          }}
          onEdit={(g) => {
            setError(null);
            setView({ kind: "edit", id: g.id });
            window.scrollTo({ top: 0 });
          }}
        />
      ) : view.kind === "score" ? (
        <ScoreGame
          key={game.id}
          data={data}
          game={game}
          busy={busy}
          error={error}
          setError={setError}
          title={where(game)}
          divName={divName(game)}
          onBack={back}
          onEdit={() => setView({ kind: "edit", id: game.id })}
          onSave={(h, a) => {
            const before = isFinal(game) ? { h: game.home_score!, a: game.away_score! } : null;
            const line = `${sideView(data, game, "home").name} ${h}, ${sideView(data, game, "away").name} ${a}`;
            run(
              () => saveTableScore(data.weekendId, game.id, h, a),
              (ok) => {
                if (!ok) return;
                setLast({
                  line: `${before ? "Changed" : "Saved"}: ${line}. It's on the live page.`,
                  undo: () => (before ? saveTableScore(data.weekendId, game.id, before.h, before.a) : clearTableScore(data.weekendId, game.id)),
                });
                back();
              }
            );
          }}
          onClear={() => {
            if (!isFinal(game)) return;
            if (!confirm("Clear this score? The game goes back to waiting for a final.")) return;
            const before = { h: game.home_score!, a: game.away_score! };
            run(
              () => clearTableScore(data.weekendId, game.id),
              (ok) => {
                if (!ok) return;
                setLast({ line: `Cleared the score of ${matchup(game)}.`, undo: () => saveTableScore(data.weekendId, game.id, before.h, before.a) });
                back();
              }
            );
          }}
        />
      ) : (
        <EditGame
          key={game.id}
          data={data}
          game={game}
          days={days}
          courts={courts}
          busy={busy}
          error={error}
          divName={divName(game)}
          onBack={back}
          onSave={(patch) => {
            const before = SNAP(game);
            run(
              () => editTableGame(data.weekendId, game.id, patch),
              (ok) => {
                if (!ok) return;
                setLast({ line: `Changed Game ${game.game_no}: ${describe(patch, game)}.`, undo: () => editTableGame(data.weekendId, game.id, before) });
                if (patch.plays_on) setDay(patch.plays_on);
                back();
              }
            );
          }}
          onSwap={(other) => {
            run(
              () => swapTableGames(data.weekendId, game.id, other.id),
              (ok) => {
                if (!ok) return;
                setLast({
                  line: `Swapped Game ${game.game_no} and Game ${other.game_no}.`,
                  undo: () => swapTableGames(data.weekendId, game.id, other.id),
                });
                back();
              }
            );
          }}
        />
      )}

      {view.kind === "list" && error && <div className={s.err}>{error}</div>}

      <p className={s.note} style={{ textAlign: "center" }}>
        <Link href="/shootout" style={{ color: "inherit", fontWeight: 700 }}>
          Open the live page
        </Link>
        {" · "}
        <button
          type="button"
          className={s.link}
          style={{ fontWeight: 600 }}
          onClick={() =>
            start(async () => {
              await leaveScorer();
              router.refresh();
            })
          }
        >
          Sign this phone out
        </button>
      </p>
    </div>
  );
}

function describe(p: TableGamePatch, g: HostedGame): string {
  const bits: string[] = [];
  if (p.plays_on !== undefined && p.plays_on !== g.plays_on && p.plays_on) bits.push(formatDay(p.plays_on, { short: true }));
  if (p.starts_at !== undefined && p.starts_at !== (g.starts_at?.slice(0, 5) ?? null)) bits.push(`at ${whenLabel({ ...g, starts_at: p.starts_at ?? null })}`);
  if (p.court !== undefined && p.court !== g.court && p.court) bits.push(`on Ct ${p.court}`);
  if (p.home_team_id !== undefined || p.away_team_id !== undefined || p.home_from !== undefined || p.away_from !== undefined) bits.push("new teams");
  return bits.length ? `now ${bits.join(" ")}` : "saved";
}

// ─── The list ──────────────────────────────────────────────────────────────

function GameList(props: {
  data: LiveData;
  days: string[];
  day: string;
  setDay: (d: string) => void;
  ct: number | null;
  setCt: (c: number | null) => void;
  courts: number;
  now: Clock;
  divName: (g: HostedGame) => string;
  onScore: (g: HostedGame) => void;
  onEdit: (g: HostedGame) => void;
}) {
  const { data, days, day, setDay, ct, setCt, courts, now, divName, onScore, onEdit } = props;
  const games = sortGames(data.games.filter((g) => (g.plays_on ?? "") === day && (ct == null || g.court === ct)));
  const started = games.filter((g) => !isFinal(g) && gameState(g, now, data.gameMinutes) !== "later");
  const later = games.filter((g) => !isFinal(g) && gameState(g, now, data.gameMinutes) === "later");
  const finals = games.filter((g) => isFinal(g)).reverse();
  const unscheduled = sortGames(data.games.filter((g) => !g.plays_on && (ct == null || g.court === ct)));

  const card = (g: HostedGame) => {
    const hv = sideView(data, g, "home");
    const av = sideView(data, g, "away");
    const st = gameState(g, now, data.gameMinutes);
    const open = hv.open || av.open;
    const fin = isFinal(g);
    const homeWon = fin && g.home_score! > g.away_score!;
    return (
      <div key={g.id} className={`${s.tcard} ${st === "waiting" ? s.tcardDue : ""}`}>
        <div className={s.tcardWhen}>
          {whenLabel(g) || "—"}
          <small>{g.court ? `Ct ${g.court}` : "No court"}</small>
        </div>
        <div className={s.tcardMatch}>
          {fin ? (
            <>
              <span className={homeWon ? s.won : s.lost}>
                {hv.name} {g.home_score}
              </span>
              <br />
              <span className={homeWon ? s.lost : s.won}>
                {av.name} {g.away_score}
              </span>
            </>
          ) : (
            <>
              {hv.name} vs {av.name}
            </>
          )}
          <small>
            {[divName(g), g.label, `Game ${g.game_no}`].filter(Boolean).join(" · ")}
            {st === "waiting" ? " · needs a final" : ""}
          </small>
        </div>
        <div className={s.tcardAct}>
          {fin ? (
            <button type="button" className={s.tbtnLight} onClick={() => onScore(g)}>
              Fix
            </button>
          ) : open ? (
            <span className={s.note} style={{ fontWeight: 700, textAlign: "right" }}>
              Teams
              <br />
              not set
            </span>
          ) : (
            <button type="button" className={s.tbtn} onClick={() => onScore(g)}>
              Score
            </button>
          )}
        </div>
        <button type="button" className={s.tcardEdit} onClick={() => onEdit(g)}>
          <span>Wrong court or time?</span>
          <b>✎ Edit game</b>
        </button>
      </div>
    );
  };

  return (
    <>
      {days.length > 1 && (
        <div className={s.tdays} role="group" aria-label="Day">
          {days.map((d) => (
            <button key={d} type="button" className={d === day ? s.tdayOn : ""} aria-pressed={d === day} onClick={() => setDay(d)}>
              {formatDay(d, { short: true })}
            </button>
          ))}
        </div>
      )}
      <div className={s.courtPick} role="group" aria-label="Court" style={{ gridTemplateColumns: `repeat(${Math.min(courts + 1, 6)}, 1fr)` }}>
        <button type="button" className={`${s.courtBtn} ${ct == null ? s.courtBtnOn : ""}`} aria-pressed={ct == null} onClick={() => setCt(null)}>
          All
        </button>
        {Array.from({ length: courts }, (_, i) => i + 1).map((c) => (
          <button key={c} type="button" className={`${s.courtBtn} ${c === ct ? s.courtBtnOn : ""}`} aria-pressed={c === ct} onClick={() => setCt(c)}>
            Ct {c}
          </button>
        ))}
      </div>

      {started.length > 0 && (
        <>
          <div className={s.tlabel}>
            <span>Playing now · needs a final</span>
            <span className={s.tcount}>{started.length}</span>
          </div>
          {started.map(card)}
        </>
      )}
      {later.length > 0 && (
        <>
          <div className={s.tlabel}>
            <span>Coming up</span>
          </div>
          {later.map(card)}
        </>
      )}
      {finals.length > 0 && (
        <>
          <div className={s.tlabel}>
            <span>Finals</span>
          </div>
          {finals.map(card)}
        </>
      )}
      {games.length === 0 && <div className={s.empty}>No games {ct ? `on Court ${ct} ` : ""}this day.</div>}
      {unscheduled.length > 0 && (
        <>
          <div className={s.tlabel}>
            <span>No day yet</span>
          </div>
          {unscheduled.map(card)}
        </>
      )}
    </>
  );
}

// ─── Score or fix one game ─────────────────────────────────────────────────

function ScoreGame(props: {
  data: LiveData;
  game: HostedGame;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  title: string;
  divName: string;
  onBack: () => void;
  onEdit: () => void;
  onSave: (h: number, a: number) => void;
  onClear: () => void;
}) {
  const { data, game, busy, error, setError, title, divName, onBack, onEdit, onSave, onClear } = props;
  const fin = isFinal(game);
  const [home, setHome] = useState(fin ? String(game.home_score) : "");
  const [away, setAway] = useState(fin ? String(game.away_score) : "");
  const hv = sideView(data, game, "home");
  const av = sideView(data, game, "away");
  const ready = !hv.open && !av.open;
  const h = Number(home);
  const a = Number(away);
  const filled = home !== "" && away !== "";

  // A fix that flips the winner moves a different team into the games this
  // one feeds. Name them, and say so louder when one is already final.
  const flips = fin && filled && h !== a && h > a !== game.home_score! > game.away_score!;
  const fed = data.games.filter((g) => g.home_from?.slice(2) === game.id || g.away_from?.slice(2) === game.id);
  const pooled = !!game.division_id && data.games.some((g) => g.division_id === game.division_id && (g.home_from?.startsWith("P:") || g.away_from?.startsWith("P:")));
  const newWinner = h > a ? hv.name : av.name;
  const newLoser = h > a ? av.name : hv.name;

  return (
    <>
      <button type="button" className={s.tback} onClick={onBack}>
        ‹ All games
      </button>
      <div className={s.note}>
        <b style={{ color: "var(--fg)" }}>
          {fin ? "Fix · " : ""}
          {title}
          {divName ? ` · ${divName}` : ""}
        </b>
        {game.label ? ` · ${game.label}` : ""} · Game {game.game_no}
      </div>
      <div className={s.entry}>
        <div className={s.entryName}>
          <small>Home</small>
          {hv.name}
        </div>
        <input
          id="score-home"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={home}
          placeholder="–"
          onChange={(e) => {
            setHome(e.target.value.replace(/\D/g, "").slice(0, 3));
            setError(null);
          }}
          aria-label={`${hv.name} score`}
          disabled={!ready}
          autoFocus={ready && !fin}
        />
      </div>
      <div className={s.entry}>
        <div className={s.entryName}>
          <small>Visitor</small>
          {av.name}
        </div>
        <input
          id="score-away"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={away}
          placeholder="–"
          onChange={(e) => {
            setAway(e.target.value.replace(/\D/g, "").slice(0, 3));
            setError(null);
          }}
          aria-label={`${av.name} score`}
          disabled={!ready}
        />
      </div>
      {!ready && (
        <div className={s.note}>
          This game&apos;s teams aren&apos;t set yet. They fill in when the games before it are scored, or pick them with{" "}
          <button type="button" className={s.link} onClick={onEdit}>
            Edit game
          </button>
          .
        </div>
      )}
      {flips && (fed.length > 0 || pooled) && (
        <div className={s.toast} style={{ display: "block", fontWeight: 500 }}>
          <b>This changes the winner.</b>{" "}
          {fed.length > 0
            ? fed.map((g) => {
                const done = isFinal(g);
                return (
                  <span key={g.id}>
                    Game {g.game_no} ({[g.label, whenLabel(g, true)].filter(Boolean).join(", ")}) gets {goesOn(g, game.id, newWinner, newLoser)}
                    {done ? <b> — that game already has a final. Check with the tournament desk first.</b> : "."}{" "}
                  </span>
                );
              })
            : "The pool standings change, and Saturday's seats with them."}
        </div>
      )}
      {error && <div className={s.err}>{error}</div>}
      <button type="button" className={s.save} onClick={() => onSave(h, a)} disabled={busy || !ready || !filled || (fin && h === game.home_score && a === game.away_score)}>
        {busy ? "Saving…" : fin ? "Save change" : "Save final"}
      </button>
      {fin && (
        <button type="button" className={s.danger} onClick={onClear} disabled={busy}>
          Clear this score
        </button>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
        <button type="button" className={s.link} onClick={onBack}>
          Cancel
        </button>
        <button type="button" className={s.link} onClick={onEdit}>
          Edit game
        </button>
      </div>
    </>
  );
}

// Who a game fed by this one gets: its winner or its loser.
function goesOn(g: HostedGame, sourceId: string, winner: string, loser: string): string {
  const from = g.home_from?.slice(2) === sourceId ? g.home_from : g.away_from;
  return from?.[0] === "W" ? winner : loser;
}

// ─── Move a game or pick its teams ─────────────────────────────────────────

const FOLLOW = "follow";

function EditGame(props: {
  data: LiveData;
  game: HostedGame;
  days: string[];
  courts: number;
  busy: boolean;
  error: string | null;
  divName: string;
  onBack: () => void;
  onSave: (p: TableGamePatch) => void;
  onSwap: (other: HostedGame) => void;
}) {
  const { data, game, days, courts, busy, error, divName, onBack, onSave, onSwap } = props;
  const [day, setDay] = useState(game.plays_on ?? "");
  const [time, setTime] = useState(game.starts_at?.slice(0, 5) ?? "");
  const [court, setCourt] = useState(game.court ? String(game.court) : "");
  const [home, setHome] = useState(initial(game, "home"));
  const [away, setAway] = useState(initial(game, "away"));

  const teams = data.teams.filter((t) => !game.division_id || t.division_id === game.division_id).sort((a, b) => a.name.localeCompare(b.name));
  const dayList = [...new Set([...days, ...(game.plays_on ? [game.plays_on] : [])])].sort();
  const seatName = (which: "home" | "away") => sideView(data, { ...game, home_team_id: null, away_team_id: null }, which).name;

  const clash = day && time && court ? data.games.find((g) => g.id !== game.id && g.plays_on === day && g.starts_at?.slice(0, 5) === time && String(g.court) === court) : undefined;
  const moved = day !== (game.plays_on ?? "") || time !== (game.starts_at?.slice(0, 5) ?? "") || court !== (game.court ? String(game.court) : "");
  const onlyMoved = home === initial(game, "home") && away === initial(game, "away");

  function patch(): TableGamePatch {
    const p: TableGamePatch = {};
    if (day !== (game.plays_on ?? "")) p.plays_on = day || null;
    if (time !== (game.starts_at?.slice(0, 5) ?? "")) p.starts_at = time || null;
    if (court !== (game.court ? String(game.court) : "")) p.court = court ? Number(court) : null;
    for (const side of ["home", "away"] as const) {
      const v = side === "home" ? home : away;
      if (v === initial(game, side)) continue;
      if (v === FOLLOW) {
        p[`${side}_from`] = game[`${side}_from`];
        p[`${side}_team_id`] = null;
      } else {
        p[`${side}_team_id`] = v || null;
        if (game[`${side}_from`]) p[`${side}_from`] = null;
      }
    }
    return p;
  }

  const handPicked = (["home", "away"] as const).filter((side) => game[`${side}_from`] && (side === "home" ? home : away) !== FOLLOW);
  const changed = moved || !onlyMoved;
  const sameTeams = home && away && home !== FOLLOW && home === away;

  const teamSelect = (side: "home" | "away") => {
    const v = side === "home" ? home : away;
    const set = side === "home" ? setHome : setAway;
    const from = game[`${side}_from`];
    return (
      <label className={s.tfield} style={v !== initial(game, side) ? { borderColor: "var(--bolt)", borderWidth: 2 } : undefined}>
        <small>
          {side === "home" ? "Home" : "Visitor"}
          {from ? (v === FOLLOW ? " · fills from results" : " · picked by hand") : ""}
        </small>
        <select value={v} onChange={(e) => set(e.target.value)}>
          {from && <option value={FOLLOW}>{seatName(side)} (fills itself)</option>}
          {!from && <option value="">To be set</option>}
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <>
      <button type="button" className={s.tback} onClick={onBack}>
        ‹ All games
      </button>
      <div className={s.note}>
        <b style={{ color: "var(--fg)" }}>
          Edit · Game {game.game_no}
          {divName ? ` · ${divName}` : ""}
        </b>
        {game.label ? ` · ${game.label}` : ""}
      </div>
      <div className={s.tgrid3}>
        <label className={s.tfield}>
          <small>Day</small>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {!day && <option value="">Not set</option>}
            {dayList.map((d) => (
              <option key={d} value={d}>
                {shortDay(d)}
              </option>
            ))}
          </select>
        </label>
        <label className={s.tfield}>
          <small>Time</small>
          <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className={s.tfield}>
          <small>Court</small>
          <select value={court} onChange={(e) => setCourt(e.target.value)}>
            {!court && <option value="">–</option>}
            {Array.from({ length: Math.max(courts, game.court ?? 0) }, (_, i) => i + 1).map((c) => (
              <option key={c} value={String(c)}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {clash && moved && (
        <div className={s.toast} style={{ display: "block", fontWeight: 500 }}>
          <b>Court {court} at {whenLabel(clash)} already has a game:</b> {sideView(data, clash, "home").name} vs {sideView(data, clash, "away").name}.
          {onlyMoved && (
            <div style={{ marginTop: 6 }}>
              <button type="button" className={s.link} onClick={() => onSwap(clash)} disabled={busy}>
                Swap the two games
              </button>{" "}
              <span className={s.note}>(it moves to {game.court ? `Ct ${game.court}` : "no court"} at {whenLabel(game, game.plays_on !== day) || "no time"})</span>
            </div>
          )}
        </div>
      )}
      {teamSelect("home")}
      {teamSelect("away")}
      {handPicked.length > 0 && (
        <div className={s.toast} style={{ display: "block", fontWeight: 500 }}>
          <b>Picked by hand.</b>{" "}
          {handPicked.map((side) => `This seat was "${seatName(side)}". `)}
          It stays as picked even if those results change. Choose &quot;(fills itself)&quot; to go back.
        </div>
      )}
      {sameTeams && <div className={s.err}>Pick two different teams.</div>}
      {error && <div className={s.err}>{error}</div>}
      <button type="button" className={s.save} disabled={busy || !changed || !!sameTeams} onClick={() => onSave(patch())}>
        {busy ? "Saving…" : clash && moved ? "Save anyway (both games there)" : "Save changes"}
      </button>
      <button type="button" className={s.link} onClick={onBack} style={{ alignSelf: "center" }}>
        Cancel
      </button>
      <p className={s.note} style={{ margin: 0 }}>
        Changes show on the live page and TVs right away.
      </p>
    </>
  );
}

// "Sat 14": fits the Day box.
function shortDay(d: string): string {
  const at = new Date(`${d}T12:00:00`);
  return `${at.toLocaleDateString("en-US", { weekday: "short" })} ${at.getDate()}`;
}

// A seat with a from follows results (picking by hand clears the from).
function initial(g: HostedGame, side: "home" | "away"): string {
  return g[`${side}_from`] ? FOLLOW : (g[`${side}_team_id`] ?? "");
}
