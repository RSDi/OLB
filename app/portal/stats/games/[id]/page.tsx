import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { canEditStats, loadGame } from "../../../../../lib/stats/data";
import { PERIODS, PERIOD_LABEL, markTotals, periodPoints } from "../../../../../lib/stats/marks";
import { fmtPct } from "../../../../../lib/stats/season";
import { fmtGameDate, gameLabel, resultText } from "../../../../../lib/stats/types";
import { NoStatsAccess } from "../../NoStatsAccess";
import { GameCheck } from "./GameCheck";
import s from "../../stats.module.css";

export const dynamic = "force-dynamic";

export default async function StatsGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/stats");
  if (!(await canEditStats(viewer))) return <NoStatsAccess />;
  const { id } = await params;
  const { edit } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await loadGame(id);
  if (!view) notFound();
  const { game, lines, books, teamName, filmId, event, sameDay } = view;
  const back = `/portal/stats${game.team_id ? `?team=${game.team_id}` : ""}`;

  if (game.status === "draft" || edit === "1") {
    return (
      <div className={s.page}>
        <Link href={back} className={s.muted}>
          ← Stats{teamName ? ` · ${teamName}` : ""}
        </Link>
        <GameCheck view={view} />
      </div>
    );
  }

  const played = lines.filter((l) => l.played).sort((a, b) => b.points - a.points || a.sort_order - b.sort_order);
  const notPlayed = lines.filter((l) => !l.played);
  const nameOf = (l: (typeof lines)[number]) => view.roster.find((p) => p.id === l.player_id)?.name || l.book_name || `#${l.jersey}`;
  const hasOt = played.some((l) => l.ot);
  const periods = PERIODS.filter((p) => p !== "ot" || hasOt);
  const team = played.reduce(
    (t, l) => ({ pts: t.pts + l.points, fg: t.fg + l.fg2 + l.fg3, fg3: t.fg3 + l.fg3, ftm: t.ftm + l.ftm, fta: t.fta + l.fta, reb: t.reb + l.rebounds, pf: t.pf + l.fouls }),
    { pts: 0, fg: 0, fg3: 0, ftm: 0, fta: 0, reb: 0, pf: 0 },
  );
  const regulation = PERIODS.filter((p) => p !== "ot").reduce((sum, p) => sum + periodPoints(played, p), 0);
  const photo = books.find((b) => b.photo_url)?.photo_url;
  const others = sameDay.filter((g) => g.id !== game.id);

  return (
    <div className={s.page}>
      <Link href={back} className={s.muted}>
        ← Stats{teamName ? ` · ${teamName}` : ""}
      </Link>

      <header className={s.hero}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className={s.heroSub}>
            {fmtGameDate(game.game_date, true)}
            {sameDay.length > 1 ? ` · game ${game.game_no} of ${sameDay.length}` : ""}
            {event ? (
              <>
                {" · "}
                <Link href="/portal/schedule" className={s.heroLink}>
                  {event}
                </Link>
              </>
            ) : null}
          </span>
          <h1 className={s.heroTitle}>
            {teamName || "Lightning"} {game.opponent ? `vs ${game.opponent}` : ""}
          </h1>
          {hasOt && <span className={s.heroSub}>Overtime · {regulation} after four quarters</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className={`${s.heroScore} ${s.heroOurs}`}>{game.our_score ?? team.pts}</span>
          <span className={s.heroScore} style={{ opacity: 0.5, fontSize: 36 }}>
            –
          </span>
          <span className={s.heroScore}>{game.their_score ?? "?"}</span>
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {filmId && (
          <Link href={`/portal/film?v=${filmId}`} className={s.btn}>
            Watch film
          </Link>
        )}
        {photo && (
          <a href={photo} target="_blank" rel="noreferrer" className={s.btn}>
            Scorebook photo
          </a>
        )}
        <Link href={`/portal/stats/games/${game.id}?edit=1`} className={s.btn}>
          Edit stats
        </Link>
      </div>

      <div className={s.row}>
        <div className={s.main} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className={`rsd-card ${s.card}`}>
            <h2 className={s.h2}>Box score</h2>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.l}>#</th>
                    <th className={s.l}>Player</th>
                    <th>PTS</th>
                    <th>FG</th>
                    <th>3PT</th>
                    <th>FT</th>
                    <th>REB</th>
                    <th>Fouls</th>
                  </tr>
                </thead>
                <tbody>
                  {played.map((l) => (
                    <tr key={l.id}>
                      <td className={s.l}>{l.jersey}</td>
                      <td className={s.l}>
                        {l.player_id ? (
                          <Link className={s.link} href={`/portal/stats/players/${l.player_id}`}>
                            {nameOf(l)}
                          </Link>
                        ) : (
                          nameOf(l)
                        )}
                      </td>
                      <td>
                        <b>{l.points}</b>
                      </td>
                      <td>{l.fg2 + l.fg3}</td>
                      <td>{l.fg3}</td>
                      <td>
                        {l.ftm}–{l.fta}
                      </td>
                      <td>{l.rebounds}</td>
                      <td style={l.fouls >= 5 ? { color: "var(--gw-error)", fontWeight: 700 } : undefined}>{l.fouls}</td>
                    </tr>
                  ))}
                  <tr className={s.total}>
                    <td className={s.l} colSpan={2}>
                      Team
                    </td>
                    <td>{team.pts}</td>
                    <td>{team.fg}</td>
                    <td>{team.fg3}</td>
                    <td>
                      {team.ftm}–{team.fta} <span className={s.dim}>{fmtPct(team.ftm, team.fta)}</span>
                    </td>
                    <td>{team.reb}</td>
                    <td>{team.pf}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {notPlayed.length > 0 && <p className={s.muted}>Didn&apos;t play: {notPlayed.map(nameOf).join(", ")}</p>}
          </section>

          <section className={`rsd-card ${s.card}`}>
            <h2 className={s.h2}>Who scored when</h2>
            <p className={s.muted}>Points in each quarter, straight from the book.</p>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.l}>Player</th>
                    {periods.map((p) => (
                      <th key={p}>{PERIOD_LABEL[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {played
                    .filter((l) => l.points > 0)
                    .map((l) => (
                      <tr key={l.id}>
                        <td className={s.l}>{nameOf(l)}</td>
                        {periods.map((p) => {
                          const pts = markTotals(l[p]).points;
                          return (
                            <td key={p} className={pts ? undefined : s.dim}>
                              {pts}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  <tr className={s.total}>
                    <td className={s.l}>Team</td>
                    {periods.map((p) => (
                      <td key={p}>{periodPoints(played, p)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className={s.side}>
          {others.length > 0 && (
            <section className={`rsd-card ${s.card}`}>
              <h2 className={s.h2}>Same day</h2>
              <div>
                {others.map((g) => (
                  <Link key={g.id} href={`/portal/stats/games/${g.id}`} className={s.gameRow}>
                    <span>{gameLabel(g, sameDay.length)}</span>
                    <b>{g.status === "draft" ? "To check" : resultText(g)}</b>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!game.their_score && game.their_score !== 0 && (
            <section className={`rsd-card ${s.card}`}>
              <h2 className={s.h2}>Their score</h2>
              <p className={s.muted}>It isn&apos;t on our page of the book. Add it with Edit stats and the game counts in the team&apos;s record.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
