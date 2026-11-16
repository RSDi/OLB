import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { canEditStats, loadSeasonTeams, loadTeamSeason, playerNames } from "../../../lib/stats/data";
import { fmtAvg, fmtPct, seasonByPlayer } from "../../../lib/stats/season";
import { fmtGameDate, gameLabel, resultText, type StatsGame } from "../../../lib/stats/types";
import { KpiCard } from "../../components/ui";
import { NoStatsAccess } from "./NoStatsAccess";
import s from "./stats.module.css";

export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/stats");
  if (!(await canEditStats(viewer))) return <NoStatsAccess />;

  const { team } = await searchParams;
  const teams = await loadSeasonTeams();
  const current = teams.find((t) => t.id === team) ?? teams[0];
  if (!current) {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>No teams this season yet</div>
        <p className={s.muted}>Teams come from the Directory.</p>
      </div>
    );
  }

  const { games, lines } = await loadTeamSeason(current.id);
  const season = seasonByPlayer(lines);
  const names = await playerNames(season.map((p) => p.player_id));
  const saved = games.filter((g) => g.status === "saved");
  const drafts = games.filter((g) => g.status === "draft");
  const perDay = countPerDay(games);

  const teamPoints = saved.reduce((sum, g) => sum + (g.our_score ?? 0), 0);
  const played = lines.filter((l) => l.played);
  const teamReb = played.reduce((sum, l) => sum + l.rebounds, 0);
  const teamFtm = played.reduce((sum, l) => sum + l.ftm, 0);
  const teamFta = played.reduce((sum, l) => sum + l.fta, 0);
  const scored = saved.filter((g) => g.our_score != null && g.their_score != null);
  const wins = scored.filter((g) => g.our_score! > g.their_score!).length;
  const losses = scored.filter((g) => g.our_score! < g.their_score!).length;
  const upload = `/portal/stats/upload?team=${current.id}`;

  return (
    <div className={s.page}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <nav className={s.tabs} aria-label="Teams">
          {teams.map((t) => (
            <Link key={t.id} href={`/portal/stats?team=${t.id}`} className={`${s.tab} ${t.id === current.id ? s.tabOn : ""}`} aria-current={t.id === current.id ? "page" : undefined}>
              {t.name}
            </Link>
          ))}
        </nav>
        <Link href={upload} className={`${s.btn} ${s.btnAccent}`} data-tour="stats-upload">
          Upload scorebooks
        </Link>
      </div>

      {drafts.length > 0 && (
        <section className={`rsd-card ${s.card}`}>
          <h2 className={s.h2}>To check</h2>
          {drafts.map((g) => (
            <Link key={g.id} href={`/portal/stats/games/${g.id}`} className={s.gameRow}>
              <span>
                {fmtGameDate(g.game_date)} · {gameLabel(g, perDay.get(g.game_date) ?? 1)}
              </span>
              <span className={s.badge}>Check and save</span>
            </Link>
          ))}
        </section>
      )}

      {saved.length === 0 ? (
        <section className={`rsd-card ${s.card}`} style={{ alignItems: "center", textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No games saved for {current.name} yet</div>
          <p className={s.muted} style={{ maxWidth: 420 }}>
            Take a photo of our page of the scorebook after each game and upload it. We read the marks, you check them, and the season adds up here.
          </p>
          <Link href={upload} className={`${s.btn} ${s.btnAccent}`}>
            Upload scorebooks
          </Link>
        </section>
      ) : (
        <>
          <div className={s.kpis}>
            <KpiCard label="Games" value={saved.length} sub={scored.length ? `${wins}–${losses}${scored.length < saved.length ? ` (${saved.length - scored.length} without their score)` : ""}` : "Add their scores to see the record"} />
            <KpiCard label="Points a game" value={fmtAvg(teamPoints, saved.length)} sub={season[0] && names.get(season[0].player_id) ? `${firstName(names.get(season[0].player_id)!.name)} leads with ${fmtAvg(season[0].points, season[0].games)}` : undefined} />
            <KpiCard label="Rebounds a game" value={fmtAvg(teamReb, saved.length)} />
            <KpiCard label="Free throws" value={fmtPct(teamFtm, teamFta)} sub={`${teamFtm} of ${teamFta}`} />
          </div>

          <div className={s.row}>
            <section className={`rsd-card ${s.card} ${s.main}`}>
              <h2 className={s.h2}>Season averages</h2>
              <div className={s.scroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.l}>#</th>
                      <th className={s.l}>Player</th>
                      <th>GP</th>
                      <th>PTS</th>
                      <th>REB</th>
                      <th>FG</th>
                      <th>3PT</th>
                      <th>FT%</th>
                      <th>Fouls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {season.map((p) => {
                      const who = names.get(p.player_id);
                      return (
                        <tr key={p.player_id} className={p.games ? undefined : s.notPlayed}>
                          <td className={s.l}>{who?.jersey ?? ""}</td>
                          <td className={s.l}>
                            <Link className={s.link} href={`/portal/stats/players/${p.player_id}`}>
                              {who?.name || "Player"}
                            </Link>
                          </td>
                          <td>{p.games}</td>
                          <td>
                            <b>{fmtAvg(p.points, p.games)}</b>
                          </td>
                          <td>{fmtAvg(p.rebounds, p.games)}</td>
                          <td>{fmtAvg(p.fg, p.games)}</td>
                          <td>{fmtAvg(p.fg3, p.games)}</td>
                          <td>{fmtPct(p.ftm, p.fta)}</td>
                          <td>{fmtAvg(p.fouls, p.games)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={s.muted}>Per game. FG counts every basket, 2s and 3s.</p>
            </section>

            <aside className={s.side}>
              <section className={`rsd-card ${s.card}`}>
                <h2 className={s.h2}>Games</h2>
                <div>
                  {saved.map((g) => (
                    <Link key={g.id} href={`/portal/stats/games/${g.id}`} className={s.gameRow}>
                      <span>
                        {fmtGameDate(g.game_date)} · {gameLabel(g, perDay.get(g.game_date) ?? 1)}
                      </span>
                      <b>{resultText(g)}</b>
                    </Link>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function countPerDay(games: StatsGame[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of games) m.set(g.game_date, (m.get(g.game_date) ?? 0) + 1);
  return m;
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}
