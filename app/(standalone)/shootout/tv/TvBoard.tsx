"use client";
// The live page for a TV (0165 data): a 1920×1080 stage scaled to whatever
// screen it's on, turning through "On the courts" and a screen for each
// division. Reloads the scores every 30 seconds and keeps the screen awake
// where the browser allows it. Nothing to click: it's meant to be left on.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { HostedGame } from "../../../../lib/hosted/types";
import type { LiveData, LiveDivision } from "../../../../lib/hosted/live";
import { poolStandings, poolsOf } from "../../../../lib/hosted/standings";
import { gameState, isFinal, sideView, sortGames, tvSlug, whenLabel, type Clock, type SideView } from "../../../../lib/hosted/live-view";
import bolt from "../../../(site)/_images/logo-bolt.png";
import s from "./tv.module.css";

const W = 1920;
const H = 1080;
const MAX_GAMES = 10;

type Screen = { key: string; tab: string; title: string; division: LiveDivision | null };

interface Props {
  data: LiveData | null;
  now: Clock;
  clock: string;
  dates: string;
  qr: string;
  pin: string | null;
  seconds: number;
}

export function TvBoard({ data, now, clock, dates, qr, pin, seconds }: Props) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [time, setTime] = useState<string | null>(null);

  const screens = useMemo<Screen[]>(() => {
    if (!data) return [];
    const all: Screen[] = [
      { key: "courts", tab: "Courts", title: "On the courts", division: null },
      ...data.divisions.map((d) => ({ key: tvSlug(d), tab: d.code || d.name, title: d.name, division: d })),
    ];
    return pin ? all.filter((x) => x.key === pin) : all;
  }, [data, pin]);
  const screen = screens.length ? screens[step % screens.length] : null;

  // Fit the 1920×1080 stage to the screen.
  useEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (!el) return;
      const k = Math.min(window.innerWidth / W, window.innerHeight / H);
      el.style.transform = `translate(-50%, -50%) scale(${k})`;
      el.style.opacity = "1";
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Next screen.
  useEffect(() => {
    if (screens.length < 2) return;
    const t = setInterval(() => setStep((n) => n + 1), seconds * 1000);
    return () => clearInterval(t);
  }, [screens.length, seconds]);

  // Fresh scores every 30 seconds, the clock every 10, and a full reload
  // every few hours so a TV left on all weekend picks up any change.
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
    const scores = setInterval(() => router.refresh(), 30_000);
    const tick = setInterval(() => setTime(fmt.format(new Date())), 10_000);
    const reload = setTimeout(() => window.location.reload(), 3 * 60 * 60 * 1000);
    return () => {
      clearInterval(scores);
      clearInterval(tick);
      clearTimeout(reload);
    };
  }, [router]);

  // Keep the screen from going to sleep, where the browser lets us.
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    let lock: Lock | null = null;
    const ask = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      lock?.release().catch(() => {});
    };
  }, []);

  return (
    <div className={s.tv}>
      <div ref={stage} className={s.stage}>
        <header className={s.head}>
          <div className={s.brand}>
            <Image src={bolt} alt="Omaha Lightning" className={s.bolt} priority sizes="150px" />
            <div className={s.brandText}>
              <div className={s.eyebrow}>{data ? [data.event, dates, data.facility?.split("\n")[0]].filter(Boolean).join("  ·  ") : "Omaha Lightning Basketball"}</div>
              <h1 key={screen?.key ?? "none"} className={`${s.title} ${s.display} ${s.fade}`}>
                {screen?.title ?? data?.event ?? "Omaha Lightning"}
              </h1>
            </div>
          </div>
          <div className={s.clock}>
            <span className={s.clockTime}>{time ?? clock}</span>
            {data && (
              <span className={s.clockSub}>
                <i className={s.dot} /> Scores update on their own
              </span>
            )}
          </div>
        </header>

        <main className={s.body}>
          {!data || !screen ? (
            <div className={s.empty}>
              <div className={s.display}>Scores will be here on game day.</div>
            </div>
          ) : (
            <div key={screen.key} className={`${s.screen} ${s.fade}`}>
              {screen.division ? <DivisionScreen data={data} division={screen.division} now={now} /> : <CourtsScreen data={data} now={now} />}
            </div>
          )}
        </main>

        <footer className={s.foot}>
          <div className={s.tabs}>
            {screens.length < 2 && <span className={s.footName}>Omaha Lightning Basketball</span>}
            {screens.length > 1 &&
              screens.map((x) => {
                const on = x.key === screen?.key;
                return (
                  <div key={x.key} className={`${s.tab} ${on ? s.tabOn : ""}`}>
                    {x.tab}
                    {on && <i key={step} className={s.bar} style={{ animationDuration: `${seconds}s` }} />}
                  </div>
                );
              })}
          </div>
          <div className={s.phone}>
            <div className={s.phoneText}>
              <b>Scores on your phone</b>
              omahalightningbasketball.com/shootout
            </div>
            <div className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </footer>
      </div>
    </div>
  );
}

function Name({ v, ours }: { v: SideView; ours: boolean }) {
  if (v.open) {
    return (
      <span className={s.open}>
        {v.name}
        {v.leader && <em> · {v.leader} so far</em>}
      </span>
    );
  }
  return <span className={ours ? s.ours : undefined}>{v.name}</span>;
}

function Side({ data, g, which, big }: { data: LiveData; g: HostedGame; which: "home" | "away"; big?: boolean }) {
  const v = sideView(data, g, which);
  const pts = which === "home" ? g.home_score : g.away_score;
  const opp = which === "home" ? g.away_score : g.home_score;
  const ours = !!v.teamId && !!data.teams.find((t) => t.id === v.teamId)?.ours;
  const cls = isFinal(g) ? (pts! > opp! ? s.won : s.lost) : "";
  return (
    <div className={`${big ? s.sideBig : s.side} ${cls}`}>
      <Name v={v} ours={ours} />
      <span className={s.pts}>{pts ?? ""}</span>
    </div>
  );
}

