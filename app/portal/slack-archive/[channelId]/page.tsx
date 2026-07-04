// Slack Channel Archive — message viewer for one registered channel.
// Super-admin only; re-checked here (not just at /portal/slack-archive) so a
// direct link can't bypass the gate.

import { notFound } from "next/navigation";
import Link from "next/link";
import * as emoji from "node-emoji";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import {
  loadArchiveViewer,
  loadArchiveChannels,
  loadArchiveChannelMessages,
  type ArchiveMessage,
  type ArchiveThread,
} from "../../../../lib/slack-archive/data";
import type { ArchivedFile } from "../../../../lib/slack-archive/files";

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

  const grouped = groupByDay(threads);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {grouped.map(([day, dayThreads]) => (
            <div key={day}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gw-fg-muted)", letterSpacing: ".03em", marginBottom: 10 }}>
                {day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dayThreads.map((t) => (
                  <ThreadCard key={t.parent.id} thread={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
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
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
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
                {" · "}
                <a href={file.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
                  Open in Slack
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function groupByDay(threads: ArchiveThread[]): [string, ArchiveThread[]][] {
  const byDay = new Map<string, ArchiveThread[]>();
  for (const t of threads) {
    const day = new Date(t.parent.posted_at).toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: CHURCH_TZ,
    });
    const list = byDay.get(day) ?? [];
    list.push(t);
    byDay.set(day, list);
  }
  return Array.from(byDay.entries());
}

function ThreadCard({ thread }: { thread: ArchiveThread }) {
  return (
    <div className="rsd-card" style={{ padding: "14px 18px", gap: 10 }}>
      <MessageRow message={thread.parent} />
      {thread.replies.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 20, paddingLeft: 14, borderLeft: "2px solid var(--gw-border)" }}>
          {thread.replies.map((r) => (
            <MessageRow key={r.id} message={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: ArchiveMessage }) {
  const time = new Date(message.posted_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ });
  return (
    <div id={`msg-${message.ts}`} style={{ display: "flex", flexDirection: "column", gap: 4, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
          {message.author_name ?? "Unknown"}
        </span>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {time}{message.edited ? " (edited)" : ""}
        </span>
      </div>
      {message.message_text && (
        <div style={{ fontSize: 13.5, color: "var(--gw-fg)", lineHeight: 1.5 }}>
          <MarkdownView>{message.message_text}</MarkdownView>
        </div>
      )}
      {message.files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {message.files.map((f) => (
            <a
              key={f.id}
              href={f.permalink}
              target="_blank"
              rel="noopener noreferrer"
              title={f.error ?? undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, color: f.error ? "var(--gw-error)" : "var(--rsd-accent)",
                background: "var(--gw-bg-elev)",
                border: `1px solid ${f.error ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
                borderRadius: 8, padding: "4px 10px", textDecoration: "none",
              }}
            >
              {f.error ? <Icons.AlertCircle width={13} height={13} /> : <Icons.FileText width={13} height={13} />}
              {f.name}
            </a>
          ))}
        </div>
      )}
      {message.reactions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {message.reactions.map((r) => {
            const names = r.users.map((u) => u.name ?? "Someone").join(", ");
            // Slack's shortcode names mostly match the standard emoji-shortcode
            // set node-emoji knows; workspace-custom emoji have no Unicode
            // equivalent and fall back to the :name: text, same as before.
            const glyph = emoji.get(r.name.split("::")[0]);
            return (
              <span
                key={r.name}
                title={names}
                style={{
                  fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)",
                  background: "var(--gw-bg-elev)", borderRadius: 6, padding: "2px 6px",
                }}
              >
                {glyph ? <span style={{ fontSize: 13 }}>{glyph}</span> : `:${r.name}:`} {r.count} — {names}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
