"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Pill } from "../../../components/ui";
import { Icons } from "../../../components/icons";
import { retryFilmYoutube } from "../../../../lib/film/youtube-actions";
import { formatFilmInboxHeading } from "../../../../lib/film/game-meta";
import type { FilmUpload, YoutubeEvent, YoutubeJob } from "../../../../lib/film/types";
import { youtubeDisplayStatus, type YoutubeDisplayStatus } from "../../../../lib/film/youtube-progress";
import { YoutubeTransfer } from "../YoutubeTransfer";
import styles from "../inbox.module.css";

type BoardFilter = "attention" | "uploading" | "stalled" | "failed" | "done" | "all";

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

function displayOf(row: FilmUpload, job: YoutubeJob | null): YoutubeDisplayStatus | null {
  return youtubeDisplayStatus({
    youtubeStatus: row.youtube_status,
    lastProgressAt: job?.last_progress_at,
    youtubeUpdatedAt: row.youtube_updated_at,
  });
}

export function FilmStatusBoard({
  uploads,
  jobs,
  events,
  labels,
  canManage,
  loadError,
}: {
  uploads: FilmUpload[];
  jobs: Record<string, YoutubeJob>;
  events: Record<string, YoutubeEvent[]>;
  labels: Record<string, string>;
  canManage: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<BoardFilter>("attention");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      uploads.map((row) => ({
        row,
        job: jobs[row.id] ?? null,
        events: events[row.id] ?? [],
        display: displayOf(row, jobs[row.id] ?? null),
      })),
    [uploads, jobs, events]
  );

  const counts = useMemo(() => {
    const next = { uploading: 0, stalled: 0, failed: 0, done: 0, queued: 0 };
    for (const item of rows) {
      if (item.display === "uploading" || item.display === "queued") next.uploading += 1;
      if (item.display === "stalled") next.stalled += 1;
      if (item.display === "failed") next.failed += 1;
      if (item.display === "done") next.done += 1;
      if (item.display === "queued") next.queued += 1;
    }
    return next;
  }, [rows]);

  const shown = useMemo(() => {
    return rows.filter((item) => {
      if (filter === "all") return item.display != null;
      if (filter === "attention") {
        return item.display === "uploading" || item.display === "queued" || item.display === "stalled" || item.display === "failed";
      }
      if (filter === "uploading") return item.display === "uploading" || item.display === "queued";
      return item.display === filter;
    });
  }, [rows, filter]);

  const live = counts.uploading + counts.stalled > 0;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => startTransition(() => router.refresh()), 15_000);
    return () => clearInterval(t);
  }, [live, router, startTransition]);

  async function retry(id: string) {
    setBusy(id);
    setError(null);
    const result = await retryFilmYoutube(id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  const filters: { key: BoardFilter; label: string }[] = [
    { key: "attention", label: `Needs attention (${counts.uploading + counts.stalled + counts.failed})` },
    { key: "uploading", label: `In progress (${counts.uploading})` },
    { key: "stalled", label: `Stalled (${counts.stalled})` },
    { key: "failed", label: `Failed (${counts.failed})` },
    { key: "done", label: `Done (${counts.done})` },
    { key: "all", label: "All with YouTube" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        YouTube transfer across every team you can see. <strong>In progress</strong> is still uploading or
        queued. <strong>Stalled</strong> has had no byte movement for 30 minutes — tap <strong>Retry YouTube</strong>.{" "}
        <strong>Failed</strong> needs a re-upload from the phone if the file is missing, or <strong>Retry YouTube</strong>{" "}
        if the file is there. Back to the{" "}
        <a href="/portal/film" className={styles.statusLink}>
          Film
        </a>{" "}
        inbox.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="film-status-filter">
        {filters.map((item) => (
          <Pill
            key={item.key}
            size="sm"
            variant={filter === item.key ? "dark" : "light"}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </Pill>
        ))}
      </div>

      {(loadError || error) && (
        <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>{loadError || error}</p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Icons.Video width={32} height={32} />}
          title={uploads.length === 0 ? "No film yet" : "Nothing in this view"}
          body={
            uploads.length === 0
              ? "When a family uploads from a team page, YouTube status shows up here."
              : "Try Needs attention, or All with YouTube."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map(({ row, job, events: ev, display }) => (
            <div
              key={row.id}
              data-tour="film-status-row"
              className="rsd-card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>
                    {labels[row.team] || row.team}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {formatFilmInboxHeading({
                      gameDate: row.game_date,
                      opponent: row.opponent,
                      ourScore: row.our_score,
                      theirScore: row.their_score,
                    })}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
                    {row.filename} · {row.uploader_name} · {formatBytes(row.size_bytes)} · {formatWhen(row.created_at)}
                  </div>
                  <YoutubeTransfer row={row} job={job} events={ev} />
                </div>
              </div>
              {canManage && (display === "failed" || display === "stalled") && (
                <div>
                  <span data-tour="film-status-retry">
                    <Pill size="sm" onClick={() => void retry(row.id)} disabled={busy === row.id}>
                      Retry YouTube
                    </Pill>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
