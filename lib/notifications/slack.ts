// Server-only. Posts notifications to Slack via the Bot Token API. Mirrors
// the Resend email helpers in shape and graceful-degradation behavior:
// no-ops if SLACK_BOT_TOKEN or SLACK_NOTIFY_CHANNEL_ID is missing, so the
// rest of the app keeps working before Slack is wired up.
//
// Bot token (not incoming webhooks) so a single Slack app install can later
// fan out to per-area channels — see [[project-phase2-backlog]] — without
// redoing the transport wiring.

const SLACK_ENDPOINT = "https://slack.com/api/chat.postMessage";

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackResponse {
  ts?: string;
  channel?: string;
  ok?: boolean;
  error?: string;
}

async function postSlackMessage(
  channel: string,
  text: string,
  blocks: SlackBlock[],
  context: string,
): Promise<{ ts: string; channel: string } | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null; // caller already guarded; defensive

  const res = await fetch(SLACK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, blocks }),
  });

  // Slack returns HTTP 200 even on logical failures (invalid_auth,
  // channel_not_found, not_in_channel). Must check body.ok to know if the
  // message actually went through.
  let body: SlackResponse = {};
  try {
    body = (await res.json()) as SlackResponse;
  } catch {
    /* non-JSON body — leave body empty, error logged below */
  }
  if (!res.ok || body.ok === false) {
    console.error(
      `[slack] postMessage failed (${context}) status=${res.status} ok=${body.ok}: ${body.error ?? "unknown"}`,
    );
    return null;
  }
  // ts identifies the message — thread replies carry it as thread_ts, which
  // is how /api/slack/events routes them back to the task (B2).
  return body.ts && body.channel ? { ts: body.ts, channel: body.channel } : null;
}

export async function sendNewTicketSlack({
  ticketId,
  submitterEmail,
  submitterName,
  categoryName,
  areaName,
  priorityLabel,
  description,
}: {
  ticketId: string;
  submitterEmail: string | null;
  submitterName: string | null;
  categoryName: string | null;
  areaName: string | null;
  priorityLabel: string | null;
  description: string;
}): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping new-task Slack message");
    return;
  }
  const channel = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (!channel) {
    console.warn("[slack] SLACK_NOTIFY_CHANNEL_ID not set — skipping new-task Slack message");
    return;
  }

  const submitterLine = submitterName ?? submitterEmail ?? "(anonymous)";
  const category = categoryName ?? "Task";
  const priority = priorityLabel ?? "no priority";
  const fallback = `New task — ${category}${areaName ? ` · ${areaName}` : ""} (${priority})`;

  // Area is optional post-reframe (only Maintenance tasks carry one), so the
  // Area field only appears when it's set.
  const fields = [
    { type: "mrkdwn", text: `*Category*\n${slackEscape(category)}` },
    { type: "mrkdwn", text: `*Priority*\n${slackEscape(priority)}` },
    ...(areaName ? [{ type: "mrkdwn", text: `*Area*\n${slackEscape(areaName)}` }] : []),
    { type: "mrkdwn", text: `*Submitted by*\n${slackEscape(submitterLine)}` },
  ];

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "New task", emoji: false },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: blockquote(description) },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in portal" },
          url: `${siteUrl()}/portal/tasks`,
        },
      ],
    },
  ];

  const posted = await postSlackMessage(channel, fallback, blocks, `ticket ${ticketId}`);

  // B2: remember where the message landed so Slack thread replies can be
  // routed back into this task's comments. Tolerant pre-0053: a missing
  // column just logs and moves on.
  if (posted) {
    try {
      const { createAdminClient } = await import("../supabase/admin");
      const admin = createAdminClient();
      const { error } = await admin
        .from("maintenance_requests")
        .update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts })
        .eq("id", ticketId);
      if (error) console.warn("[slack] couldn't store thread anchor (apply 0053?):", error.message);
    } catch (err) {
      console.warn("[slack] thread anchor store failed:", err);
    }
  }
}

export async function sendAccessRequestSlack({
  email,
  fullName,
}: {
  email: string;
  fullName: string | null;
}): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping access-request Slack message");
    return;
  }
  const channel = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (!channel) {
    console.warn("[slack] SLACK_NOTIFY_CHANNEL_ID not set — skipping access-request Slack message");
    return;
  }

  const name = fullName ?? "(no name provided)";
  const fallback = `New portal access request — ${fullName ?? email}`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "New portal access request", emoji: false },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Name:* ${slackEscape(name)}\n*Email:* ${slackEscape(email)}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Review in portal" },
          url: `${siteUrl()}/portal/settings`,
        },
      ],
    },
  ];

  await postSlackMessage(channel, fallback, blocks, `access-request ${email}`);
}

