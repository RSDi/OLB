"use client";

import Link from "next/link";
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
import { filmFileMissing, youtubeDisplayStatus } from "../../../lib/film/youtube-progress";
import { YoutubeTransfer } from "./YoutubeTransfer";
import { AddStreamForm, LineUpMarkers } from "./StreamParts";
import { TournamentField, useTournamentPick } from "./TournamentField";
import type { ScheduledTournament } from "../../../lib/film/tournaments";
import { setRecordingStream } from "../../../lib/film/stream-actions";
import { FilmPlayer } from "./FilmPlayer";
import { SettingsLink, SettingsText } from "../../components/SettingsLink";
import { setFilmTeamSlackChannel } from "../../../lib/film/team-actions";
import type { FilmMarker } from "../../../lib/film/player-logic";
import styles from "./inbox.module.css";

interface Props {
  uploads: FilmUpload[];
  jobs: Record<string, YoutubeJob>;
  events: Record<string, YoutubeEvent[]>;
  /** "4K · uploaded in 61 min at 14 Mbps", from what the parent's phone measured. */
  uploadStats?: Record<string, string>;
  slackDrafts: FilmSlackDraftView[];
  discardedDrafts: FilmSlackDraftView[];
  canManage: boolean;
  canApproveSlack: boolean;
  slackConfigured: boolean;
  loadError: string | null;
  /** Set when the upload worker can't reach YouTube (login expired, not connected). */
  youtubePaused?: string | null;
  parentLinks: { slug: string; label: string }[];
  // Preview: the staff uploader (/portal/film/upload).
  canStaffUpload?: boolean;
  teamPlaylists: Record<string, string>;
  rosters: Record<string, FilmRosterPlayer[]>;
  lineups: Record<string, string[]>;
  markers: Record<string, FilmMarker[]>;
  /** From a shared link: open this video at this second. */
  initialMoment: { id: string; t: number } | null;
  /** Preview: the tournament field that groups games on the team film page. */
  showEvents?: boolean;
  /** Preview: teams a streamed game can be added to. Null hides streamed games' controls. */
  streamTeams?: { id: string; label: string; slug: string }[] | null;
  /** Preview: the HS Schedule's tournaments by team id, for the Tournament dropdown. */
  scheduledTournaments?: Record<string, ScheduledTournament[]>;
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

type Filter = "all" | "attention" | "progress";

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

type GamePatch = Pick<FilmUpload, "game_date" | "opponent" | "our_score" | "their_score" | "youtube_playlist_id" | "event_name">;

export function FilmInbox({
  uploads,
  jobs,
  events,
  uploadStats = {},
  slackDrafts,
  discardedDrafts,
  canManage,
  canApproveSlack,
  slackConfigured,
  loadError,
  youtubePaused = null,
  parentLinks,
  canStaffUpload = false,
  teamPlaylists,
  rosters,
  lineups,
  markers: initialMarkers,
  initialMoment,
  showEvents = false,
  streamTeams = null,
  scheduledTournaments = {},
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
  const [addingStream, setAddingStream] = useState(false);
  // Tournament names already used per team, newest first, for the edit form.
  const eventOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const u of uploads) {
      const name = (patches[u.id]?.event_name ?? u.event_name)?.trim();
      if (!name) continue;
      const list = (out[u.team] ??= []);
      if (!list.some((x) => x.toLowerCase() === name.toLowerCase())) list.push(name);
    }
    return out;
  }, [uploads, patches]);
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

  // Which cards say Needs attention and which say In progress, from the same
  // view the cards themselves use.
  const { attention, inProgress } = useMemo(() => {
    const ids = new Set<string>();
    const active = new Set<string>();
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
      if (view.badge.text === "In progress") active.add(u.id);
    }
    return { attention: ids, inProgress: active };
  }, [rows, jobs, teamPlaylists]);

  // The filter counts follow the team tab, like the list does.
  const { attentionCount, progressCount } = useMemo(() => {
    const onTab = rows.filter((u) => teamFilter === "all" || u.team === teamFilter);
    return {
      attentionCount: onTab.filter((u) => attention.has(u.id)).length,
      progressCount: onTab.filter((u) => inProgress.has(u.id)).length,
    };
  }, [rows, attention, inProgress, teamFilter]);

  const shown = useMemo(() => {
    let list =
      filter === "attention" ? rows.filter((u) => attention.has(u.id))
      : filter === "progress" ? rows.filter((u) => inProgress.has(u.id))
      : rows;
    if (teamFilter !== "all") list = list.filter((u) => u.team === teamFilter);
    return list;
  }, [filter, teamFilter, rows, attention, inProgress]);

  const grouped = useMemo(() => groupUploadsByTeamAndGame(shown, labels), [shown, labels]);

  // Streamed games and the recordings that replace them (0179).
  const { streamsById, recordingByStream } = useMemo(() => {
    const streams = new Map<string, FilmUpload>();
    const recs = new Map<string, FilmUpload>();
    for (const u of rows) if (u.streamed) streams.set(u.id, u);
    for (const u of rows) if (u.replaces_stream_id && streams.has(u.replaces_stream_id)) recs.set(u.replaces_stream_id, u);
    return { streamsById: streams, recordingByStream: recs };
  }, [rows]);

  // Streams a recording could replace: same team, not taken by another one.
  function streamOptionsFor(row: FilmUpload): FilmUpload[] | null {
    if (!streamTeams || row.streamed) return null;
    return [...streamsById.values()].filter((s) => {
      if (s.team_id !== row.team_id) return false;
      const taken = recordingByStream.get(s.id);
      return !taken || taken.id === row.id;
    });
  }

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
      {youtubePaused && uploads.some((u) => u.youtube_status === "queued" || u.youtube_status === "uploading") && (
        <div role="alert" className={styles.paused}>
          <strong>YouTube uploads are paused.</strong> <SettingsText text={youtubePaused} />
        </div>
      )}

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

      {streamTeams && canManage && streamTeams.length > 0 && (
        addingStream ? (
          <AddStreamForm
            teams={streamTeams}
            eventOptions={eventOptions}
            scheduledTournaments={scheduledTournaments}
            initialTeamId={streamTeams.find((t) => t.slug === teamFilter)?.id ?? null}
            onClose={() => setAddingStream(false)}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span data-tour="film-add-stream">
              <Pill size="sm" variant="accent" onClick={() => setAddingStream(true)}>
                Add streamed game
              </Pill>
            </span>
            <span style={{ color: "var(--gw-fg-muted)" }}>
              — put a livestream on the team film page now; the recording replaces it later.
            </span>
          </p>
        )
      )}

      {canStaffUpload && (
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          <Link href="/portal/film/upload" className={styles.statusLink}>
            Upload film
          </Link>{" "}
          <span style={{ color: "var(--gw-fg-muted)" }}>— pick any team and upload, no code needed.</span>
        </p>
      )}

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
              canManage={canManage}
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
              canManage={canManage}
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
        {(["all", "attention", "progress"] as Filter[]).map((key) => (
          <Pill key={key} size="sm" variant={filter === key ? "dark" : "light"} onClick={() => setFilter(key)}>
            {key === "all"
              ? "All"
              : key === "attention"
                ? `Needs attention (${attentionCount})`
                : `In progress (${progressCount})`}
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
        <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>
          <SettingsText text={loadError || error || ""} />
        </p>
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
                : filter === "progress"
                  ? "Nothing is on its way to YouTube right now."
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
                      uploadStatsLine={uploadStats[row.id] ?? null}
                      teamPlaylistId={teamPlaylists[row.team] ?? null}
                      busy={busy === row.id}
                      playing={playing?.id === row.id}
                      canManage={canManage}
                      roster={row.team_id ? rosters[row.team_id] ?? [] : []}
                      lineupPlayerIds={lineups[filmLineupKey(row.team_id, row.game_date, row.opponent) ?? ""] ?? []}
                      markerCount={markers[row.id]?.length ?? 0}
                      eventOptions={showEvents ? eventOptions[row.team] ?? [] : null}
                      stream={row.replaces_stream_id ? streamsById.get(row.replaces_stream_id) ?? null : null}
                      replacedBy={row.streamed ? recordingByStream.get(row.id) ?? null : null}
                      streamMarkerCount={row.replaces_stream_id ? markers[row.replaces_stream_id]?.length ?? 0 : 0}
                      streamOptions={streamOptionsFor(row)}
                      scheduled={row.team_id ? scheduledTournaments[row.team_id] ?? [] : []}
                      onPlay={() => void play(row)}
                      onPlayOriginal={() => void play(row, { original: true })}
                      onDownload={() => void download(row.id)}
                      onRetryYoutube={() => void run(row.id, retryFilmYoutube)}
                      onRetryPlaylist={() => void run(row.id, retryFilmPlaylist)}
                      onPatched={(patch) => setPatches((prev) => ({ ...prev, [row.id]: patch }))}
                      onDelete={() => {
                        const what = row.streamed ? "this streamed game from Film (the video stays on YouTube)" : row.filename;
                        if (confirm(`Delete ${what}? This cannot be undone.`)) {
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
  uploadStatsLine,
  teamPlaylistId,
  busy,
  playing,
  canManage,
  roster,
  lineupPlayerIds,
  markerCount,
  eventOptions,
  stream,
  replacedBy,
  streamMarkerCount,
  streamOptions,
  scheduled,
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
  uploadStatsLine: string | null;
  teamPlaylistId: string | null;
  busy: boolean;
  playing: boolean;
  canManage: boolean;
  roster: FilmRosterPlayer[];
  lineupPlayerIds: string[];
  markerCount: number;
  /** Null hides the tournament field. */
  eventOptions: string[] | null;
  /** On a recording: the streamed game it replaces. */
  stream: FilmUpload | null;
  /** On a streamed game: the recording that replaces it. */
  replacedBy: FilmUpload | null;
  /** Jump-to points still on the stream this recording replaces. */
  streamMarkerCount: number;
  /** Streams this recording could replace, for Edit. Null hides the field. */
  streamOptions: FilmUpload[] | null;
  /** The HS Schedule's tournaments for this team. */
  scheduled: ScheduledTournament[];
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
  // A stream lives on the club channel; it never goes in a team playlist.
  const pl = row.streamed ? null : playlistLabel(
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
    !row.streamed &&
    row.youtube_status === "done" &&
    !!row.youtube_video_id &&
    !!effectivePlaylist &&
    row.youtube_playlist_status !== "done" &&
    row.youtube_playlist_status !== "queued";
  const flow = filmFlowView({ row, display, playlistId: effectivePlaylist, missingDetails: missing.length > 0 });
  const onYoutube = row.youtube_status === "done" && !!row.youtube_video_id;
  // The phone upload never finished: nothing to send, play, or download.
  const noFile = filmFileMissing(row);
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
          <div style={{ fontWeight: 800, fontSize: 15, wordBreak: "break-word", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {row.filename}
            {row.streamed && !replacedBy && <span className="rsd-chip rsd-chip-error">Streamed</span>}
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
            {row.streamed
              ? `Added by ${row.uploader_name} · ${formatWhen(row.created_at)}`
              : `${row.uploader_name} · ${formatBytes(row.size_bytes)} · ${formatWhen(row.created_at)}`}
          </div>
          {row.streamed && replacedBy && (
            <div className={styles.streamLine} data-tour="film-stream-replaced">
              {onYoutubeNow(replacedBy)
                ? "Replaced by the recording on the team film page."
                : "The recording is uploaded. Families watch this stream until the recording is on YouTube."}
            </div>
          )}
          {stream && (
            <div className={styles.streamLine} data-tour="film-replaces-stream">
              {onYoutube
                ? "Replaces the streamed game on the team film page."
                : "Replaces the streamed game once it's on YouTube. Families watch the stream until then."}
            </div>
          )}
          {uploadStatsLine && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
              {uploadStatsLine}
            </div>
          )}
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
          streamOptions={streamOptions}
          scheduled={scheduled}
          teamPlaylistId={teamPlaylistId}
          roster={roster}
          lineupPlayerIds={lineupPlayerIds}
          eventOptions={eventOptions}
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
          ) : !flow.originalGone && !noFile ? (
            <span data-tour="film-play">
              <Pill size="sm" variant="accent" onClick={onPlay} disabled={busy}>
                Play
              </Pill>
            </span>
          ) : null}
          {canManage && !noFile && (display === "failed" || display === "stalled" || (!row.youtube_status && !flow.originalGone)) && (
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
          {canManage && stream && streamMarkerCount > 0 && (
            <LineUpMarkers recordingId={row.id} streamMarkerCount={streamMarkerCount} />
          )}
          <span data-tour="film-more">
            <Pill size="sm" variant="ghost" onClick={() => setMore((v) => !v)}>
              {more ? "Less" : "More"}
            </Pill>
          </span>
          {more && (
            <>
              {row.streamed && row.youtube_video_id && (
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(row.youtube_video_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.statusLink}
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  Watch the stream on YouTube
                </a>
              )}
              {onYoutube && !flow.originalGone && (
                <Pill size="sm" onClick={onPlayOriginal} disabled={busy}>
                  Play original
                </Pill>
              )}
              {!flow.originalGone && !noFile && (
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
  streamOptions,
  scheduled,
  teamPlaylistId,
  roster,
  lineupPlayerIds,
  eventOptions,
  onCancel,
  onSaved,
}: {
  row: FilmUpload;
  streamOptions: FilmUpload[] | null;
  scheduled: ScheduledTournament[];
  teamPlaylistId: string | null;
  roster: FilmRosterPlayer[];
  lineupPlayerIds: string[];
  eventOptions: string[] | null;
  onCancel: () => void;
  onSaved: (patch: GamePatch) => void;
}) {
  const router = useRouter();
  const [gameDate, setGameDate] = useState(row.game_date ?? "");
  const [opponent, setOpponent] = useState(row.opponent ?? "");
  const tournament = useTournamentPick(row.event_name, scheduled, row.game_date ?? "");
  const eventName = tournament.value;
  const [ourScore, setOurScore] = useState(row.our_score == null ? "" : String(row.our_score));
  const [theirScore, setTheirScore] = useState(row.their_score == null ? "" : String(row.their_score));
  const [playlistDraft, setPlaylistDraft] = useState(row.youtube_playlist_id ?? "");
  const [pickedPlayers, setPickedPlayers] = useState<string[]>(lineupPlayerIds);
  const [streamId, setStreamId] = useState(row.replaces_stream_id ?? "");
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
      ...(eventOptions ? { eventName } : {}),
      ...(streamOptions && streamOptions.length > 0 ? { keepStream: true } : {}),
    });
    if (result.error) {
      setSaving(false);
      setError(result.error);
      return;
    }
    if (streamOptions && streamId !== (row.replaces_stream_id ?? "")) {
      const linked = await setRecordingStream(row.id, streamId || null);
      if (linked.error) {
        setSaving(false);
        setError(linked.error);
        return;
      }
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
      event_name: result.upload ? result.upload.event_name : row.event_name,
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
          onChange={(e) => {
            setGameDate(e.target.value);
            tournament.follow(e.target.value);
          }}
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
      {eventOptions && (
        <TournamentField
          id={`film-event-${row.id}`}
          value={eventName}
          onChange={tournament.pick}
          gameDate={gameDate}
          scheduled={scheduled}
          used={eventOptions}
          auto={tournament.auto}
        />
      )}
      {streamOptions && streamOptions.length > 0 && (
        <label className={styles.field} data-tour="film-edit-stream">
          <span className={styles.label}>Replaces streamed game</span>
          <p className={styles.hint}>
            Pick the stream this is the recording of. Families watch the stream until this is on YouTube, then this
            takes its place.
          </p>
          <select className={styles.input} value={streamId} onChange={(e) => setStreamId(e.target.value)}>
            <option value="">None</option>
            {streamOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatFilmInboxHeading({
                  gameDate: s.game_date,
                  opponent: s.opponent,
                  ourScore: s.our_score,
                  theirScore: s.their_score,
                })}
              </option>
            ))}
          </select>
        </label>
      )}
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
          {teamPlaylistId ? (
            <>
              {" "}from <SettingsLink tab="film">Settings → Film</SettingsLink>
            </>
          ) : (
            ""
          )}
          . Paste a playlist link or id.
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
      {error && (
        <p className={styles.error}>
          <SettingsText text={error} />
        </p>
      )}
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
  canManage,
  slackConfigured,
  busy,
  onRun,
}: {
  draft: FilmSlackDraftView;
  discarded?: boolean;
  canApproveSlack: boolean;
  canManage: boolean;
  slackConfigured: boolean;
  busy: boolean;
  onRun: (fn: (id: string) => Promise<{ error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const [channelDraft, setChannelDraft] = useState("");
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
          {canApproveSlack && !discarded && noChannel && canManage && draft.team_id && (
            <form
              className={styles.channelForm}
              data-tour="film-slack-channel"
              onSubmit={(e) => {
                e.preventDefault();
                const teamId = draft.team_id;
                if (!teamId) return;
                onRun(() => setFilmTeamSlackChannel(teamId, channelDraft));
              }}
            >
              <label className={styles.field}>
                <span className={styles.label}>Slack channel for {draft.team_label}</span>
                <span className={styles.hint}>
                  Where Sparky posts this. In Slack, click the channel name → Copy link, and paste it
                  here. Saved for the team, so next time it&apos;s ready to approve.
                </span>
                <span className={styles.channelRow}>
                  <input
                    className={styles.input}
                    value={channelDraft}
                    onChange={(e) => setChannelDraft(e.target.value)}
                    placeholder="https://….slack.com/archives/C0123456789"
                    autoComplete="off"
                  />
                  <Pill size="sm" variant="accent" type="submit" disabled={busy || !channelDraft.trim()}>
                    Save
                  </Pill>
                </span>
              </label>
            </form>
          )}
          {canApproveSlack && !discarded && noChannel && !(canManage && draft.team_id) && (
            <p className={styles.hint}>
              Approve is off until this team has a Slack channel. Someone who manages film can add it here
              or in <SettingsLink tab="film">Settings → Film</SettingsLink>.
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
