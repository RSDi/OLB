"use server";

// Lets a super admin kick off the large-file compression sweep
// (.github/workflows/slack-archive-compress.yml) straight from the
// exceptions page, instead of needing GitHub's own Actions UI. The
// compression itself still runs on GitHub Actions, not here — Vercel's
// serverless functions have no ffmpeg binary and a 60s duration cap,
// nowhere near enough for video transcoding (see
// scripts/slack-archive-compress-large-files.ts for why). This just fires
// the same workflow_dispatch event a manual "Run workflow" click would,
// via GitHub's REST API.

import { getViewer } from "../auth/viewer";

const REPO_OWNER = "jeffmalone";
const REPO_NAME = "mcc";
const WORKFLOW_FILE = "slack-archive-compress.yml";
const GITHUB_API_VERSION = "2022-11-28";

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

export async function triggerCompressionWorkflow(): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return { error: "GITHUB_ACTIONS_TOKEN is not configured on the server." };

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("[slack-archive] workflow dispatch failed:", res.status, body?.message);
    return { error: body?.message ?? `GitHub API returned HTTP ${res.status}` };
  }
  return {};
}

export interface CompressionRunStatus {
  status: string; // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | ... | null while not yet completed
  htmlUrl: string;
  createdAt: string;
}

// Best-effort — returns null on any failure (missing token, API error, no
// runs yet) so the exceptions page can just omit the status line rather
// than showing an error for what's a purely informational extra.
export async function loadLatestCompressionRun(): Promise<CompressionRunStatus | null> {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) return null;

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
      { headers: githubHeaders(token), cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      workflow_runs?: { status: string; conclusion: string | null; html_url: string; created_at: string }[];
    };
    const run = body.workflow_runs?.[0];
    if (!run) return null;
    return { status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url, createdAt: run.created_at };
  } catch (err) {
    console.error("[slack-archive] loading latest compression run failed:", err);
    return null;
  }
}
