"use client";
// The scorer's table (0165): type the PIN once; then the court's next game
// waits with two big boxes. Save final puts it on the live page, moves
// winners on and fills pool seats. Undo right after, or Fix an earlier one.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HostedGame } from "../../../../lib/hosted/types";
import type { LiveData } from "../../../../lib/hosted/live";
import { clearTableScore, enterScorerPin, leaveScorer, saveTableScore } from "../../../../lib/hosted/scorer-actions";
import { isFinal, sideView, sortGames, whenLabel } from "../../../../lib/hosted/live-view";
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
      <p style={{ margin: 0, fontWeight: 600 }}>Type the six-digit PIN from the tournament desk. You only do this once on this phone.</p>
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
        placeholder="••••••"
        autoFocus
      />
      {error && <div className={s.err}>{error}</div>}
      <button className={s.save} type="submit" disabled={busy || pin.length !== 6}>
        {busy ? "Checking…" : "Start scoring"}
      </button>
    </form>
  );
}

export function ScorerApp({ data, court, courts, today }: { data: LiveData; court: number; courts: number; today: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; line: string } | null>(null);
  const [fixId, setFixId] = useState<string | null>(null);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  const onCourt = sortGames(data.games.filter((g) => g.court === court));
  const todays = onCourt.filter((g) => !g.plays_on || g.plays_on === today);
  const list = todays.length ? todays : onCourt;
  const game: HostedGame | undefined = fixId ? onCourt.find((g) => g.id === fixId) : list.find((g) => !isFinal(g)) ?? onCourt.find((g) => !isFinal(g));
  const earlier = list.filter((g) => isFinal(g)).reverse();
  const hv = game ? sideView(data, game, "home") : null;
  const av = game ? sideView(data, game, "away") : null;
  const ready = !!game && !hv?.open && !av?.open;

  function goCourt(c: number) {
    setSaved(null);
    setFixId(null);
    setHome("");
    setAway("");
    setError(null);
    router.replace(`/shootout/score?court=${c}`);
  }

  function save() {
    if (!game || !hv || !av) return;
    const h = Number(home);
    const a = Number(away);
    start(async () => {
      const r = await saveTableScore(data.weekendId, game.id, h, a);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSaved({ id: game.id, line: `${hv.name} ${h}, ${av.name} ${a}` });
      setFixId(null);
      setHome("");
      setAway("");
      setError(null);
      router.refresh();
    });
  }

  function undo() {
    if (!saved) return;
    const id = saved.id;
    start(async () => {
      const r = await clearTableScore(data.weekendId, id);
      if (r.error) setError(r.error);
      else {
        setSaved(null);
        router.refresh();
      }
    });
  }

  return (
    <div className={s.sk}>
      <div className={s.courtPick} role="group" aria-label="Court" style={{ gridTemplateColumns: `repeat(${Math.min(courts, 6)}, 1fr)` }}>
        {Array.from({ length: courts }, (_, i) => i + 1).map((c) => (
          <button key={c} type="button" className={`${s.courtBtn} ${c === court ? s.courtBtnOn : ""}`} aria-pressed={c === court} onClick={() => goCourt(c)}>
            Ct {c}
          </button>
        ))}
      </div>

      {saved && (
        <div className={s.toast} role="status">
          <span>Saved: {saved.line}. It&apos;s on the live page.</span>
          <button type="button" className={s.link} onClick={undo} disabled={busy}>
            Undo
          </button>
        </div>
      )}

      {game && hv && av ? (
        <>
          <div className={s.note}>
            <b style={{ color: "var(--fg)" }}>
              {fixId ? "Fixing · " : ""}
              {whenLabel(game, game.plays_on !== today)}
              {game.division_id ? ` · ${data.divisions.find((d) => d.id === game.division_id)?.name ?? ""}` : ""}
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
              placeholder={fixId && game.home_score != null ? String(game.home_score) : "–"}
              onChange={(e) => {
                setHome(e.target.value.replace(/\D/g, "").slice(0, 3));
                setError(null);
              }}
              aria-label={`${hv.name} score`}
              disabled={!ready}
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
              placeholder={fixId && game.away_score != null ? String(game.away_score) : "–"}
              onChange={(e) => {
                setAway(e.target.value.replace(/\D/g, "").slice(0, 3));
                setError(null);
              }}
              aria-label={`${av.name} score`}
              disabled={!ready}
            />
          </div>
          {!ready && <div className={s.note}>This game&apos;s teams aren&apos;t set yet. They fill in when the games before it are scored.</div>}
          {error && <div className={s.err}>{error}</div>}
          <button type="button" className={s.save} onClick={save} disabled={busy || !ready || !home || !away}>
            {busy ? "Saving…" : "Save final"}
          </button>
          {fixId && (
            <button type="button" className={s.link} onClick={() => setFixId(null)} style={{ alignSelf: "center" }}>
              Cancel fixing
            </button>
          )}
        </>
      ) : (
        <div className={s.empty}>No more games on Court {court}.</div>
      )}

      {earlier.length > 0 && (
        <div>
          <div className={s.label} style={{ margin: "6px 0" }}>
            Earlier on this court
          </div>
          <div className={s.earlier}>
            {earlier.map((g) => (
              <div key={g.id} className={s.earlierRow}>
                <span>
                  {sideView(data, g, "home").name} {g.home_score}, {sideView(data, g, "away").name} {g.away_score}
                </span>
                <button
                  type="button"
                  className={s.link}
                  onClick={() => {
                    setFixId(g.id);
                    setSaved(null);
                    setHome(String(g.home_score));
                    setAway(String(g.away_score));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Fix
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
