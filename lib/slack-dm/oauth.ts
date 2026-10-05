// "Connect Slack" for Slack DMs (0118): the OAuth round trip that gets a
// sender their own Slack user token. /api/slack/connect starts it and
// /api/slack/connect/callback finishes it. Server-only.
//
// This is Slack's ordinary OAuth (oauth.v2.access) for user scopes, not the
// "Continue with Slack" sign-in, which only allows profile scopes. Same Slack
// app, same Client ID and Secret; the callback URL is in the manifest
// (lib/slack/app-manifest.ts).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CONNECT_OUTCOMES } from "./recipients";

export const CONNECT_COOKIE = "olb_slack_connect";
export const CONNECT_PATH = "/api/slack/connect";
export const CALLBACK_PATH = "/api/slack/connect/callback";

// The state sent to Slack, and the cookie that proves this browser asked
// for it: the state's hash, and where to come back to.
export function newState(): string {
  return randomBytes(24).toString("hex");
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function stateCookie(state: string, next: string): string {
  return JSON.stringify({ h: hash(state), next });
}

export function readStateCookie(raw: string | undefined, state: string | null): { next: string } | null {
  if (!raw || !state) return null;
  let parsed: { h?: unknown; next?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.h !== "string" || typeof parsed.next !== "string") return null;
  const a = Buffer.from(parsed.h);
  const b = Buffer.from(hash(state));
  return a.length === b.length && timingSafeEqual(a, b) ? { next: parsed.next } : null;
}

// The page to land on, with what happened: ?slack=connected, or an error.
export function backTo(origin: string, next: string, outcome: string): URL {
  const url = new URL(next, origin);
  url.searchParams.set("slack", outcome);
  return url;
}

// The pop-up's last page: tells the page that opened it how it went, and
// closes. If it can't close (opened as a tab), it says so and links back.
export function popupPage(outcome: string): Response {
  const text = CONNECT_OUTCOMES[outcome] ?? CONNECT_OUTCOMES.failed;
  const data = JSON.stringify({ type: "slack-connect", outcome }).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slack</title>
<body style="font:15px/1.5 system-ui,sans-serif;padding:32px;max-width:420px;margin:auto">
<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p><p><a href="/portal/directory">Back to the portal</a></p>
<script>try{window.opener&&window.opener.postMessage(${data},location.origin)}catch(e){}window.close()</script>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
