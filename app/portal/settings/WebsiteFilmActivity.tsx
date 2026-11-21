"use client";

// Settings → Website Activity → Team film: the team film pages (/watch),
// kept out of the club website's numbers. People, page views and plays per
// team, and the most-played games. Reads lib/activity/website-queries.ts.

import { KpiCard } from "../../components/ui";
import type { FilmActivity } from "../../../lib/activity/website-queries";
import { relTime } from "../../../lib/activity/paths";
import { sitePageLabel } from "../../../lib/activity/website-rules";

const muted = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 } as const;

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      <div style={muted}>{sub}</div>
    </div>
  );
}

// "/watch/hs-jv" → "HS JV"; "/watch" → "Team list (no team picked)".
export function filmTeamName(teamPage: string): string {
  if (teamPage === "/watch") return "Team list (no team picked)";
  return sitePageLabel(teamPage).replace(/^Team film · /, "");
}

export function TeamFilm({ film, now }: { film: FilmActivity; now: number }) {
  const t = film.totals;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rsd-gap)" }} data-tour="website-activity-film">
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Team film</h2>
        <div style={muted}>The team film pages families open to watch games, last 30 days. Not counted in the club website numbers above.</div>
      </div>
      {film.error ? (
        <div role="alert" style={{ ...muted, color: "var(--gw-error)" }}>
          {film.error}
        </div>
      ) : (
        <>
          <div className="rsd-kpi-grid">
            <KpiCard label="People" value={t.visitors} sub="Different phones and computers" accent />
            <KpiCard label="Plays" value={t.plays} sub={`${t.players} ${t.players === 1 ? "person" : "people"} pressed play`} />
            <KpiCard label="Page views" value={t.views} sub={`${t.visits} visits`} />
            <KpiCard label="On a phone" value={t.visitors ? `${Math.round((t.phones / t.visitors) * 100)}%` : "—"} sub="Of people" />
          </div>
          <div style={{ display: "flex", gap: "var(--rsd-gap)", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="rsd-card" style={{ flex: "1 1 340px", minWidth: 0 }}>
              <CardHead title="By team" sub="People who opened each team's page, and how many games they played" />
              {film.teams.length === 0 ? (
                <div style={muted}>Nobody has opened a team film page in the last 30 days.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="rsd-tbl">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th className="num">People</th>
                        <th className="num">Views</th>
                        <th className="num">Plays</th>
                      </tr>
                    </thead>
                    <tbody>
                      {film.teams.map((row) => (
                        <tr key={row.teamPage}>
                          <td>{filmTeamName(row.teamPage)}</td>
                          <td className="num">{row.visitors}</td>
                          <td className="num">{row.views}</td>
                          <td className="num" title={`${row.players} ${row.players === 1 ? "person" : "people"} pressed play`}>
                            {row.plays}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rsd-card" style={{ flex: "1 1 340px", minWidth: 0 }}>
              <CardHead title="Most played games" sub="A play is someone starting a game. Each person counts once under People." />
              {film.games.length === 0 ? (
                <div style={muted}>No games played in the last 30 days.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="rsd-tbl">
                    <thead>
                      <tr>
                        <th>Game</th>
                        <th className="num">Plays</th>
                        <th className="num">People</th>
                        <th>Last played</th>
                      </tr>
                    </thead>
                    <tbody>
                      {film.games.map((g) => (
                        <tr key={`${g.teamPage} ${g.uploadId}`}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{g.label || "A game"}</div>
                            <div style={muted}>{filmTeamName(g.teamPage)}</div>
                          </td>
                          <td className="num">{g.plays}</td>
                          <td className="num">{g.visitors}</td>
                          <td>{relTime(g.lastAt, now)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
