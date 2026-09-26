// GitHub Actions plumbing shared by the archive's "run it now" buttons: the
// exceptions page's compression trigger (compress-actions.ts) and the photo
// album's preview trigger (thumbnail-actions.ts). The heavy work runs on
// GitHub Actions; these just fire a workflow_dispatch — the same event a
// manual "Run workflow" click sends — and read the latest run's status.
//
// Deliberately NOT a "use server" module: every export of one of those
// becomes a Server Action any client can call, and a helper taking a
// workflow file name would let a caller dispatch any workflow in the repo.
// The action modules wrap these with their own super-admin check and a
// fixed workflow file.

const REPO_OWNER = "jeffmalone";
const REPO_NAME = "mcc";
const GITHUB_API_VERSION = "2022-11-28";

export interface WorkflowRunStatus {
  status: string; // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | ... | null while not yet completed
  htmlUrl: string;
  createdAt: string;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

export async function dispatchWorkflow(workflowFile: string): Promise<{ error?: string }> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return { error: "GITHUB_ACTIONS_TOKEN is not configured on the server." };

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error(`[slack-archive] ${workflowFile} dispatch failed:`, res.status, body?.message);
    return { error: body?.message ?? `GitHub API returned HTTP ${res.status}` };
  }
  return {};
}

// Best-effort — null on any failure (missing token, API error, no runs yet)
// so pages can simply omit the status line rather than show an error for a
// purely informational extra.
export async function fetchLatestWorkflowRun(workflowFile: string): Promise<WorkflowRunStatus | null> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}/runs?per_page=1`,
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
    console.error(`[slack-archive] loading latest ${workflowFile} run failed:`, err);
    return null;
  }
}
