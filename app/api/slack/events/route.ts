// POST /api/slack/events — Slack Events API receiver (B2: two-way Slack).
//
// The notifier posts each new task to the notify channel
// (SLACK_NOTIFY_CHANNEL_ID) and stores the message's ts on the ticket (0053).
// When someone replies in that Slack thread, Slack delivers a message event
// here; we match thread_ts back to the ticket and append the reply to its
// comment history. People can talk where they already talk, and the task
// keeps the record.
//
// Authenticity: every request is verified against SLACK_SIGNING_SECRET
// (v0 HMAC-SHA256 over `v0:{timestamp}:{rawBody}`, timing-safe compare,
// 5-minute freshness window). Without the env var the endpoint refuses
// everything — fail closed, since anyone could otherwise inject comments.
//
// Author attribution: the Slack user's profile email (users.info, needs the
// users:read + users:read.email scopes) is matched to members.email. No
// match → the comment is kept with the Slack display name in
// external_author rather than dropped.
//
// Replays: Slack retries deliveries; ticket_comments.slack_ts has a unique
// index, so a replayed event inserts nothing (23505 → treated as success).
//
// Setup (once per site): the app manifest from `npm run slack-app-manifest`
// (lib/slack/app-manifest.ts) already points Event Subscriptions at
// https://<site>/api/slack/events for message.channels + message.groups and
// requests the scopes this needs. Copy the app's Signing Secret
// (api.slack.com/apps → Basic Information) into SLACK_SIGNING_SECRET,
// redeploy, then verify the Request URL in the app's settings — until the
// secret is live, Slack's verification request fails here with 401.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel?: string;
}

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
}

function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.warn("[slack-events] SLACK_SIGNING_SECRET not set — rejecting event");
    return false;
  }
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  if (!timestamp || !signature) return false;
  // Stale requests could be replays of captured traffic.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected =
    "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function slackUserInfo(userId: string): Promise<{ email: string | null; name: string | null }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { email: null, name: null };
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      ok?: boolean;
      user?: { real_name?: string; profile?: { email?: string; display_name?: string; real_name?: string } };
    };
    if (!body.ok || !body.user) return { email: null, name: null };
    const p = body.user.profile;
    return {
      email: p?.email ?? null,
      name: p?.display_name || p?.real_name || body.user.real_name || null,
    };
  } catch (err) {
    console.warn("[slack-events] users.info failed:", err);
    return { email: null, name: null };
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Slack's one-time URL verification handshake when enabling the endpoint.
  if (envelope.type === "url_verification") {
    return NextResponse.json({ challenge: envelope.challenge });
  }
  if (envelope.type !== "event_callback" || !envelope.event) {
    return NextResponse.json({ ok: true, skipped: "not an event" });
  }

  const ev = envelope.event;
  // Only human thread replies matter: skip our own bot posts, message edits
  // and other subtypes, and top-level messages (thread_ts equals ts on the
  // root message itself).
  if (
    ev.type !== "message" ||
    ev.bot_id ||
    ev.subtype ||
    !ev.thread_ts ||
    ev.thread_ts === ev.ts ||
    !ev.text?.trim() ||
    !ev.user
  ) {
    return NextResponse.json({ ok: true, skipped: "not a thread reply" });
  }

  const admin = createAdminClient();
  const { data: ticketRow, error: lookupErr } = await admin
    .from("maintenance_requests")
    .select("id")
    .eq("slack_message_ts", ev.thread_ts)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupErr) {
    // Pre-0053 schema or transient DB issue — 200 so Slack doesn't hammer us.
    console.warn("[slack-events] ticket lookup failed (apply 0053?):", lookupErr.message);
    return NextResponse.json({ ok: true, skipped: "lookup failed" });
  }
  if (!ticketRow) {
    return NextResponse.json({ ok: true, skipped: "no linked task" });
  }
  const ticketId = (ticketRow as { id: string }).id;

  // Attribute the comment: Slack profile email → member, else keep the name.
  const { email, name } = await slackUserInfo(ev.user);
  let authorId: string | null = null;
  if (email) {
    const { data: member } = await admin
      .from("members")
      .select("id")
      .ilike("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    authorId = (member as { id: string } | null)?.id ?? null;
  }

  const { error: insertErr } = await admin.from("ticket_comments").insert({
    ticket_id: ticketId,
    author_id: authorId,
    external_author: authorId ? null : `${name ?? "Someone"} (via Slack)`,
    body: ev.text.trim(),
    slack_ts: ev.ts ?? null,
  });
  if (insertErr) {
    // 23505 = unique violation on slack_ts: a Slack retry we already handled.
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: true, skipped: "duplicate delivery" });
    }
    console.error("[slack-events] comment insert failed:", insertErr.message);
    return NextResponse.json({ ok: true, skipped: "insert failed" });
  }

  try {
    revalidatePath(`/portal/tasks/${ticketId}`);
  } catch {
    /* revalidation is best-effort */
  }
  return NextResponse.json({ ok: true });
}