export async function sendLowStockSlack({
  supplyName,
  unit,
  onHand,
  threshold,
  vendorName,
  reorderNote,
}: {
  supplyName: string;
  unit: string;
  onHand: number;
  threshold: number;
  vendorName?: string | null;
  reorderNote?: string | null;
}): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping low-stock Slack message");
    return;
  }
  const channel = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (!channel) {
    console.warn("[slack] SLACK_NOTIFY_CHANNEL_ID not set — skipping low-stock Slack message");
    return;
  }

  const fallback = `Low stock — ${supplyName}: ${onHand} ${unit} left (reorder at ${threshold})`;
  const lines = [
    `*${slackEscape(supplyName)}* is down to *${onHand} ${slackEscape(unit)}* (reorder at ${threshold}).`,
    vendorName ? `*Reorder from:* ${slackEscape(vendorName)}` : "_No reorder vendor set for this supply._",
    reorderNote ? `*Note:* ${slackEscape(reorderNote)}` : null,
  ].filter(Boolean);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Low stock", emoji: false },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Manage supplies" },
          url: `${siteUrl()}/portal/settings`,
        },
      ],
    },
  ];

  await postSlackMessage(channel, fallback, blocks, `low-stock ${supplyName}`);
}

export interface SlackEventRef {
  id: string;
  title: string;
  whenLabel?: string;
}

// Post a plain message to a channel, optionally followed by a "For event …"
// context line + an "Open event" button. Shared by the shutdown-wizard FYIs
// (completion, assignment, cover-request). No @-mention. Returns whether it
// went through.
async function postEventLinkedMessage(
  channel: string,
  message: string,
  event: SlackEventRef | undefined,
  context: string,
): Promise<boolean> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn(`[slack] SLACK_BOT_TOKEN not set — skipping ${context} message`);
    return false;
  }
  if (!channel) return false;

  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: slackEscape(message) } },
  ];
  if (event) {
    const when = event.whenLabel ? ` · ${slackEscape(event.whenLabel)}` : "";
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `For event: *${slackEscape(event.title)}*${when}` }],
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open event" },
          url: `${siteUrl()}/portal/events/${event.id}/edit`,
        },
      ],
    });
  }

  const posted = await postSlackMessage(channel, message, blocks, context);
  return posted != null;
}

// Procedure-wizard completion: an FYI posted when someone finishes a run.
export async function sendProcedureCompletionSlack({
  channel,
  message,
  event,
}: {
  channel: string;
  message: string;
  event?: SlackEventRef;
}): Promise<boolean> {
  return postEventLinkedMessage(channel, message, event, "procedure completion");
}

// Shutdown assignment heads-up (Phase 2b): who's on shutdown for an event.
export async function sendShutdownAssignedSlack({
  channel,
  assigneeName,
  event,
}: {
  channel: string;
  assigneeName: string;
  event?: SlackEventRef;
}): Promise<boolean> {
  return postEventLinkedMessage(
    channel,
    `🔒 *${assigneeName}* is on building shutdown.`,
    event,
    "shutdown assigned",
  );
}

// Shutdown cover-request (Phase 2b): the assignee opted out — ask the team.
export async function sendShutdownCoverRequestSlack({
  channel,
  formerAssigneeName,
  event,
}: {
  channel: string;
  formerAssigneeName: string | null;
  event?: SlackEventRef;
}): Promise<boolean> {
  const who = formerAssigneeName ? `*${formerAssigneeName}*` : "The assignee";
  return postEventLinkedMessage(
    channel,
    `⚠️ ${who} can't cover this building shutdown — can someone take it?`,
    event,
    "shutdown cover request",
  );
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

// Slack mrkdwn requires escaping `<`, `>`, `&` — same shape as HTML entities.
function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Prefix each line with `> ` for Slack mrkdwn blockquote rendering. Truncate
// to keep the section block text comfortably under Slack's ~3000-char limit
// after the prefixes are added.
function blockquote(s: string): string {
  const MAX = 2800;
  const truncated = s.length > MAX ? s.slice(0, MAX) + "…" : s;
  return slackEscape(truncated)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
