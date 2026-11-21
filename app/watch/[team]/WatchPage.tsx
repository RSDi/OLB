"use client";

// Team film page: every game a team has on film, newest tournament or
// weekend first. Plays in the shared film player, read-only.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FilmPlayer } from "../../portal/film/FilmPlayer";
import { recordFilmPlay } from "../../(site)/_components/WebsiteBeacon";
import { formatTimecode, type FilmMarker } from "../../../lib/film/player-logic";
import {
  formatDay,
  formatWeekday,
  gameResult,
  groupWatchGames,
  seasonRecord,
  gameParts,
  watchGamePath,
  watchPagePath,
  type WatchPart,
  type WatchGame,
  type WatchSection,
} from "../../../lib/film/watch";
import { TeamSwitcher } from "./TeamSwitcher";
import styles from "./watch.module.css";

type Filter = "all" | "events" | "other";

interface Props {
  /** The /watch/<key> segment: the team's address plus its link key. */
  pageKey: string;
  teamLabel: string;
  /** Every team with its film page on, for the team switcher. */
  teams: { pageKey: string; label: string }[];
  games: WatchGame[];
  markers: Record<string, FilmMarker[]>;
  initial: { id: string; t: number } | null;
}

function gameTitle(g: WatchGame): string {
  const opp = g.opponent ?? "Opponent";
  if (g.ourScore != null && g.theirScore != null) return `Lightning ${g.ourScore}, ${opp} ${g.theirScore}`;
  return g.opponent ? `Lightning vs ${g.opponent}` : `Game on ${formatDay(g.gameDate)}`;
}

/** " · 1st half, 2nd half" when a game has more than one video. */
function partsLine(g: WatchGame): string {
  const parts = gameParts(g);
  const links = g.links?.length ?? 0;
  const linkText = links ? ` · ${links} link${links === 1 ? "" : "s"}` : "";
  if (parts.length < 2) return linkText;
  const labels = parts.map((p) => p.label);
  return (labels.length <= 3 ? ` · ${labels.join(", ")}` : ` · ${labels.length} videos`) + linkText;
}

function scoreLabel(g: WatchGame): string | null {
  const r = gameResult(g);
  if (g.ourScore == null || g.theirScore == null) return null;
  return `${r === "w" ? "W" : r === "l" ? "L" : "T"} ${g.ourScore}–${g.theirScore}`;
}

