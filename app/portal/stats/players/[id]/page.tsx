import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { canEditStats, loadPlayer } from "../../../../../lib/stats/data";
import { PERIODS, PERIOD_LABEL } from "../../../../../lib/stats/marks";
import { addLine, emptySeason, fmtAvg, fmtPct, ftByHalf } from "../../../../../lib/stats/season";
import { fmtGameDate, resultText } from "../../../../../lib/stats/types";
import { KpiCard } from "../../../../components/ui";
import { NoStatsAccess } from "../../NoStatsAccess";
import s from "../../stats.module.css";

export const dynamic = "force-dynamic";

export default async function StatsPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/stats");
  if (!(await canEditStats(viewer))) return <NoStatsAccess />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await loadPlayer(id);
  if (!view) notFound();
  const { player, teamName, games, lines, teamNames } = view;

  const lineByGame = new Map(lines.map((l) => [l.game_id, l]));
  const current = games.filter((g) => g.team_id === player.team_id);
  const currentLines = current.map((g) => lineByGame.get(g.id)).filter((l): l is NonNullable<typeof l> => !!l);
  const season = currentLines.reduce(addLine, emptySeason(player.id));
  const playedLines = currentLines.filter((l) => l.played);
  const halves = ftByHalf(playedLines);
  const hasOt = season.byPeriod.ot > 0;
  const periods = PERIODS.filter((p) => p !== "ot" || hasOt);
  const maxQ = Math.max(1, ...periods.map((p) => season.byPeriod[p]));

  // Earlier teams (each Directory team belongs to one season).
  const byTeam = new Map<string, ReturnType<typeof emptySeason>>();
  for (const g of games) {
    const l = lineByGame.get(g.id);
    if (!l || !g.team_id) continue;
    byTeam.set(g.team_id, addLine(byTeam.get(g.team_id) ?? emptySeason(player.id), l));
  }

  return (
    <div className={s.page}>
      <Link href={`/portal/stats${player.team_id ? `?team=${player.team_id}` : ""}`} className={s.muted}>
        ← Stats{teamName ? ` · ${teamName}` : ""}
      </Link>

      <header style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          aria-hidden="true"
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--rsd-accent-fill, #ffd100)",
            color: "var(--rsd-accent-fill-on, #0b0b0c)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--rsd-display)",
            fontWeight: 700,
            fontSize: 34,
          }}
        >
          {player.jersey || "–"}
        </div>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--rsd-display)", fontSize: 38, lineHeight: 1, textTransform: "uppercase", color: "var(--gw-fg)" }}>{player.name}</h1>
          <p className={s.muted}>
            {teamName}
            {player.jersey ? ` · #${player.jersey}` : ""} · <Link className={s.link} href={`/portal/directory/players/${player.id}`}>Directory</Link>
          </p>
        </div>
      </header>

      {season.games === 0 ? (
        <section className={`rsd-card ${s.card}`} style={{ textAlign: "center", padding: "36px 24px" }}>
          <div style={{ fontWeight: 700 }}>No saved games for {teamName || "this team"} yet</div>
        </section>
      ) : (
        <>
          <div className={s.kpis}>
            <KpiCard label="Points" value={fmtAvg(season.points, season.games)} sub={`a game · ${season.points} in ${season.games}`} />
            <KpiCard label="Rebounds" value={fmtAvg(season.rebounds, season.games)} sub={`a game · ${season.rebounds} total`} />
            <KpiCard label="3-pointers" value={season.fg3} sub={`${fmtAvg(season.fg, season.games)} baskets a game`} />
            <KpiCard label="Free throws" value={fmtPct(season.ftm, season.fta)} sub={`${season.ftm} of ${season.fta} · ${fmtAvg(season.fouls, season.games)} fouls a game`} />
          </div>

          <div className={s.row}>
            <section className={`rsd-card ${s.card} ${s.main}`}>
              <h2 className={s.h2}>Points by quarter</h2>
              <p className={s.muted}>This season, from the book&apos;s quarter boxes.</p>
              <div className={s.bars} role="img" aria-label={`Points by quarter: ${periods.map((p) => `${PERIOD_LABEL[p]} ${season.byPeriod[p]}`).join(", ")}`}>
                {periods.map((p) => (
                  <div key={p} className={s.bar}>
                    <b>{season.byPeriod[p]}</b>
                    <i style={{ height: `${(season.byPeriod[p] / maxQ) * 120}px` }} />
                    <span>{PERIOD_LABEL[p]}</span>
                  </div>
                ))}
              </div>
            </section>
            <aside className={s.side}>
              <section className={`rsd-card ${s.card}`}>
                <h2 className={s.h2}>Free throws by half</h2>
                {[
                  { label: "1st half", v: halves.first },
                  { label: hasOt ? "2nd half and OT" : "2nd half", v: halves.second },
                ].map((h) => (
                  <div key={h.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>{h.label}</span>
                      <b>{h.v.tries ? `${h.v.made} of ${h.v.tries}` : "none"}</b>
                    </div>
                    <div className={s.meter}>
                      <i style={{ width: `${h.v.tries ? (h.v.made / h.v.tries) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </>
      )}

      <div className={s.row}>
        <section className={`rsd-card ${s.card} ${s.main}`}>
          <h2 className={s.h2}>Game by game</h2>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.l}>Date</th>
                  <th className={s.l}>Game</th>
                  <th className={s.l}>Score</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>FG</th>
                  <th>3PT</th>
                  <th>FT</th>
                  <th>Fouls</th>
                </tr>
              </thead>
              <tbody>
                {current.map((g) => {
                  const l = lineByGame.get(g.id);
                  if (!l) return null;
                  return (
                    <tr key={g.id} className={l.played ? undefined : s.notPlayed}>
                      <td className={s.l}>{fmtGameDate(g.game_date)}</td>
                      <td className={s.l}>
                        <Link className={s.link} href={`/portal/stats/games/${g.id}`}>
                          {g.opponent ? `vs ${g.opponent}` : `Game ${g.game_no}`}
                        </Link>
                      </td>
                      <td className={s.l}>{resultText(g)}</td>
                      {l.played ? (
                        <>
                          <td>
                            <b>{l.points}</b>
                          </td>
                          <td>{l.rebounds}</td>
                          <td>{l.fg2 + l.fg3}</td>
                          <td>{l.fg3}</td>
                          <td>
                            {l.ftm}–{l.fta}
                          </td>
                          <td>{l.fouls}</td>
                        </>
                      ) : (
                        <td colSpan={6}>Didn&apos;t play</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className={s.side}>
          <section className={`rsd-card ${s.card}`}>
            <h2 className={s.h2}>Through the years</h2>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.l}>Team</th>
                  <th>GP</th>
                  <th>PTS</th>
                  <th>REB</th>
                </tr>
              </thead>
              <tbody>
                {[...byTeam.entries()].map(([teamId, t]) => (
                  <tr key={teamId}>
                    <td className={s.l}>{teamNames.get(teamId) ?? "Team"}</td>
                    <td>{t.games}</td>
                    <td>{fmtAvg(t.points, t.games)}</td>
                    <td>{fmtAvg(t.rebounds, t.games)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={s.muted}>Each team counts the games that had a book uploaded.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
