// Slack Channel Archive — message viewer for one registered channel.
// Super-admin only; re-checked here (not just at /portal/slack-archive) so a
// direct link can't bypass the gate.

import { notFound } from "next/navigation";
import Link from "next/link";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import {
  loadArchiveViewer,
  loadArchiveChannels,
  loadArchiveChannelMessages,
  type ArchiveMessage,
} from "../../../../lib/slack-archive/data";
import type { ArchivedFile } from "../../../../lib/slack-archive/files";
import { MessageList } from "./MessageList";

export default async function SlackArchiveChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  await loadArchiveViewer();
  const { channelId } = await params;
  const slackChannelId = decodeURIComponent(channelId);

  const [channels, threads] = await Promise.all([
    loadArchiveChannels(),
    loadArchiveChannelMessages(slackChannelId),
  ]);
  const channel = channels.find((c) => c.slack_channel_id === slackChannelId);
  if (!channel) notFound();

  const failedFiles = threads
    .flatMap((t) => [t.parent, ...t.replies])
    .flatMap((m) => (m.files ?? []).filter((f) => f.error).map((f) => ({ file: f, message: m })));

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/portal/slack-archive"
        style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        ← All channels
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", margin: "4px 0 24px" }}>
        {channel.label}
      </h1>

      {failedFiles.length > 0 && <FailedFilesPanel items={failedFiles} />}

      {threads.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {channel.last_run_at ? "No messages archived yet." : "Not synced yet — run the backfill script or wait for the nightly cron."}
          </div>
        </div>
      ) : (
        <MessageList threads={threads} />
      )}
    </div>
  );
}

// Attachments that couldn't be self-hosted (too large, no downloadable URL,
// a storage key Supabase rejected, etc.) fall back to their Slack permalink
// automatically, so nothing is lost — but there's no other way to know
// *which* files those are or why without this panel. Case-by-case fixes:
// raise the bucket's max file size, or just accept the permalink fallback.
function FailedFilesPanel({
  items,
}: {
  items: { file: ArchivedFile; message: ArchiveMessage }[];
}) {
  return (
    <details
      className="rsd-card"
      style={{ padding: "12px 18px", marginBottom: 20, borderColor: "rgba(229,62,62,.25)" }}
    >
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--gw-error)" }}>
        {items.length} attachment{items.length === 1 ? "" : "s"} need attention
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {items.map(({ file, message }) => {
          const time = new Date(message.posted_at).toLocaleString(undefined, {
            year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
          });
          return (
            <div
              key={`${message.id}-${file.id}`}
              style={{ fontSize: 12.5, borderTop: "1px solid var(--gw-border)", paddingTop: 10 }}
            >
              {/* The message itself, not the (possibly empty) file name, is the
                  reliable jump target — some degraded Slack file stubs (the
                  same ones missing url_private) also have no name at all. */}
              <a href={`#msg-${message.ts}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                <div style={{ fontWeight: 700, color: "var(--gw-fg)" }}>
                  {message.author_name ?? "Unknown"} <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>· {time}</span>
                </div>
                {message.message_text && (
                  <div style={{ color: "var(--gw-fg-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {message.message_text}
                  </div>
                )}
              </a>
              <div style={{ color: "var(--gw-error)", marginTop: 6, fontWeight: 600 }}>
                {file.name || "(unnamed attachment)"} — {file.error}
              </div>
              <div style={{ marginTop: 2 }}>
                <a href={`#msg-${message.ts}`} style={{ color: "var(--rsd-accent)" }}>
                  Jump to message
                </a>
                {file.permalink && (
                  <>
                    {" · "}
                    <a href={file.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
                      Open in Slack
                    </a>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
