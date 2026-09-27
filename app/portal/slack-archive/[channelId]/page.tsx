// Slack Channel Archive — message viewer for one registered channel.
// Any approved member, but only for channels they may see: the channel list
// is loaded through row-level security (migration 0084), so a private
// channel the viewer isn't in is simply absent and a direct link 404s —
// its messages are filtered out by the same policy regardless.
//
// Attachment errors are surfaced only on /portal/slack-archive/exceptions
// now, not duplicated here too — one place to manage them across every
// channel instead of needing to click into each one to check.

import { notFound } from "next/navigation";
import Link from "next/link";
import { loadArchiveViewer, loadArchiveChannels, loadArchiveChannelMessages } from "../../../../lib/slack-archive/data";
import { MessageList } from "./MessageList";
import { SyncNowButton } from "./SyncNowButton";
import { ChannelSwitcher } from "./ChannelSwitcher";

// Server Actions inherit their page's maxDuration (see SyncNowButton's
// syncChannelNow call) — without this, the platform default (as low as 10s
// on some plans) would cut off a sync well before its own 50s deadline.
export const maxDuration = 60;

export default async function SlackArchiveChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const viewer = await loadArchiveViewer();
  const { channelId } = await params;
  const slackChannelId = decodeURIComponent(channelId);

  const [channels, threads] = await Promise.all([
    loadArchiveChannels(),
    loadArchiveChannelMessages(slackChannelId),
  ]);
  const channel = channels.find((c) => c.slack_channel_id === slackChannelId);
  if (!channel) notFound();

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link
          href="/portal/slack-archive"
          style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
        >
          ← All channels
        </Link>
        <div style={{ display: "flex", gap: 16 }}>
          <Link
            href={`/portal/slack-archive/album?channel=${encodeURIComponent(slackChannelId)}`}
            className="rsd-link"
            style={{ fontSize: 12 }}
          >
            Photos →
          </Link>
          {viewer.isSuperAdmin && (
            <Link
              href="/portal/slack-archive/exceptions"
              className="rsd-link"
              style={{ fontSize: 12 }}
            >
              View exceptions →
            </Link>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, margin: "4px 0 24px" }}>
        <ChannelSwitcher
          channels={channels.map((c) => ({ slackChannelId: c.slack_channel_id, label: c.label, active: c.active }))}
          currentChannelId={slackChannelId}
        />
        {viewer.isSuperAdmin && <SyncNowButton slackChannelId={slackChannelId} />}
      </div>

      {threads.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {channel.last_run_at ? "No messages archived yet." : "Not synced yet — run the backfill script or wait for the nightly cron."}
          </div>
        </div>
      ) : (
        <MessageList threads={threads} channelId={slackChannelId} />
      )}
    </div>
  );
}
