"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Pill } from "../../components/ui";
import { Icons } from "../../components/icons";
import {
  deleteFilmUpload,
  markFilmMoved,
  restoreFilmHolding,
  signedFilmDownload,
  updateFilmGameFields,
  updateFilmPlaylistOverride,
} from "../../../lib/film/admin-actions";
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
  youtubeWatchUrl,
} from "../../../lib/film/youtube-meta";
import type { FilmStatus, FilmUpload, YoutubePlaylistStatus, YoutubeStatus } from "../../../lib/film/types";
import styles from "./inbox.module.css";

interface Props {
  uploads: FilmUpload[];
  canManage: boolean;
  loadError: string | null;
  parentLinks: { slug: string; label: string }[];
  teamPlaylists: Record<string, string>;
}

type Filter = "all" | FilmStatus;

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
    minute: "2-digit",
  });
}

function youtubeLabel(status: YoutubeStatus | null, videoId: string | null): string | null {
  if (status === "done" && videoId) return "On YouTube";
  if (status === "queued") return "Queued for YouTube";
  if (status === "uploading") return "Uploading to YouTube";
  if (status === "failed") return "YouTube failed";
  return null;
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

export function FilmInbox({ uploads, canManage, loadError, parentLinks, teamPlaylists }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string; name: string } | null>(null);
  const [patches, setPatches] = useState<Record<string, GamePatch>>({});
  const [, startTransition] = useTransition();

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of parentLinks) map[t.slug] = t.label;
    return map;
  }, [parentLinks]);

  const rows = useMemo(
    () => uploads.map((u) => (patches[u.id] ? { ...u, ...patches[u.id] } : u)),
    [uploads, patches]
  );

  const shown = useMemo(() => {
    let list = filter === "all" ? rows : rows.filter((u) => u.status === filter);
    if (teamFilter !== "all") list = list.filter((u) => u.team === teamFilter);
    return list;
  }, [filter, teamFilter, rows]);

  const grouped = useMemo(() => groupUploadsByTeamAndGame(shown, labels), [shown, labels]);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of rows) {
      if (!seen.has(u.team)) seen.set(u.team, labels[u.team] || u.team);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, labels]);

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

  async function play(row: FilmUpload) {
    setBusy(row.id);
    setError(null);
    const result = await signedFilmDownload(row.id);
    setBusy(null);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't make a play link.");
      return;
    }
    setPlaying({ id: row.id, url: result.url, name: row.filename });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Videos families upload from their phones, listed by team and game. <strong>Play</strong> watches
        them here. After YouTube is connected in <strong>Settings → Film</strong>, new uploads go up
        unlisted in the background, then into that team&apos;s playlist if one is set. A playlist miss
        does not mark the YouTube upload failed. Each YouTube card shows the privacy YouTube actually
        has — <strong>Public</strong>, <strong>Unlisted</strong>, or <strong>Private</strong> — and
        whether YouTube is still processing it. That can differ from the default in Settings (Google
        sometimes forces Private). <strong>Refresh YouTube status</strong> reads it from YouTube; you
        don&apos;t need Studio. Files marked <strong>Moved</strong> are deleted after 30 days.
      </p>

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
        <div
          data-tour="film-player"
          className="rsd-card"
          style={{
            padding: 12,
            position: "sticky",
            top: 8,
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <video
            key={playing.url}
            src={playing.url}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", maxHeight: "70vh", borderRadius: 12, background: "#000" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, wordBreak: "break-word" }}>{playing.name}</div>
            <Pill size="sm" onClick={() => setPlaying(null)}>
              Close player
            </Pill>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} data-tour="film-filter">
        {(["all", "holding", "moved"] as Filter[]).map((key) => (
          <Pill key={key} size="sm" variant={filter === key ? "dark" : "light"} onClick={() => setFilter(key)}>
            {key === "all" ? "All" : key === "holding" ? "Holding" : "Moved"}
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

      {teams.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="film-team-filter">
          <Pill size="sm" variant={teamFilter === "all" ? "dark" : "light"} onClick={() => setTeamFilter("all")}>
            Every team
          </Pill>
          {teams.map(([slug, label]) => (
            <Pill
              key={slug}
              size="sm"
              variant={teamFilter === slug ? "dark" : "light"}
              onClick={() => setTeamFilter(slug)}
            >
              {label}
            </Pill>
          ))}
        </div>
      )}

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
              : "Try All, or another team."
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
                      teamPlaylistId={teamPlaylists[row.team] ?? null}
                      busy={busy === row.id}
                      playing={playing?.id === row.id}
                      canManage={canManage}
                      onPlay={() => void play(row)}
                      onDownload={() => void download(row.id)}
                      onRetryYoutube={() => void run(row.id, retryFilmYoutube)}
                      onRetryPlaylist={() => void run(row.id, retryFilmPlaylist)}
                      onMoved={() => void run(row.id, markFilmMoved)}
                      onHolding={() => void run(row.id, restoreFilmHolding)}
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
  teamPlaylistId,
  busy,
  playing,
  canManage,
  onPlay,
  onDownload,
  onRetryYoutube,
  onRetryPlaylist,
  onMoved,
  onHolding,
  onDelete,
  onPatched,
}: {
  row: FilmUpload;
  teamPlaylistId: string | null;
  busy: boolean;
  playing: boolean;
  canManage: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onRetryYoutube: () => void;
  onRetryPlaylist: () => void;
  onMoved: () => void;
  onHolding: () => void;
  onDelete: () => void;
  onPatched: (patch: GamePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const yt = youtubeLabel(row.youtube_status, row.youtube_video_id);
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
          {missing.length > 0 && !editing && (
            <p className={styles.missing}>Missing: {missing.join(", ")}</p>
          )}
          <div data-tour="film-playlist">
            {yt && (
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                {row.youtube_status === "done" && row.youtube_video_id ? (
                  <a href={youtubeWatchUrl(row.youtube_video_id)} target="_blank" rel="noopener noreferrer">
                    {yt}
                  </a>
                ) : (
                  yt
                )}
                {row.youtube_status === "failed" && row.youtube_error ? ` — ${row.youtube_error}` : ""}
              </div>
            )}
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
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            alignSelf: "flex-start",
            padding: "4px 8px",
            borderRadius: 100,
            background: row.status === "moved" ? "var(--gw-success-bg)" : "var(--gw-bg-elev)",
            color: row.status === "moved" ? "var(--gw-success)" : "var(--gw-fg-muted)",
          }}
        >
          {row.status === "moved" ? "Moved" : "Holding"}
        </span>
      </div>
      {editing ? (
        <FilmGameEditor
          row={row}
          teamPlaylistId={teamPlaylistId}
          onCancel={() => setEditing(false)}
          onSaved={(patch) => {
            onPatched(patch);
            setEditing(false);
          }}
        />
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span data-tour="film-play">
            <Pill size="sm" variant="accent" onClick={onPlay} disabled={busy}>
              Play
            </Pill>
          </span>
          <span data-tour="film-download">
            <Pill size="sm" onClick={onDownload} disabled={busy}>
              Download
            </Pill>
          </span>
          {row.youtube_status === "done" && row.youtube_video_id && (
            <Pill
              size="sm"
              onClick={() => window.open(youtubeWatchUrl(row.youtube_video_id!), "_blank", "noopener,noreferrer")}
            >
              YouTube
            </Pill>
          )}
          {canManage && (row.youtube_status === "failed" || !row.youtube_status) && (
            <Pill size="sm" onClick={onRetryYoutube} disabled={busy}>
              {row.youtube_status === "failed" ? "Retry YouTube" : "Send to YouTube"}
            </Pill>
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
          {canManage && row.status === "holding" && (
            <span data-tour="film-moved">
              <Pill size="sm" onClick={onMoved} disabled={busy}>
                Mark moved
              </Pill>
            </span>
          )}
          {canManage && row.status === "moved" && (
            <Pill size="sm" onClick={onHolding} disabled={busy}>
              Back to holding
            </Pill>
          )}
          {canManage && (
            <span data-tour="film-delete">
              <Pill size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
                Delete
              </Pill>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FilmGameEditor({
  row,
  teamPlaylistId,
  onCancel,
  onSaved,
}: {
  row: FilmUpload;
  teamPlaylistId: string | null;
  onCancel: () => void;
  onSaved: (patch: GamePatch) => void;
}) {
  const router = useRouter();
  const [gameDate, setGameDate] = useState(row.game_date ?? "");
  const [opponent, setOpponent] = useState(row.opponent ?? "");
  const [ourScore, setOurScore] = useState(row.our_score == null ? "" : String(row.our_score));
  const [theirScore, setTheirScore] = useState(row.their_score == null ? "" : String(row.their_score));
  const [playlistDraft, setPlaylistDraft] = useState(row.youtube_playlist_id ?? "");
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
