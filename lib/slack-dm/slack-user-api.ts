// Server-only. The Slack Web API calls behind Slack DMs (0118), made with the
// sender's own user token (member_slack_connections), so a DM comes from
// them, and their replies land in their own Slack.
//
// Scopes, asked for by /api/slack/connect and listed in the app manifest
// (lib/slack/app-manifest.ts): users:read + users:read.email to find a parent
// by email, im:write to open the DM, chat:write to post in it.

import { SLACK_DM_USER_SCOPES } from "../slack/app-manifest";

const API = "https://slack.com/api/";

// Asked for when connecting; a connection missing any of them can't send.
export { SLACK_DM_USER_SCOPES };

// Errors that mean the connection itself no longer works: connect again.
const BROKEN = new Set(["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive", "missing_scope", "no_permission"]);

export class SlackTokenError extends Error {}

type SlackBody = { ok?: boolean; error?: string; [key: string]: unknown };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One call. Slack answers a busy method with 429 and a Retry-After: wait
// and try again, a few times. Logical failures come back as ok: false.
export async function slackCall(token: string, method: string, params: Record<string, string>, attempt = 0): Promise<SlackBody> {
  const res = await fetch(API + method, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: new URLSearchParams(params),
  });
  if (res.status === 429 && attempt < 4) {
    const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 1, 1), 20);
    await sleep(wait * 1000);
    return slackCall(token, method, params, attempt + 1);
  }
  let body: SlackBody;
  try {
    body = (await res.json()) as SlackBody;
  } catch {
    body = { ok: false, error: `http_${res.status}` };
  }
  if (body.ok === false && body.error && BROKEN.has(body.error)) throw new SlackTokenError(body.error);
  return body;
}

export interface SlackPerson {
  id: string;
  name: string;
}

// The Slack account with this email in the workspace, or null when there
// isn't one (or it's deactivated, or a bot).
export async function findSlackUser(token: string, email: string): Promise<SlackPerson | null> {
  const body = await slackCall(token, "users.lookupByEmail", { email });
  const user = body.user as { id?: string; deleted?: boolean; is_bot?: boolean; real_name?: string; name?: string; profile?: { display_name?: string; real_name?: string } } | undefined;
  if (!body.ok || !user?.id || user.deleted || user.is_bot) return null;
  return { id: user.id, name: user.profile?.real_name || user.real_name || user.profile?.display_name || user.name || "" };
}

// Opens (or finds) the 1:1 DM with them and posts the message there.
export async function sendDm(token: string, slackUserId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const open = await slackCall(token, "conversations.open", { users: slackUserId, return_im: "true" });
  const channel = (open.channel as { id?: string } | undefined)?.id;
  if (!open.ok || !channel) return { ok: false, error: open.error ?? "couldn't open the DM" };
  const post = await slackCall(token, "chat.postMessage", { channel, text, unfurl_links: "false", unfurl_media: "false" });
  if (!post.ok) return { ok: false, error: post.error ?? "unknown" };
  return { ok: true };
}

// Runs `fn` over the items a few at a time, keeping their order.
export async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}
