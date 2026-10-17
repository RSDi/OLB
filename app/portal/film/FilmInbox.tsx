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
} from "../../../lib/film/admin-actions";
import { retryFilmYoutube } from "../../../lib/film/youtube-actions";
import { formatFilmGameLine } from "../../../lib/film/game-meta";
import { groupUploadsByTeamAndGame, youtubeWatchUrl } from "../../../lib/film/youtube-meta";
import type { FilmStatus, FilmUpload, YoutubeStatus } from "../../../lib/film/types";

interface Props {
  uploads: FilmUpload[];
  canManage: boolean;
  loadError: string | null;
  parentLinks: { slug: string; label: string }[];
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

export function FilmInbox({ uploads, canManage, loadError, parentLinks }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of parentLinks) map[t.slug] = t.label;
    return map;
  }, [parentLinks]);

  const shown = useMemo(() => {
    let rows = filter === "all" ? uploads : uploads.filter((u) => u.status === filter);
    if (teamFilter !== "all") rows = rows.filter((u) => u.team === teamFilter);
    return rows;
  }, [filter, teamFilter, uploads]);

  const grouped = useMemo(() => groupUploadsByTeamAndGame(shown, labels), [shown, labels]);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of uploads) {
      if (!seen.has(u.team)) seen.set(u.team, labels[u.team] || u.team);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [uploads, labels]);

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
        unlisted in the background. Files marked <strong>Moved</strong> are deleted after 30 days.
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="film-filter">
        {(["all", "holding", "moved"] as Filter[]).map((key) => (
          <Pill key={key} size="sm" variant={filter === key ? "dark" : "light"} onClick={() => setFilter(key)}>
            {key === "all" ? "All" : key === "holding" ? "Holding" : "Moved"}
          </Pill>
        ))}
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
                    {game.line || formatFilmGameLine({ gameDate: game.gameDate, opponent: game.opponent }) || "Game"}
                  </div>
                  {game.uploads.map((row) => (
                    <FilmRow
                      key={row.id}
                      row={row}
                      busy={busy === row.id}
                      playing={playing?.id === row.id}
                      canManage={canManage}
                      onPlay={() => void play(row)}
                      onDownload={() => void download(row.id)}
                      onRetryYoutube={() => void run(row.id, retryFilmYoutube)}
                      onMoved={() => void run(row.id, markFilmMoved)}
                      onHolding={() => void run(row.id, restoreFilmHolding)}
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
  busy,
  playing,
  canManage,
  onPlay,
  onDownload,
  onRetryYoutube,
  onMoved,
  onHolding,
  onDelete,
}: {
  row: FilmUpload;
  busy: boolean;
  playing: boolean;
  canManage: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onRetryYoutube: () => void;
  onMoved: () => void;
  onHolding: () => void;
  onDelete: () => void;
}) {
  const yt = youtubeLabel(row.youtube_status, row.youtube_video_id);
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
    </div>
  );
}