function thumbUrl(g: WatchGame): string | null {
  return g.source.kind === "youtube" ? `https://i.ytimg.com/vi/${encodeURIComponent(g.source.videoId)}/hqdefault.jpg` : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Thumb({ game, onPlay, big }: { game: WatchGame; onPlay: () => void; big?: boolean }) {
  const url = thumbUrl(game);
  const score = scoreLabel(game);
  return (
    <button
      type="button"
      className={`${styles.thumb} ${big ? styles.thumbBig : ""}`}
      onClick={onPlay}
      aria-label={`Watch ${gameTitle(game)}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={styles.thumbImg} loading="lazy" />
      ) : (
        <svg className={styles.court} viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect x="6" y="8" width="148" height="74" rx="1" />
          <line x1="80" y1="8" x2="80" y2="82" />
          <circle cx="80" cy="45" r="10" />
          <rect x="6" y="33" width="26" height="24" />
          <rect x="128" y="33" width="26" height="24" />
          <path d="M6 18 Q48 45 6 72" />
          <path d="M154 18 Q112 45 154 72" />
        </svg>
      )}
      {game.streamed && <span className={styles.streamTag}>Streamed</span>}
      {score && <span className={styles.scoreTag}>{score}</span>}
      <span className={styles.play} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5v15l13-7.5z" />
        </svg>
      </span>
    </button>
  );
}

export function WatchPage({ pageKey, teamLabel, teams, games, markers, initial }: Props) {
  const [playing, setPlaying] = useState<{ id: string; t: number } | null>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const sections = useMemo(() => groupWatchGames(games), [games]);
  const record = useMemo(() => seasonRecord(games), [games]);
  const eventCount = sections.filter((s) => s.kind === "event").length;
  const hasOther = sections.some((s) => s.kind !== "event");
  const latest = sections[0]?.games[sections[0].games.length - 1] ?? null;
  const latestSection = sections[0] ?? null;
  // Every video by id, with the game it belongs to.
  const byPart = useMemo(() => {
    const map = new Map<string, { game: WatchGame; part: WatchPart }>();
    for (const g of games) for (const part of gameParts(g)) map.set(part.id, { game: g, part });
    return map;
  }, [games]);
  const found = playing ? byPart.get(playing.id) ?? null : null;
  const current = found?.game ?? null;
  const currentPart = found?.part ?? null;
  const currentParts = current ? gameParts(current) : [];
  // Jump-to points across a game's videos, in play order.
  const gameMarkers = (g: WatchGame) => gameParts(g).flatMap((p) => markers[p.id] ?? []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2000);
    return () => clearTimeout(t);
  }, [note]);

  function open(g: WatchGame, t = 0, partId = gameParts(g)[0].id) {
    setPlaying({ id: partId, t });
    window.history.replaceState(null, "", watchGamePath(pageKey, partId));
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function close() {
    setPlaying(null);
    window.history.replaceState(null, "", watchPagePath(pageKey));
  }

  async function copyPage() {
    const url = `${window.location.origin}${watchPagePath(pageKey)}`;
    setNote((await copyText(url)) ? "Team film link copied." : url);
  }

  const term = query.trim().toLowerCase();
  const shown: WatchSection[] = sections
    .filter((s) => filter === "all" || (filter === "events" ? s.kind === "event" : s.kind !== "event"))
    .map((s) => ({
      ...s,
      games: term ? s.games.filter((g) => (g.opponent ?? "").toLowerCase().includes(term)) : s.games,
    }))
    .filter((s) => s.games.length > 0);

  const sectionOf = (g: WatchGame) => sections.find((s) => s.games.some((x) => x.id === g.id)) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Image src="/email/olb-bolt.png" alt="" width={40} height={40} className={styles.bolt} />
          <div className={styles.team}>
            <div className={styles.eyebrow}>Omaha Lightning · Game film</div>
            <TeamSwitcher pageKey={pageKey} teamLabel={teamLabel} teams={teams} />
          </div>
          <button type="button" className={styles.share} onClick={() => void copyPage()}>
            Copy link
          </button>
        </div>
      </header>

      <main className={styles.inner}>
        {games.length === 0 ? (
          <div className={styles.empty}>
            <strong>No games here yet.</strong>
            <span>Film shows up here after a game is uploaded.</span>
          </div>
        ) : (
          <>
            <section className={styles.stats} aria-label="Season summary">
              {record.wins + record.losses > 0 && (
                <div className={styles.stat}>
                  <span>Record</span>
                  <b className={styles.big}>
                    {record.wins}–{record.losses}
                  </b>
                </div>
              )}
              <div className={styles.stat}>
                <span>Games on film</span>
                <b>{games.length}</b>
              </div>
              {eventCount > 0 && (
                <div className={styles.stat}>
                  <span>Tournaments</span>
                  <b>{eventCount}</b>
                </div>
              )}
              {latest && (
                <div className={styles.stat}>
                  <span>Latest game</span>
                  <b>
                    {formatWeekday(latest.gameDate)}, {formatDay(latest.gameDate)}
                  </b>
                </div>
              )}
            </section>

            {current && (
              <div ref={playerRef} className={styles.playerWrap}>
                <div className={styles.playerHead}>
                  <div className={styles.eyebrow}>
                    {sectionOf(current)?.title ?? ""}
                  </div>
                  <h2 className={styles.playerTitle}>{gameTitle(current)}</h2>
                  <div className={styles.meta}>
                    {formatWeekday(current.gameDate)}, {formatDay(current.gameDate)}
                  </div>
                  {currentParts.length > 1 && (
                    <div className={styles.parts} role="group" aria-label="Part of the game">
                      {currentParts.map((part) => (
                        <button
                          key={part.id}
                          type="button"
                          aria-pressed={part.id === currentPart?.id}
                          onClick={() => open(current, 0, part.id)}
                        >
                          {part.label}
                          {(markers[part.id]?.length ?? 0) > 0 && (
                            <span className={styles.partCount}>{markers[part.id].length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {current.links && current.links.length > 0 && (
                    <div className={styles.links} aria-label="More for this game">
                      {current.links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.label}
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {current.streamed && (
                    <p className={styles.streamNote}>
                      <span className={styles.streamDot} aria-hidden="true" />
                      From the livestream. A better recording is on the way and will replace it here.
                    </p>
                  )}
                </div>
                <FilmPlayer
                  key={currentPart!.id}
                  uploadId={currentPart!.id}
                  title={currentPart!.label ? `${gameTitle(current)} · ${currentPart!.label}` : gameTitle(current)}
                  source={
                    currentPart!.source.kind === "youtube"
                      ? { kind: "youtube", videoId: currentPart!.source.videoId }
                      : { kind: "file", url: `${watchPagePath(pageKey)}/play?v=${encodeURIComponent(currentPart!.id)}` }
                  }
                  startAt={playing?.t ?? 0}
                  markers={markers[currentPart!.id] ?? []}
                  canManage={false}
                  onClose={close}
                  onMarkersChange={() => {}}
                  momentPath={(id, t) => watchGamePath(pageKey, id, t)}
                  onFirstPlay={() => recordFilmPlay(current.id)}
                  fileErrorText="This game is still being processed and won't play in this browser yet. Try Safari, or check back in a few hours."
                />
              </div>
            )}

            {!current && latest && latestSection && (
              <section className={styles.featured} aria-label="Latest game">
                <Thumb game={latest} onPlay={() => open(latest)} big />
                <div className={styles.featuredInfo}>
                  <div className={styles.eyebrow}>Latest · {latestSection.title}</div>
                  <h2 className={styles.featuredTitle}>{gameTitle(latest)}</h2>
                  <div className={styles.meta}>
                    {formatWeekday(latest.gameDate)}, {formatDay(latest.gameDate)}
                    {latest.streamed ? " · Streamed" : ""}
                    {partsLine(latest)}
                  </div>
                  {gameMarkers(latest).length > 0 && (
                    <div className={styles.chips}>
                      {gameMarkers(latest).slice(0, 6).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={styles.chip}
                          onClick={() => open(latest, m.at_seconds, m.upload_id)}
                        >
                          <span className={styles.chipTime}>{formatTimecode(m.at_seconds)}</span> {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className={styles.watch} onClick={() => open(latest)}>
                    Watch
                  </button>
                </div>
              </section>
            )}

            <div className={styles.filters}>
              {eventCount > 0 && hasOther && (
                <div className={styles.seg} role="group" aria-label="Show">
                  {(
                    [
                      ["all", "All games"],
                      ["events", "Tournaments"],
                      ["other", "Other games"],
                    ] as [Filter, string][]
                  ).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <input
                id="watch-search"
                className={styles.search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search opponent"
                aria-label="Search opponent"
              />
            </div>

            {shown.length === 0 && <p className={styles.none}>No games match “{query}”.</p>}

            {shown.map((s) => (
              <section key={s.key} className={styles.section} aria-label={s.title}>
                <div className={styles.sectionHead}>
                  <div className={styles.sectionTitle}>
                    {s.kind === "event" && <div className={styles.dates}>{s.dates}</div>}
                    <h3>{s.title}</h3>
                    <div className={styles.meta}>
                      {s.games.length} game{s.games.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {s.wins + s.losses > 0 && (
                    <span className={styles.record}>
                      {s.wins}–{s.losses}
                    </span>
                  )}
                </div>
                <div className={styles.grid}>
                  {s.games.map((g) => {
                    const r = gameResult(g);
                    const count = gameMarkers(g).length;
                    return (
                      <div key={g.id} className={styles.game}>
                        <Thumb game={g} onPlay={() => open(g)} />
                        <div className={styles.gameRow}>
                          {r && <span className={`${styles.wl} ${r === "w" ? styles.win : styles.loss}`}>{r.toUpperCase()}</span>}
                          <span className={styles.opp}>{g.opponent ? `vs ${g.opponent}` : "Game"}</span>
                          {g.ourScore != null && g.theirScore != null && (
                            <span className={styles.score}>
                              {g.ourScore}–{g.theirScore}
                            </span>
                          )}
                        </div>
                        <div className={styles.meta}>
                          {formatWeekday(g.gameDate)}, {formatDay(g.gameDate)}
                          {g.streamed ? " · Streamed" : ""}
                          {partsLine(g)}
                          {count > 0 ? ` · ${count} jump-to point${count === 1 ? "" : "s"}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
        <footer className={styles.footer}>Film is shared with this team&apos;s families. Please don&apos;t repost it.</footer>
      </main>
      {note && (
        <div className={styles.toast} role="status">
          {note}
        </div>
      )}
    </div>
  );
}
