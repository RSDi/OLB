"use client";

import type { FilmUpload, YoutubeEvent, YoutubeJob } from "../../../lib/film/types";
import {
  formatEventWhen,
  mapYoutubeError,
  youtubeDisplayStatus,
  youtubeEventTitle,
  youtubeProgressLine,
  youtubeProgressView,
  youtubeWorkLabel,
} from "../../../lib/film/youtube-progress";
import styles from "./inbox.module.css";

export function YoutubeTransfer({
  row,
  job,
  events,
}: {
  row: FilmUpload;
  job: YoutubeJob | null;
  events: YoutubeEvent[];
}) {
  const now = Date.now();
  const display = youtubeDisplayStatus({
    youtubeStatus: row.youtube_status,
    lastProgressAt: job?.last_progress_at,
    youtubeUpdatedAt: row.youtube_updated_at,
    now,
  });
  const label = youtubeWorkLabel(display, row.youtube_video_id);
  const progress = youtubeProgressView({
    bytesSent: job?.bytes_sent,
    bytesTotal: job?.bytes_total,
    sizeBytes: row.size_bytes,
    startedAt: job?.started_at,
    lastProgressAt: job?.last_progress_at,
    now,
  });
  const mapped = mapYoutubeError(row.youtube_error);
  const showProgress = display === "uploading" || display === "stalled" || display === "queued";
  if (!label && !mapped && events.length === 0) return null;

  return (
    <div data-tour="film-youtube-progress">
      {label && (
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          {display === "done" && row.youtube_video_id ? (
            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(row.youtube_video_id)}`} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          ) : (
            label
          )}
        </div>
      )}
      {showProgress && progress && youtubeProgressLine(progress, now) && (
        <div className={styles.progress}>
          <p className={styles.progressLine}>{youtubeProgressLine(progress, now)}</p>
          {progress.bytesTotal > 0 && (
            <div className={styles.bar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
              <div
                className={`${styles.barFill}${display === "stalled" ? ` ${styles.barFillStall}` : ""}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}
      {mapped && display === "failed" && (
        <div>
          <p className={styles.errorText}>{mapped.message}</p>
          {mapped.raw && mapped.raw !== mapped.message && (
            <details className={styles.details} data-tour="film-youtube-error-details">
              <summary>Details</summary>
              <pre className={styles.rawError}>{mapped.raw}</pre>
            </details>
          )}
        </div>
      )}
      {events.length > 0 && (
        <details className={styles.history} data-tour="film-youtube-history">
          <summary>History</summary>
          <div className={styles.historyList}>
            {events.map((ev) => (
              <div key={ev.id} className={styles.historyItem}>
                <div className={styles.historyWhen}>{formatEventWhen(ev.at)}</div>
                <div>{ev.message || youtubeEventTitle(ev.kind)}</div>
                {ev.kind === "error" && ev.detail && ev.detail !== ev.message && (
                  <details className={styles.details}>
                    <summary>Details</summary>
                    <pre className={styles.rawError}>{ev.detail}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
