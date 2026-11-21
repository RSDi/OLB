// One plain view of where a film upload is: Uploaded → On YouTube → Ready →
// In playlist, an overall badge, whether it needs someone, and what happens
// to the phone's original. Pure, so the inbox and tests share it.

import { ORIGINAL_KEEP_DAYS, MOVED_RETENTION_DAYS, type FilmUpload } from "./types.ts";
import type { YoutubeDisplayStatus } from "./youtube-progress.ts";

export type FilmStepState = "done" | "active" | "todo" | "problem";
export type FilmStep = {
  key: "uploaded" | "youtube" | "ready" | "playlist" | "streamed";
  label: string;
  state: FilmStepState;
};
export type FilmBadgeTone = "done" | "active" | "waiting" | "problem";

export type FilmFlowView = {
  steps: FilmStep[];
  badge: { text: string; tone: FilmBadgeTone };
  needsAttention: boolean;
  originalGone: boolean;
  originalNote: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

export function filmFlowView(input: {
  row: Pick<
    FilmUpload,
    | "status"
    | "moved_at"
    | "file_deleted_at"
    | "youtube_status"
    | "youtube_video_id"
    | "youtube_updated_at"
    | "youtube_processing"
    | "youtube_playlist_status"
  > &
    Partial<Pick<FilmUpload, "streamed">>;
  display: YoutubeDisplayStatus | null;
  playlistId: string | null;
  missingDetails?: boolean;
}): FilmFlowView {
  const { row, display, playlistId } = input;
  if (row.streamed) return streamedFlowView(row, !!input.missingDetails);
  const onYoutube = row.youtube_status === "done" && !!row.youtube_video_id;

  const youtube: FilmStepState =
    onYoutube ? "done"
    : display === "failed" || display === "stalled" ? "problem"
    : display === "queued" || display === "uploading" ? "active"
    : "todo";

  const p = row.youtube_processing;
  const ready: FilmStepState =
    !onYoutube ? "todo"
    : p === "processed" ? "done"
    : p === "failed" || p === "rejected" || p === "deleted" || p === "missing" ? "problem"
    : "active";

  const steps: FilmStep[] = [
    { key: "uploaded", label: "Uploaded", state: "done" },
    { key: "youtube", label: "On YouTube", state: youtube },
    { key: "ready", label: "Ready", state: ready },
  ];
  if (playlistId) {
    const ps = row.youtube_playlist_status;
    steps.push({
      key: "playlist",
      label: "In playlist",
      state:
        ps === "done" ? "done"
        : ps === "failed" ? "problem"
        : ps === "queued" ? "active"
        : onYoutube ? "problem"
        : "todo",
    });
  }

  const anyProblem = steps.some((s) => s.state === "problem");
  const neverSent = !row.youtube_status && !row.file_deleted_at && row.status !== "moved";
  const needsAttention = anyProblem || neverSent || !!input.missingDetails;

  let badge: FilmViewBadge;
  if (anyProblem) badge = { text: "Needs attention", tone: "problem" };
  else if (steps.every((s) => s.state === "done")) badge = { text: "Done", tone: "done" };
  else if (steps.some((s) => s.state === "active")) badge = { text: "In progress", tone: "active" };
  else if (neverSent) badge = { text: "Not on YouTube", tone: "problem" };
  else badge = { text: "Waiting", tone: "waiting" };

  const originalGone = !!row.file_deleted_at;
  let originalNote: string;
  if (originalGone) {
    originalNote = "Original file removed after YouTube had it.";
  } else if (row.status === "moved" && row.moved_at) {
    originalNote = `Original file will be removed ${shortDate(new Date(row.moved_at).getTime() + MOVED_RETENTION_DAYS * DAY_MS)}.`;
  } else if (onYoutube && p === "processed" && row.youtube_updated_at) {
    originalNote = `Original file kept until ${shortDate(new Date(row.youtube_updated_at).getTime() + ORIGINAL_KEEP_DAYS * DAY_MS)}.`;
  } else {
    originalNote = "Original file kept until YouTube has it.";
  }

  return { steps, badge, needsAttention, originalGone, originalNote };
}

type FilmViewBadge = FilmFlowView["badge"];

// A streamed game (0179): the livestream on YouTube, no file, no playlist.
// It waits for the recording rather than for anyone to step in.
function streamedFlowView(row: Pick<FilmUpload, "youtube_processing">, missingDetails: boolean): FilmFlowView {
  const p = row.youtube_processing;
  const ready: FilmStepState =
    p === "processed" ? "done"
    : p === "failed" || p === "rejected" || p === "deleted" || p === "missing" ? "problem"
    : "active";
  const steps: FilmStep[] = [
    { key: "streamed", label: "Streamed", state: "done" },
    { key: "ready", label: "Ready", state: ready },
  ];
  const problem = ready === "problem";
  return {
    steps,
    badge: problem ? { text: "Needs attention", tone: "problem" } : { text: "Streamed", tone: "waiting" },
    needsAttention: problem || missingDetails,
    originalGone: true,
    originalNote: "The livestream on YouTube. A recording of this game replaces it once it's on YouTube.",
  };
}
