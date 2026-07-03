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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, color: "var(--rsd-accent)",
                background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
                borderRadius: 8, padding: "4px 10px", textDecoration: "none",
              }}
            >
              <Icons.FileText width={13} height={13} />
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
