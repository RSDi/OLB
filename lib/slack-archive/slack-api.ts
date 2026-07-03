// Minimal Slack Web API client for the archive feature.
//
// Deliberately self-contained — not shared with lib/notifications/slack.ts
// or app/api/slack/events/route.ts, even though a couple of helpers
// (users.info + email-to-member matching) are similar to what already
// exists there. This feature is meant to be removable as a unit; sharing
// code with the notification path would mean untangling that on the way
// out. See supabase/migrations/0077_slack_archive.sql for the same
// isolation rationale applied to the schema.
//
// Reuses the existing SLACK_BOT_TOKEN (mccsaints workspace, already
// configured for outbound notifications) — this is the first caller of
// conversations.history/replies, a higher-volume (Tier 3) surface than the
// single chat.postMessage call elsewhere, so unlike that code this client
// handles 429s.

const SLACK_API_BASE = "https://slack.com/api";

export interface SlackReaction {
  name: string;
  count: number;
  users: string[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  url_private?: string; // absent for some file types (e.g. certain external/unfurled files)
  permalink: string;
}

export interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  edited?: { user: string; ts: string };
  reactions?: SlackReaction[];
  files?: SlackFile[];
  [key: string]: unknown;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  messages?: SlackMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Slack returns HTTP 200 even on logical failures (invalid_auth,
// missing_scope, not_in_channel) — body.ok must be checked. 429s carry a
// Retry-After header telling us how long to back off.
async function slackApiCall(
  method: string,
  params: Record<string, string>,
  token: string,
  attempt = 0,
): Promise<SlackApiResponse> {
  const url = `${SLACK_API_BASE}/${method}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    if (attempt >= 5) {
      return { ok: false, error: "rate_limited_retries_exhausted" };
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 5;
    await sleep(retryAfter * 1000);
    return slackApiCall(method, params, token, attempt + 1);
  }

  const body = (await res.json()) as SlackApiResponse;
  if (!res.ok || !body.ok) {
    return { ok: false, error: body.error ?? `http_${res.status}` };
  }
  return body;
}

export interface HistoryPage {
  messages: SlackMessage[];
  nextCursor: string | null;
}

// oldest is exclusive-ish per Slack's semantics (messages with ts > oldest);
// undefined fetches from the beginning of the channel's history.
export async function fetchConversationsHistory(
  channel: string,
  token: string,
  opts: { oldest?: string; cursor?: string } = {},
): Promise<HistoryPage> {
  const params: Record<string, string> = { channel, limit: "200" };
  if (opts.oldest) params.oldest = opts.oldest;
  if (opts.cursor) params.cursor = opts.cursor;

  const body = await slackApiCall("conversations.history", params, token);
  if (!body.ok) throw new Error(`conversations.history failed: ${body.error}`);
  return {
    messages: body.messages ?? [],
    nextCursor: body.has_more ? (body.response_metadata?.next_cursor ?? null) : null,
  };
}

export async function fetchConversationsReplies(
  channel: string,
  threadTs: string,
  token: string,
  cursor?: string,
  oldest?: string,
): Promise<HistoryPage> {
  const params: Record<string, string> = { channel, ts: threadTs, limit: "200" };
  if (cursor) params.cursor = cursor;
  if (oldest) params.oldest = oldest;

  const body = await slackApiCall("conversations.replies", params, token);
  if (!body.ok) throw new Error(`conversations.replies failed: ${body.error}`);
  // The parent message is always included as the first reply — callers
  // already have it from conversations.history, so drop it here.
  const messages = (body.messages ?? []).filter((m) => m.ts !== threadTs);
  return {
    messages,
    nextCursor: body.has_more ? (body.response_metadata?.next_cursor ?? null) : null,
  };
}

export interface SlackUserInfo {
  email: string | null;
  name: string | null;
}

export async function fetchSlackUserInfo(userId: string, token: string): Promise<SlackUserInfo> {
  try {
    const body = (await slackApiCall("users.info", { user: userId }, token)) as SlackApiResponse & {
      user?: { real_name?: string; profile?: { email?: string; display_name?: string; real_name?: string } };
    };
    if (!body.ok || !body.user) return { email: null, name: null };
    const p = body.user.profile;
    return {
      email: p?.email ?? null,
      name: p?.display_name || p?.real_name || body.user.real_name || null,
    };
  } catch {
    return { email: null, name: null };
  }
}