function State({ g, now, minutes }: { g: HostedGame; now: Clock; minutes: number }) {
  const st = gameState(g, now, minutes);
  if (st === "final") return <span className={`${s.pill} ${s.pillFinal}`}>Final</span>;
  if (st === "now") return <span className={`${s.pill} ${s.pillNow}`}>Playing now</span>;
  if (st === "waiting") return <span className={`${s.pill} ${s.pillNext}`}>Score coming</span>;
  return <span className={`${s.pill} ${s.pillNext}`}>{whenLabel(g, g.plays_on !== now.date)}</span>;
}

function CourtsScreen({ data, now }: { data: LiveData; now: Clock }) {
  const games = sortGames(data.games);
  const courts = Math.max(data.courts, ...games.map((g) => g.court ?? 0));
  const divName = new Map(data.divisions.map((d) => [d.id, d.code || d.name]));
  if (games.length === 0) return <div className={s.empty}>The schedule will be here soon.</div>;
  return (
    <div className={s.courts} style={{ gridTemplateColumns: `repeat(${Math.min(courts, 4)}, minmax(0, 1fr))` }}>
      {Array.from({ length: courts }, (_, i) => i + 1).map((c) => {
        const here = games.filter((g) => g.court === c);
        const st = (g: HostedGame) => gameState(g, now, data.gameMinutes);
        const current = here.find((g) => st(g) === "now" || st(g) === "waiting") ?? here.find((g) => st(g) === "later");
        const next = current ? here.find((g) => g !== current && st(g) === "later" && here.indexOf(g) > here.indexOf(current)) : undefined;
        const last = [...here].reverse().find((g) => isFinal(g) && g !== current);
        return (
          <section key={c} className={s.court}>
            <div className={s.courtHead}>
              <span className={s.display}>Court {c}</span>
              {current && <span className={s.div}>{current.division_id ? divName.get(current.division_id) : "Crossover"}</span>}
            </div>
            {current ? (
              <div className={s.courtNow}>
                <div className={s.courtState}>
                  <State g={current} now={now} minutes={data.gameMinutes} />
                  {current.label && <span className={s.gameLabel}>{current.label}</span>}
                </div>
                <Side data={data} g={current} which="home" big />
                <Side data={data} g={current} which="away" big />
              </div>
            ) : (
              <div className={s.courtDone}>No more games on this court.</div>
            )}
            <div className={s.courtMore}>
              {next && (
                <div>
                  <span className={s.moreLabel}>Up next · {whenLabel(next, next.plays_on !== now.date)}</span>
                  <span className={s.moreLine}>
                    {sideView(data, next, "home").name} <span className={s.vs}>vs</span> {sideView(data, next, "away").name}
                  </span>
                </div>
              )}
              {last && (
                <div>
                  <span className={s.moreLabel}>Last final</span>
                  <span className={s.moreLine}>
                    {sideView(data, last, "home").name} {last.home_score}, {sideView(data, last, "away").name} {last.away_score}
                  </span>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// The games to show: all of them when they fit, else the last few finals and
// what's coming.
function gameWindow(games: HostedGame[]): HostedGame[] {
  if (games.length <= MAX_GAMES) return games;
  const firstOpen = games.findIndex((g) => !isFinal(g));
  const from = firstOpen < 0 ? games.length - MAX_GAMES : Math.max(0, Math.min(firstOpen - 4, games.length - MAX_GAMES));
  return games.slice(from, from + MAX_GAMES);
}

function DivisionScreen({ data, division, now }: { data: LiveData; division: LiveDivision; now: Clock }) {
  const pools = poolsOf(data.teams, division.id);
  const games = gameWindow(sortGames(data.games.filter((g) => g.division_id === division.id)));
  const team = (id: string) => data.teams.find((t) => t.id === id);
  const showPools = division.format === "pool";
  return (
    <div className={`${s.division} ${showPools ? "" : s.divisionWide}`}>
      {showPools && (
        <div className={s.pools}>
          {pools.map((p) => {
            const st = poolStandings(data.games, data.teams, division.id, p);
            return (
              <section key={p ?? 0} className={s.pool}>
                <h2 className={s.poolHead}>
                  <span className={s.display}>{p == null ? "Standings" : `Pool ${p}`}</span>
                  <span>{st.done ? "Final" : st.left ? `${st.left} ${st.left === 1 ? "game" : "games"} left` : ""}</span>
                </h2>
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
                      const t = team(r.teamId);
                      const d = r.pf - r.pa;
                      return (
                        <tr key={r.teamId}>
                          <td className={s.rank}>{r.tied && st.done ? "T" : i + 1}</td>
                          <td className={t?.ours ? s.ours : undefined}>{t?.name}</td>
                          <td>{r.w}</td>
                          <td>{r.l}</td>
                          <td>{d > 0 ? `+${d}` : d}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
      <div className={s.games}>
        {games.length === 0 && <div className={s.empty}>No games yet.</div>}
        {games.map((g) => (
          <section key={g.id} className={s.game}>
            <div className={s.gameHead}>
              <span>
                {g.label ? <b>{g.label}</b> : `Game ${g.game_no}`}
                {g.court ? ` · Court ${g.court}` : ""}
              </span>
              <State g={g} now={now} minutes={data.gameMinutes} />
            </div>
            <Side data={data} g={g} which="home" />
            <Side data={data} g={g} which="away" />
          </section>
        ))}
      </div>
    </div>
  );
}
