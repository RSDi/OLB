"use client";
// The public live page (0165): what's on each court, pool standings and
// the games they feed, and every game with its score. Reloads itself every
// 30 seconds. "Follow a team" (kept on this phone) narrows the schedule and
// highlights the team everywhere.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HostedGame } from "../../../lib/hosted/types";
import type { LiveData, LiveDivision } from "../../../lib/hosted/live";
import { formatDay } from "../../../lib/hosted/logic";
import { parseSeat, poolStandings, poolsOf, placeName } from "../../../lib/hosted/standings";
import { gameState, isFinal, sideView, sortGames, whenLabel, type Clock, type SideView } from "../../../lib/hosted/live-view";
import s from "./live.module.css";

const FOLLOW_KEY = "olb-live-follow";

export function LiveBoard({ data, now, updatedAt }: { data: LiveData; now: Clock; updatedAt: string }) {
  const router = useRouter();
  const [follow, setFollow] = useState("");
  const [divId, setDivId] = useState(data.divisions[0]?.id ?? "");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FOLLOW_KEY);
      if (saved && data.teams.some((t) => t.id === saved)) {
        // Read once after mount: localStorage isn't there on the server.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFollow(saved);
        const t = data.teams.find((x) => x.id === saved);
        if (t?.division_id) setDivId(t.division_id);
      }
    } catch {
      /* private window: just don't remember */
    }
  }, [data.teams]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);

  function pickFollow(id: string) {
    setFollow(id);
    const t = data.teams.find((x) => x.id === id);
    if (t?.division_id) setDivId(t.division_id);
    try {
      if (id) localStorage.setItem(FOLLOW_KEY, id);
      else localStorage.removeItem(FOLLOW_KEY);
    } catch {
      /* ignore */
    }
  }

  const divName = useMemo(() => new Map(data.divisions.map((d) => [d.id, d.code || d.name])), [data.divisions]);
  const sorted = useMemo(() => sortGames(data.games), [data.games]);
  const division = data.divisions.find((d) => d.id === divId) ?? data.divisions[0];

  return (
    <div className={s.shell}>
      <label className={s.follow}>
        ★ Follow a team
        <select value={follow} onChange={(e) => pickFollow(e.target.value)} aria-label="Follow a team">
          <option value="">Everyone</option>
          {data.divisions.map((d) => (
            <optgroup key={d.id} label={d.name}>
              {data.teams
                .filter((t) => t.division_id === d.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <section>
        <div className={s.secTitle}>
          <h2 className={s.display}>On the courts</h2>
          <span className={s.note}>Updated {updatedAt}</span>
        </div>
        <Courts data={data} games={sorted} now={now} follow={follow} divName={divName} />
      </section>

      {division && (
        <section>
          <div className={s.secTitle}>
            <h2 className={s.display}>Standings &amp; brackets</h2>
          </div>
          <div className={s.chips} role="group" aria-label="Division">
            {data.divisions.map((d) => (
              <button key={d.id} type="button" className={`${s.chip} ${d.id === division.id ? s.chipOn : ""}`} aria-pressed={d.id === division.id} onClick={() => setDivId(d.id)}>
                {d.code || d.name}
              </button>
            ))}
          </div>
          <Division data={data} division={division} follow={follow} />
        </section>
      )}

      <section>
        <div className={s.secTitle}>
          <h2 className={s.display}>Schedule &amp; scores</h2>
          <span className={s.note}>{follow ? data.teams.find((t) => t.id === follow)?.name : "All divisions"}</span>
        </div>
        <Schedule data={data} games={sorted} now={now} follow={follow} divName={divName} />
      </section>

      {(data.admission || data.concessions || data.facility) && (
        <section>
          <div className={s.secTitle}>
            <h2 className={s.display}>Good to know</h2>
          </div>
          <div className={s.info}>
            {data.admission && (
              <div>
                <b>Admission</b>
                {data.admission}
              </div>
            )}
            {data.concessions && (
              <div>
                <b>Food</b>
                {data.concessions}
              </div>
            )}
            {data.facility && (
              <div>
                <b>Where</b>
                {data.facility}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function sideIs(v: SideView, follow: string) {
  return !!follow && v.teamId === follow;
}

function SideName({ v, follow }: { v: SideView; follow: string }) {
  if (!v.open) return <span className={sideIs(v, follow) ? s.mine : undefined}>{v.name}</span>;
  return (
    <span className={s.faint}>
      {v.name}
      {v.leader ? ` (${v.leader} so far)` : ""}
    </span>
  );
}

function TeamLine({ data, g, which, follow }: { data: LiveData; g: HostedGame; which: "home" | "away"; follow: string }) {
  const v = sideView(data, g, which);
  const pts = which === "home" ? g.home_score : g.away_score;
  const opp = which === "home" ? g.away_score : g.home_score;
  const cls = isFinal(g) ? (pts! > opp! ? s.won : s.lost) : "";
  return (
    <div className={`${s.line} ${cls}`}>
      <SideName v={v} follow={follow} />
      <span className={s.pts}>{pts ?? ""}</span>
    </div>
  );
}

function StatePill({ g, now, minutes }: { g: HostedGame; now: Clock; minutes: number }) {
  const st = gameState(g, now, minutes);
  if (st === "final") return <span className={`${s.pill} ${s.pillFinal}`}>Final</span>;
  if (st === "now") return <span className={`${s.pill} ${s.pillLive}`}>Now</span>;
  if (st === "waiting") return <span className={`${s.pill} ${s.pillNext}`}>Score coming</span>;
  return <span className={`${s.pill} ${s.pillNext}`}>{whenLabel(g, g.plays_on !== now.date)}</span>;
}

function Courts({ data, games, now, follow, divName }: { data: LiveData; games: HostedGame[]; now: Clock; follow: string; divName: Map<string, string> }) {
  const courts = Math.max(data.courts, ...games.map((g) => g.court ?? 0));
  if (games.length === 0) return <div className={s.empty}>The schedule will be here soon.</div>;
  return (
    <div className={s.courts}>
      {Array.from({ length: courts }, (_, i) => i + 1).map((c) => {
        const here = games.filter((g) => g.court === c);
        // On the court: a game under way (or waiting on its score); else the next one.
        const current =
          here.find((g) => ["now", "waiting"].includes(gameState(g, now, data.gameMinutes))) ?? here.find((g) => gameState(g, now, data.gameMinutes) === "later");
        const last = [...here].reverse().find((g) => isFinal(g));
        return (
          <div key={c} className={s.court}>
            <div className={s.courtName}>
              Court {c}
              {current?.division_id && <span className={`${s.pill} ${s.pillDiv}`}>{divName.get(current.division_id)}</span>}
            </div>
            {current ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <StatePill g={current} now={now} minutes={data.gameMinutes} />
                  {current.label && <span className={s.note}>{current.label}</span>}
                </div>
                <TeamLine data={data} g={current} which="home" follow={follow} />
                <TeamLine data={data} g={current} which="away" follow={follow} />
              </>
            ) : (
              <span className={s.note}>No more games on this court.</span>
            )}
            {last && (
              <div className={s.then}>
                Last final: {sideView(data, last, "home").name} {last.home_score}, {sideView(data, last, "away").name} {last.away_score}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Division({ data, division, follow }: { data: LiveData; division: LiveDivision; follow: string }) {
  const pools = poolsOf(data.teams, division.id);
  const games = data.games.filter((g) => g.division_id === division.id);
  const seatGames = sortGames(games.filter((g) => parseSeat(g.home_from) || parseSeat(g.away_from)));
  const bracketGames = games.filter((g) => /^[WL]:/.test(g.home_from ?? "") || /^[WL]:/.test(g.away_from ?? "") || division.format === "bracket");
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";

  return (
    <div>
      {division.format === "pool" && (
        <div className={`${s.pools} ${pools.length === 1 ? s.poolsOne : ""}`}>
          {pools.map((p) => {
            const st = poolStandings(data.games, data.teams, division.id, p);
            return (
              <div key={p ?? 0} className={s.pool}>
                <h3>
                  {p == null ? division.name : `Pool ${p}`}
                  <span>{st.done ? "Final" : st.left ? `${st.left} ${st.left === 1 ? "game" : "games"} left` : ""}</span>
                </h3>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th />
                      <th>Team</th>
                      <th>W</th>
                      <th>L</th>
                      <th>+/−</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.rows.map((r, i) => {
                      const d = r.pf - r.pa;
                      return (
                        <tr key={r.teamId}>
                          <td className={s.rank}>{r.tied && st.done ? "T" : i + 1}</td>
                          <td>
                            <b className={follow === r.teamId ? s.mine : undefined}>{teamName(r.teamId)}</b>
                          </td>
                          <td>{r.w}</td>
                          <td>{r.l}</td>
                          <td>{d > 0 ? `+${d}` : d}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {seatGames.length > 0 && (
        <div className={s.saturday}>
          <div className={s.label}>Placement games · seats fill when the pools finish</div>
          {seatGames.map((g) => {
            const home = sideView(data, g, "home");
            const away = sideView(data, g, "away");
            const winner = isFinal(g) ? (g.home_score! > g.away_score! ? home : away) : null;
            return (
              <div key={g.id} className={s.match}>
                <div className={s.seats}>
                  <Seat v={home} pts={g.home_score} won={!!winner && winner === home} follow={follow} from={g.home_from} />
                  <Seat v={away} pts={g.away_score} won={!!winner && winner === away} follow={follow} from={g.away_from} />
                </div>
                <div className={s.joint} />
                <div className={s.place}>
                  <div className={`${s.placeWhat} ${s.display}`}>{g.label || `Game ${g.game_no}`}</div>
                  <div className={s.placeWhen}>
                    {whenLabel(g, true)}
                    {g.court ? ` · Court ${g.court}` : ""}
                  </div>
                  {winner && <div className={s.placeWho}>{winner.name}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {division.format === "bracket" && bracketGames.length > 0 && <Rounds data={data} games={bracketGames} follow={follow} />}
      {division.format === "pool" && seatGames.length === 0 && pools.length === 1 && (
        <p className={s.note} style={{ margin: "10px 0 0" }}>
          Standings by record, then the tournament&apos;s tiebreakers.
        </p>
      )}
    </div>
  );
}

function Seat({ v, pts, won, follow, from }: { v: SideView; pts: number | null; won: boolean; follow: string; from: string | null }) {
  const seat = parseSeat(from);
  const label = seat ? (v.open ? null : v.name) : null;
  return (
    <div className={`${s.seat} ${v.open ? s.seatOpen : ""} ${won ? s.seatWon : ""}`}>
      <span style={{ minWidth: 0 }}>
        {seat && <small>{label ? `Pool ${seat.pool} · ${placeName(seat.place)}` : v.name}</small>}
        {v.open ? <span>{v.leader ? `${v.leader} so far` : "—"}</span> : <span className={sideIs(v, follow) ? s.mine : undefined}>{v.name}</span>}
      </span>
      <span className={s.pts}>{pts ?? ""}</span>
    </div>
  );
}

function Rounds({ data, games, follow }: { data: LiveData; games: HostedGame[]; follow: string }) {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  return (
    <div className={s.rounds}>
      <div className={s.roundsGrid} style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(180px, 1fr))`, minWidth: rounds.length * 190 }}>
        {rounds.map((r, i) => (
          <div key={r} className={s.roundCol}>
            <span className={s.label}>{i === rounds.length - 1 && rounds.length > 1 ? "Places" : `Round ${r}`}</span>
            {games
              .filter((g) => g.round === r)
              .sort((a, b) => a.game_no - b.game_no)
              .map((g) => (
                <div key={g.id} className={s.box}>
                  <span className={s.boxHead}>
                    Game {g.game_no}
                    {g.label ? ` · ${g.label}` : ""}
                  </span>
                  <TeamLine data={data} g={g} which="home" follow={follow} />
                  <TeamLine data={data} g={g} which="away" follow={follow} />
                  <span className={s.note}>
                    {whenLabel(g, true)}
                    {g.court ? ` · Court ${g.court}` : ""}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Schedule({ data, games, now, follow, divName }: { data: LiveData; games: HostedGame[]; now: Clock; follow: string; divName: Map<string, string> }) {
  const shown = follow ? games.filter((g) => g.home_team_id === follow || g.away_team_id === follow) : games;
  const days = [...new Set(shown.map((g) => g.plays_on ?? ""))];
  if (shown.length === 0) return <div className={s.empty}>{follow ? "No games for this team yet." : "No games yet."}</div>;
  return (
    <div className={s.games}>
      {days.map((day) => (
        <div key={day || "none"}>
          <div className={s.dayHead}>{day ? formatDay(day) : "Time to be set"}</div>
          {shown
            .filter((g) => (g.plays_on ?? "") === day)
            .map((g) => {
              const home = sideView(data, g, "home");
              const away = sideView(data, g, "away");
              const fin = isFinal(g);
              const st = gameState(g, now, data.gameMinutes);
              return (
                <div key={g.id} className={s.g}>
                  <div className={s.gTime}>
                    <b>{whenLabel(g) || "TBD"}</b>
                    {g.court ? `Court ${g.court}` : ""}
                  </div>
                  <div className={s.gMatch}>
                    <span className={fin && g.home_score! > g.away_score! ? s.won : undefined}>
                      <SideName v={home} follow={follow} />
                    </span>{" "}
                    vs{" "}
                    <span className={fin && g.away_score! > g.home_score! ? s.won : undefined}>
                      <SideName v={away} follow={follow} />
                    </span>
                    <span className={s.gSub}>
                      {g.division_id ? divName.get(g.division_id) : "Crossover"}
                      {g.label ? ` · ${g.label}` : ""}
                    </span>
                  </div>
                  <div className={s.gScore}>
                    {fin ? (
                      `${g.home_score}–${g.away_score}`
                    ) : st === "now" ? (
                      <span className={`${s.pill} ${s.pillLive}`}>Now</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
