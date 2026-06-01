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
  ok?: boolean;
  error?: string;
}

async function postSlackMessage(
  channel: string,
  text: string,
  blocks: SlackBlock[],
  context: string,
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return; // caller already guarded; defensive

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
  }
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

  await postSlackMessage(channel, fallback, blocks, `ticket ${ticketId}`);
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
