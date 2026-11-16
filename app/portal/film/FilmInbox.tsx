"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Pill } from "../../components/ui";
import { Icons } from "../../components/icons";
import {
  deleteFilmUpload,
  signedFilmDownload,
  updateFilmGameFields,
  updateFilmPlaylistOverride,
} from "../../../lib/film/admin-actions";
import {
  approveFilmSlackDraft,
  discardPendingFilmSlackDraft,
  editFilmSlackDraft,
  restoreDiscardedFilmSlackDraft,
} from "../../../lib/film/slack-actions";
import { filmLineupKey, type FilmRosterPlayer } from "../../../lib/film/lineup-logic";
import { refreshFilmYoutubeStatus, retryFilmPlaylist, retryFilmYoutube } from "../../../lib/film/youtube-actions";
import {
  formatFilmInboxHeading,
  missingFilmGameLabels,
  OPPONENT_MAX,
} from "../../../lib/film/game-meta";
import {
  groupUploadsByTeamAndGame,
  youtubeLiveStatusLine,
  youtubePlaylistUrl,
} from "../../../lib/film/youtube-meta";
import { filmFlowView } from "../../../lib/film/flow";
import type { FilmSlackDraftView, FilmUpload, YoutubeEvent, YoutubeJob, YoutubePlaylistStatus } from "../../../lib/film/types";
import { youtubeDisplayStatus } from "../../../lib/film/youtube-progress";
import { YoutubeTransfer } from "./YoutubeTransfer";
import { FilmPlayer } from "./FilmPlayer";
import type { FilmMarker } from "../../../lib/film/player-logic";
import styles from "./inbox.module.css";

interface Props {
  uploads: FilmUpload[];
  jobs: Record<string, YoutubeJob>;
  events: Record<string, YoutubeEvent[]>;
  slackDrafts: FilmSlackDraftView[];
  discardedDrafts: FilmSlackDraftView[];
  canManage: boolean;
  canApproveSlack: boolean;
  slackConfigured: boolean;
  loadError: string | null;
  parentLinks: { slug: string; label: string }[];
  teamPlaylists: Record<string, string>;
  rosters: Record<string, FilmRosterPlayer[]>;
  lineups: Record<string, string[]>;
  markers: Record<string, FilmMarker[]>;
  /** From a shared link: open this video at this second. */
  initialMoment: { id: string; t: number } | null;
}

type Playing = {
  id: string;
  title: string;
  startAt: number;
  source: { kind: "youtube"; videoId: string } | { kind: "file"; url: string };
};

function onYoutubeNow(u: FilmUpload): boolean {
  return u.youtube_status === "done" && !!u.youtube_video_id;
}

function playerTitle(u: FilmUpload): string {
  const game = formatFilmInboxHeading({
    gameDate: u.game_date,
    opponent: u.opponent,
    ourScore: u.our_score,
    theirScore: u.their_score,
  });
  return `${game} · ${u.filename}`;
}

type Filter = "all" | "attention";

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit", timeZone: "America/Chicago" });
}


function playlistLabel(
  status: YoutubePlaylistStatus | null,
  playlistId: string | null,
  youtubeDone: boolean
): { text: string; href: string | null; failed: boolean } | null {
  const href = playlistId ? youtubePlaylistUrl(playlistId) : null;
  if (status === "done") return { text: "In playlist", href, failed: false };
  if (status === "queued") return { text: "Adding to playlist", href, failed: false };
  if (status === "failed") return { text: "Playlist failed", href: null, failed: true };
  if (youtubeDone && playlistId) return { text: "Not in playlist yet", href, failed: false };
  return null;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 3);
}

type GamePatch = Pick<FilmUpload, "game_date" | "opponent" | "our_score" | "their_score" | "youtube_playlist_id">;

