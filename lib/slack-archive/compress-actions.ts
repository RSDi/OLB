"use server";

// Lets a super admin kick off the large-file compression sweep
// (.github/workflows/slack-archive-compress.yml) straight from the
// exceptions page, instead of needing GitHub's own Actions UI. The
// compression itself still runs on GitHub Actions, not here — Vercel's
// serverless functions have no ffmpeg binary and a 60s duration cap,
// nowhere near enough for video transcoding (see
// scripts/slack-archive-compress-large-files.ts for why). This just fires
// the same workflow_dispatch event a manual "Run workflow" click would,
// via GitHub's REST API (see github-workflows.ts).

import { getViewer } from "../auth/viewer";
import { dispatchWorkflow, fetchLatestWorkflowRun, type WorkflowRunStatus } from "./github-workflows";

const WORKFLOW_FILE = "slack-archive-compress.yml";

export async function triggerCompressionWorkflow(): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };
  return dispatchWorkflow(WORKFLOW_FILE);
}

export type CompressionRunStatus = WorkflowRunStatus;

// Best-effort — returns null on any failure (missing token, API error, no
// runs yet) so the exceptions page can just omit the status line rather
// than showing an error for what's a purely informational extra.
export async function loadLatestCompressionRun(): Promise<CompressionRunStatus | null> {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) return null;
  return fetchLatestWorkflowRun(WORKFLOW_FILE);
}
