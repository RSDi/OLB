"use server";

// Lets a super admin start the album-preview job
// (.github/workflows/slack-archive-thumbnails.yml) from the photo album
// instead of waiting for its nightly run — most useful right after a big
// backfill, while the album is still loading full-size originals. Same shape
// as compress-actions.ts: the work runs on GitHub Actions (sharp + ffmpeg,
// no serverless time limit); this only fires and polls the workflow.

import { getViewer } from "../auth/viewer";
import { dispatchWorkflow, fetchLatestWorkflowRun, type WorkflowRunStatus } from "./github-workflows";

const WORKFLOW_FILE = "slack-archive-thumbnails.yml";

export async function triggerThumbnailWorkflow(): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };
  return dispatchWorkflow(WORKFLOW_FILE);
}

export async function loadLatestThumbnailRun(): Promise<WorkflowRunStatus | null> {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) return null;
  return fetchLatestWorkflowRun(WORKFLOW_FILE);
}