export function FilmInbox({
  uploads,
  jobs,
  events,
  slackDrafts,
  discardedDrafts,
  canManage,
  canApproveSlack,
  slackConfigured,
  loadError,
  parentLinks,
  teamPlaylists,
  rosters,
  lineups,
  markers: initialMarkers,
  initialMoment,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(() => {
    const row = initialMoment ? uploads.find((u) => u.id === initialMoment.id) : null;
    if (!row || !initialMoment || !onYoutubeNow(row)) return null;
    return {
      id: row.id,
      title: playerTitle(row),
      startAt: initialMoment.t,
      source: { kind: "youtube", videoId: row.youtube_video_id! },
    };
  });
  const [markers, setMarkers] = useState<Record<string, FilmMarker[]>>(initialMarkers);
  const [patches, setPatches] = useState<Record<string, GamePatch>>({});
  const [, startTransition] = useTransition();

  const live = useMemo(
    () =>
      uploads.some((u) => {
        const job = jobs[u.id];
        const display = youtubeDisplayStatus({
          youtubeStatus: u.youtube_status,
          lastProgressAt: job?.last_progress_at,
          youtubeUpdatedAt: u.youtube_updated_at,
        });
        return display === "queued" || display === "uploading" || display === "stalled";
      }),
    [uploads, jobs]
  );

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => startTransition(() => router.refresh()), 15_000);
    return () => clearInterval(t);
  }, [live, router, startTransition]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of parentLinks) map[t.slug] = t.label;
    return map;
  }, [parentLinks]);

  const rows = useMemo(
    () => uploads.map((u) => (patches[u.id] ? { ...u, ...patches[u.id] } : u)),
    [uploads, patches]
  );

  const attention = useMemo(() => {
    const ids = new Set<string>();
    for (const u of rows) {
      const job = jobs[u.id];
      const display = youtubeDisplayStatus({
        youtubeStatus: u.youtube_status,
        lastProgressAt: job?.last_progress_at,
        youtubeUpdatedAt: u.youtube_updated_at,
      });
      const view = filmFlowView({
        row: u,
        display,
        playlistId: (u.youtube_playlist_id || teamPlaylists[u.team] || "").trim() || null,
        missingDetails:
          missingFilmGameLabels({
            gameDate: u.game_date,
            opponent: u.opponent,
            ourScore: u.our_score,
            theirScore: u.their_score,
          }).length > 0,
      });
      if (view.needsAttention) ids.add(u.id);
    }
    return ids;
  }, [rows, jobs, teamPlaylists]);

  const shown = useMemo(() => {
    let list = filter === "all" ? rows : rows.filter((u) => attention.has(u.id));
    if (teamFilter !== "all") list = list.filter((u) => u.team === teamFilter);
    return list;
  }, [filter, teamFilter, rows, attention]);

  const grouped = useMemo(() => groupUploadsByTeamAndGame(shown, labels), [shown, labels]);

  const teams = useMemo(() => {
    const seen = new Map<string, { label: string; count: number }>();
    for (const t of parentLinks) seen.set(t.slug, { label: t.label, count: 0 });
    for (const u of rows) {
      const entry = seen.get(u.team) ?? { label: labels[u.team] || u.team, count: 0 };
      entry.count += 1;
      seen.set(u.team, entry);
    }
    return [...seen.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [rows, labels, parentLinks]);

  function pickTeam(slug: string) {
    setTeamFilter(slug);
  }

  async function run(id: string, fn: (id: string) => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    const result = await fn(id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function runYoutubeStatusRefresh() {
    setStatusBusy(true);
    setError(null);
    setStatusNote(null);
    const result = await refreshFilmYoutubeStatus();
    setStatusBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const n = result.updated ?? 0;
    setStatusNote(
      n === 0
        ? "YouTube status is up to date."
        : `Updated ${n} video${n === 1 ? "" : "s"} from YouTube.`
    );
    startTransition(() => router.refresh());
  }

  async function download(id: string) {
    setBusy(id);
    setError(null);
    const result = await signedFilmDownload(id);
    setBusy(null);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't make a download link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function play(row: FilmUpload, opts?: { original?: boolean; startAt?: number }) {
    setError(null);
    const startAt = opts?.startAt ?? 0;
    if (onYoutubeNow(row) && !opts?.original) {
      setPlaying({ id: row.id, title: playerTitle(row), startAt, source: { kind: "youtube", videoId: row.youtube_video_id! } });
      return;
    }
    setBusy(row.id);
    const result = await signedFilmDownload(row.id);
    setBusy(null);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't make a play link.");
      return;
    }
    setPlaying({ id: row.id, title: playerTitle(row), startAt, source: { kind: "file", url: result.url } });
  }

  // A shared link to a video not on YouTube yet needs a signed file URL.
  useEffect(() => {
    if (!initialMoment || playing) return;
    const row = uploads.find((u) => u.id === initialMoment.id);
    if (!row || onYoutubeNow(row) || row.file_deleted_at) return;
    let cancelled = false;
    void signedFilmDownload(row.id).then((result) => {
      if (cancelled || !result.url) return;
      setPlaying({ id: row.id, title: playerTitle(row), startAt: initialMoment.t, source: { kind: "file", url: result.url } });
    });
    return () => {
      cancelled = true;
    };
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      {teams.length > 0 && (
        <div role="tablist" aria-label="Team" className={styles.teamTabs} data-tour="film-team-filter">
          {[["all", { label: "Every team", count: rows.length }] as const, ...teams].map(([slug, t]) => (
            <button
              key={slug}
              type="button"
              role="tab"
              aria-selected={teamFilter === slug}
              className={styles.teamTab}
              onClick={() => pickTeam(slug)}
            >
              {t.label} <span className={styles.teamCount}>{t.count}</span>
            </button>
          ))}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Videos families upload from their phones, listed by team and game. Each one goes{" "}
        <strong>Uploaded → On YouTube → Ready → In playlist</strong>{" "}
        on its own; the line on each card shows where it is. You only step in when a card says{" "}
        <strong>Needs attention</strong>. We keep the original file until YouTube has had it for 30
        days, then delete it — the video stays on YouTube.{" "}
        <strong>Play</strong> watches a file here before it&apos;s on YouTube.{" "}
        <strong>Refresh YouTube status</strong> reads privacy and processing from YouTube.{" "}
        Slack posts wait here for <strong>Approve</strong> — anyone with{" "}
        <strong>Teams &amp; volunteers</strong> can tap it. The board{" "}
        <a href="/portal/film/status" className={styles.statusLink} data-tour="film-status-link">
          Film status
        </a>{" "}
        page lists in-progress, stalled, failed, and done uploads across teams.
      </p>

      {slackDrafts.length > 0 && (
        <section data-tour="film-slack-drafts" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pending Slack posts</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
            Same text as the YouTube description. Sparky posts it only after someone with{" "}
            <strong>Teams &amp; volunteers</strong> (or <strong>Game film (manage)</strong>) taps{" "}
            <strong>Approve</strong>.
          </p>
          {slackDrafts.map((draft) => (
            <SlackDraftCard
              key={draft.id}
              draft={draft}
              canApproveSlack={canApproveSlack}
              slackConfigured={slackConfigured}
              busy={busy === draft.id}
              onRun={(fn) => void run(draft.id, fn)}
            />
          ))}
        </section>
      )}

      {discardedDrafts.length > 0 && (
        <section data-tour="film-slack-discarded" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Discarded Slack posts</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
            Soft-deleted. <strong>Restore</strong> brings one back for 30 days, then it is purged.
          </p>
          {discardedDrafts.map((draft) => (
            <SlackDraftCard
              key={draft.id}
              draft={draft}
              discarded
              canApproveSlack={canApproveSlack}
              slackConfigured={slackConfigured}
              busy={busy === draft.id}
              onRun={(fn) => void run(draft.id, fn)}
            />
          ))}
        </section>
      )}

      {parentLinks.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Family upload pages:{" "}
          {parentLinks.map((t, i) => (
            <span key={t.slug}>
              {i > 0 && ", "}
              <a href={`/t/${t.slug}`} style={{ fontWeight: 700 }}>
                {t.label}
              </a>
            </span>
          ))}
          . Share the team code, not this page.
        </p>
      )}

      {playing && (
        <FilmPlayer
          key={`${playing.id}:${playing.source.kind}`}
          uploadId={playing.id}
          title={playing.title}
          source={playing.source}
          startAt={playing.startAt}
          markers={markers[playing.id] ?? []}
          canManage={canManage}
          onClose={() => setPlaying(null)}
          onMarkersChange={(next) => setMarkers((prev) => ({ ...prev, [playing.id]: next }))}
        />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} data-tour="film-filter">
        {(["all", "attention"] as Filter[]).map((key) => (
          <Pill key={key} size="sm" variant={filter === key ? "dark" : "light"} onClick={() => setFilter(key)}>
            {key === "all" ? "All" : `Needs attention (${attention.size})`}
          </Pill>
        ))}
        <span data-tour="film-youtube-status">
          <Pill
            size="sm"
            onClick={() => void runYoutubeStatusRefresh()}
            disabled={statusBusy}
          >
            {statusBusy ? "Checking YouTube…" : "Refresh YouTube status"}
          </Pill>
        </span>
      </div>

      {(loadError || error) && (
        <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>{loadError || error}</p>
      )}
      {statusNote && (
        <p style={{ margin: 0, color: "var(--gw-fg-muted)", fontWeight: 600, fontSize: 13 }}>{statusNote}</p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Icons.Video width={32} height={32} />}
          title={uploads.length === 0 ? "No film yet" : "Nothing in this view"}
          body={
            uploads.length === 0
              ? "When a family uploads from a team page, it shows up here."
              : filter === "attention"
                ? "Nothing needs you right now."
                : "Nothing for this team yet. Try All, or another team."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {grouped.map((team) => (
            <section key={team.team} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{team.label}</h2>
              {team.games.map((game) => (
                <div key={game.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {formatFilmInboxHeading({
                      gameDate: game.gameDate,
                      opponent: game.opponent,
                      ourScore: game.ourScore,
                      theirScore: game.theirScore,
                    })}
                  </div>
                  {game.uploads.map((row) => (
                    <FilmRow
                      key={row.id}
                      row={row}
                      job={jobs[row.id] ?? null}
                      events={events[row.id] ?? []}
                      teamPlaylistId={teamPlaylists[row.team] ?? null}
                      busy={busy === row.id}
                      playing={playing?.id === row.id}
                      canManage={canManage}
                      roster={row.team_id ? rosters[row.team_id] ?? [] : []}
                      lineupPlayerIds={lineups[filmLineupKey(row.team_id, row.game_date, row.opponent) ?? ""] ?? []}
                      markerCount={markers[row.id]?.length ?? 0}
                      onPlay={() => void play(row)}
                      onPlayOriginal={() => void play(row, { original: true })}
                      onDownload={() => void download(row.id)}
                      onRetryYoutube={() => void run(row.id, retryFilmYoutube)}
                      onRetryPlaylist={() => void run(row.id, retryFilmPlaylist)}
                      onPatched={(patch) => setPatches((prev) => ({ ...prev, [row.id]: patch }))}
                      onDelete={() => {
                        if (confirm(`Delete ${row.filename}? This cannot be undone.`)) {
                          void run(row.id, deleteFilmUpload);
                        }
                      }}
                    />
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilmRow({
  row,
  job,
  events,
  teamPlaylistId,
  busy,
  playing,
  canManage,
  roster,
  lineupPlayerIds,
  markerCount,
  onPlay,
  onPlayOriginal,
  onDownload,
  onRetryYoutube,
  onRetryPlaylist,
  onDelete,
  onPatched,
}: {
  row: FilmUpload;
  job: YoutubeJob | null;
  events: YoutubeEvent[];
  teamPlaylistId: string | null;
  busy: boolean;
  playing: boolean;
  canManage: boolean;
  roster: FilmRosterPlayer[];
  lineupPlayerIds: string[];
  markerCount: number;
  onPlay: () => void;
  onPlayOriginal: () => void;
  onDownload: () => void;
  onRetryYoutube: () => void;
  onRetryPlaylist: () => void;
  onDelete: () => void;
  onPatched: (patch: GamePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const display = youtubeDisplayStatus({
    youtubeStatus: row.youtube_status,
    lastProgressAt: job?.last_progress_at,
    youtubeUpdatedAt: row.youtube_updated_at,
  });
  const live =
    row.youtube_status === "done" && row.youtube_video_id
      ? youtubeLiveStatusLine({
          youtube_privacy: row.youtube_privacy,
          youtube_processing: row.youtube_processing,
          youtube_synced_at: row.youtube_synced_at,
        })
      : null;
  const effectivePlaylist = (row.youtube_playlist_id || teamPlaylistId || "").trim() || null;
  const pl = playlistLabel(
    row.youtube_playlist_status,
    effectivePlaylist,
    row.youtube_status === "done" && !!row.youtube_video_id
  );
  const missing = missingFilmGameLabels({
    gameDate: row.game_date,
    opponent: row.opponent,
    ourScore: row.our_score,
    theirScore: row.their_score,
  });
  const canRetryPlaylist =
    canManage &&
    row.youtube_status === "done" &&
    !!row.youtube_video_id &&
    !!effectivePlaylist &&
    row.youtube_playlist_status !== "done" &&
    row.youtube_playlist_status !== "queued";
  const flow = filmFlowView({ row, display, playlistId: effectivePlaylist, missingDetails: missing.length > 0 });
  const onYoutube = row.youtube_status === "done" && !!row.youtube_video_id;
  const badgeClass =
    flow.badge.tone === "done"
      ? "rsd-chip-success"
      : flow.badge.tone === "problem"
        ? "rsd-chip-error"
        : flow.badge.tone === "active"
          ? "rsd-chip-accent"
          : "rsd-chip-mute";
  return (
    <div
      data-tour="film-row"
      className="rsd-card"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        outline: playing ? "2px solid var(--rsd-accent)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, wordBreak: "break-word" }}>{row.filename}</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
            {row.uploader_name} · {formatBytes(row.size_bytes)} · {formatWhen(row.created_at)}
          </div>
          <ol className={styles.steps} data-tour="film-steps" aria-label="Progress">
            {flow.steps.map((step) => (
              <li key={step.key} className={styles.step} data-state={step.state}>
                <span className={styles.stepDot} aria-hidden="true">
                  {step.state === "done" ? "✓" : step.state === "problem" ? "!" : ""}
                </span>
                {step.label}
                <span className={styles.srOnly}>
                  {step.state === "done" ? " (done)" : step.state === "active" ? " (in progress)" : step.state === "problem" ? " (needs attention)" : " (not yet)"}
                </span>
              </li>
            ))}
          </ol>
          {missing.length > 0 && !editing && (
            <p className={styles.missing}>Missing: {missing.join(", ")}</p>
          )}
          <div data-tour="film-playlist">
            <YoutubeTransfer row={row} job={job} events={events} />
            {pl && (
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: pl.failed ? "var(--gw-error)" : undefined }}>
                {pl.href && !pl.failed ? (
                  <a href={pl.href} target="_blank" rel="noopener noreferrer">
                    {pl.text}
                  </a>
                ) : (
                  pl.text
                )}
                {pl.failed && row.youtube_playlist_error ? ` — ${row.youtube_playlist_error}` : ""}
              </div>
            )}
          </div>
          {live && (
            <div
              data-tour="film-youtube-privacy"
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginTop: 4,
                color:
                  row.youtube_processing === "failed" ||
                  row.youtube_processing === "rejected" ||
                  row.youtube_processing === "missing"
                    ? "var(--gw-error)"
                    : undefined,
              }}
            >
              {live}
              {row.youtube_synced_at ? ` · Checked ${formatWhen(row.youtube_synced_at)}` : ""}
            </div>
          )}
          <p className={styles.originalNote}>{flow.originalNote}</p>
        </div>
        <span className={`rsd-chip ${badgeClass}`} style={{ alignSelf: "flex-start" }} data-tour="film-badge">
          {flow.badge.text}
        </span>
      </div>
      {editing ? (
        <FilmGameEditor
          row={row}
          teamPlaylistId={teamPlaylistId}
          roster={roster}
          lineupPlayerIds={lineupPlayerIds}
          onCancel={() => setEditing(false)}
          onSaved={(patch) => {
            onPatched(patch);
            setEditing(false);
          }}
        />
      ) : (
        <div className={styles.actions}>
          {onYoutube ? (
            <span data-tour="film-play">
              <Pill size="sm" variant="accent" onClick={onPlay}>
                {markerCount > 0 ? `Watch · ${markerCount} marker${markerCount === 1 ? "" : "s"}` : "Watch"}
              </Pill>
            </span>
          ) : !flow.originalGone ? (
            <span data-tour="film-play">
              <Pill size="sm" variant="accent" onClick={onPlay} disabled={busy}>
                Play
              </Pill>
            </span>
          ) : null}
          {canManage && (display === "failed" || display === "stalled" || (!row.youtube_status && !flow.originalGone)) && (
            <span data-tour="film-youtube-retry">
              <Pill size="sm" onClick={onRetryYoutube} disabled={busy}>
                {display === "failed" || display === "stalled" ? "Retry YouTube" : "Send to YouTube"}
              </Pill>
            </span>
          )}
          {canRetryPlaylist && (
            <span data-tour="film-playlist-retry">
              <Pill size="sm" onClick={onRetryPlaylist} disabled={busy}>
                {row.youtube_playlist_status === "failed" ? "Retry playlist" : "Add to playlist"}
              </Pill>
            </span>
          )}
          {canManage && (
            <span data-tour="film-edit">
              <Pill size="sm" onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </Pill>
            </span>
          )}
          <span data-tour="film-more">
            <Pill size="sm" variant="ghost" onClick={() => setMore((v) => !v)}>
              {more ? "Less" : "More"}
            </Pill>
          </span>
          {more && (
            <>
              {onYoutube && !flow.originalGone && (
                <Pill size="sm" onClick={onPlayOriginal} disabled={busy}>
                  Play original
                </Pill>
              )}
              {!flow.originalGone && (
                <span data-tour="film-download">
                  <Pill size="sm" onClick={onDownload} disabled={busy}>
                    Download original
                  </Pill>
                </span>
              )}
              {canManage && (
                <span data-tour="film-delete">
                  <Pill size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
                    Delete
                  </Pill>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FilmGameEditor({
  row,
  teamPlaylistId,
  roster,
  lineupPlayerIds,
  onCancel,
  onSaved,
}: {
  row: FilmUpload;
  teamPlaylistId: string | null;
  roster: FilmRosterPlayer[];
  lineupPlayerIds: string[];
  onCancel: () => void;
  onSaved: (patch: GamePatch) => void;
}) {
  const router = useRouter();
  const [gameDate, setGameDate] = useState(row.game_date ?? "");
  const [opponent, setOpponent] = useState(row.opponent ?? "");
  const [ourScore, setOurScore] = useState(row.our_score == null ? "" : String(row.our_score));
  const [theirScore, setTheirScore] = useState(row.their_score == null ? "" : String(row.their_score));
  const [playlistDraft, setPlaylistDraft] = useState(row.youtube_playlist_id ?? "");
  const [pickedPlayers, setPickedPlayers] = useState<string[]>(lineupPlayerIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function save() {
    setSaving(true);
    setError(null);
    const result = await updateFilmGameFields(row.id, {
      gameDate,
      opponent,
      ourScore,
      theirScore,
      playerIds: pickedPlayers,
    });
    if (result.error) {
      setSaving(false);
      setError(result.error);
      return;
    }
    let playlistId = row.youtube_playlist_id;
    if (playlistDraft !== (row.youtube_playlist_id ?? "")) {
      const playlist = await updateFilmPlaylistOverride(row.id, playlistDraft);
      if (playlist.error) {
        setSaving(false);
        setError(playlist.error);
        return;
      }
      playlistId = playlist.youtube_playlist_id ?? null;
    }
    setSaving(false);
    onSaved({
      game_date: result.upload?.game_date ?? row.game_date,
      opponent: result.upload?.opponent ?? row.opponent,
      our_score: result.upload?.our_score ?? row.our_score,
      their_score: result.upload?.their_score ?? row.their_score,
      youtube_playlist_id: playlistId,
    });
    startTransition(() => router.refresh());
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className={styles.field}>
        <span className={styles.label}>Game date</span>
        <input
          className={styles.input}
          type="date"
          value={gameDate}
          onChange={(e) => setGameDate(e.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Opponent</span>
        <input
          className={styles.input}
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Who did we play?"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={OPPONENT_MAX}
        />
      </label>
      {roster.length > 0 && (
        <fieldset className={styles.scoreFields} data-tour="film-lineup">
          <legend className={styles.label}>Who played</legend>
          <p className={styles.hint}>
            Tick this game&apos;s lineup. Leave empty to use the season roster.
          </p>
          <div className={styles.playerList}>
            {roster.map((player) => {
              const checked = pickedPlayers.includes(player.id);
              return (
                <label key={player.id} className={styles.playerRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setPickedPlayers((prev) =>
                        prev.includes(player.id) ? prev.filter((id) => id !== player.id) : [...prev, player.id]
                      );
                    }}
                  />
                  <span>{player.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <fieldset className={styles.scoreFields}>
        <legend className={styles.label}>Score</legend>
        <p className={styles.hint}>Optional — leave blank if you don&apos;t have it.</p>
        <div className={styles.scoreRow}>
          <label className={styles.field}>
            <span className={styles.subLabel}>Our score</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={ourScore}
              onChange={(e) => setOurScore(digitsOnly(e.target.value))}
              placeholder="—"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.subLabel}>Their score</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={theirScore}
              onChange={(e) => setTheirScore(digitsOnly(e.target.value))}
              placeholder="—"
            />
          </label>
        </div>
      </fieldset>
      <label className={styles.field}>
        <span className={styles.label}>YouTube playlist</span>
        <p className={styles.hint}>
          Optional for this video. Leave blank to use the team playlist
          {teamPlaylistId ? " from Settings → Film" : ""}. Paste a playlist link or id.
        </p>
        <input
          className={styles.input}
          value={playlistDraft}
          onChange={(e) => setPlaylistDraft(e.target.value)}
          placeholder={
            teamPlaylistId
              ? youtubePlaylistUrl(teamPlaylistId)
              : "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f"
          }
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Pill size="sm" variant="accent" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Pill>
        <Pill size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Pill>
      </div>
    </form>
  );
}

function SlackDraftCard({
  draft,
  discarded = false,
  canApproveSlack,
  slackConfigured,
  busy,
  onRun,
}: {
  draft: FilmSlackDraftView;
  discarded?: boolean;
  canApproveSlack: boolean;
  slackConfigured: boolean;
  busy: boolean;
  onRun: (fn: (id: string) => Promise<{ error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const noChannel = !draft.channel_id?.trim();
  const approveBlocked = noChannel || !slackConfigured;

  return (
    <div className="rsd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{draft.team_label}</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
          {draft.filename} · {discarded ? "discarded — restore within 30 days" : "waiting for approval"}
        </div>
      </div>
      {editing ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            onRun(async (id) => {
              const result = await editFilmSlackDraft(id, body);
              if (!result.error) setEditing(false);
              return result;
            });
          }}
        >
          <label className={styles.field}>
            <span className={styles.label}>Slack post</span>
            <textarea
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              required
            />
          </label>
          <div className={styles.actions}>
            <Pill size="sm" variant="accent" type="submit" disabled={busy || !body.trim()}>
              Save
            </Pill>
            <Pill
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBody(draft.body);
                setEditing(false);
              }}
            >
              Cancel
            </Pill>
          </div>
        </form>
      ) : (
        <>
          <pre className={styles.draftBody}>{draft.body}</pre>
          {canApproveSlack && discarded && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span data-tour="film-slack-restore">
                <Pill size="sm" variant="accent" disabled={busy} onClick={() => onRun((id) => restoreDiscardedFilmSlackDraft(id))}>
                  Restore
                </Pill>
              </span>
            </div>
          )}
          {canApproveSlack && !discarded && noChannel && (
            <p className={styles.hint}>
              Approve is off until this team has a Slack channel ID in Settings → Film.
            </p>
          )}
          {canApproveSlack && !discarded && !noChannel && !slackConfigured && (
            <p className={styles.hint}>Approve is off until Sparky&apos;s Slack bot token is set.</p>
          )}
          {canApproveSlack && !discarded && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span data-tour="film-slack-approve">
                <Pill
                  size="sm"
                  variant="accent"
                  disabled={busy || approveBlocked}
                  onClick={() => onRun((id) => approveFilmSlackDraft(id))}
                >
                  Approve
                </Pill>
              </span>
              <span data-tour="film-slack-edit">
                <Pill size="sm" disabled={busy} onClick={() => setEditing(true)}>
                  Edit
                </Pill>
              </span>
              <span data-tour="film-slack-discard">
                <Pill
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Discard this Slack post? You can restore it for 30 days.")) {
                      onRun((id) => discardPendingFilmSlackDraft(id));
                    }
                  }}
                >
                  Discard
                </Pill>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
