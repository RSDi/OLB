"use client";

import { useMemo, useState } from "react";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Pill } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import type { ArchiveMessage, ArchiveThread } from "../../../../lib/slack-archive/data";
import type { ArchivedFile } from "../../../../lib/slack-archive/files";
import { emojify, resolveEmojiShortcode } from "../../../../lib/slack-archive/emoji";
import { decodeSlackEntities } from "../../../../lib/slack-archive/text";
import { DateJumpCalendar } from "./DateJumpCalendar";
import { FilePreviewModal, type PreviewKind } from "./FilePreviewModal";
import { FilterDropdown } from "../_shared/FilterDropdown";

function isVideoFile(f: ArchivedFile): boolean {
  return (f.mimetype ?? "").startsWith("video/") || /\.(mp4|mov|webm|m4v|ogv)$/i.test(f.name || "");
}
function isImageFile(f: ArchivedFile): boolean {
  return (f.mimetype ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i.test(f.name || "");
}
function isAudioFile(f: ArchivedFile): boolean {
  return (f.mimetype ?? "").startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name || "");
}
// null for anything that isn't previewable in-page (docs, PDFs, etc.) — those
// still open in a new tab, same as before.
function previewKind(f: ArchivedFile): PreviewKind | null {
  if (isVideoFile(f)) return "video";
  if (isImageFile(f)) return "image";
  if (isAudioFile(f)) return "audio";
  return null;
}

interface DayGroup {
  dateKey: string; // YYYY-MM-DD in CHURCH_TZ — stable id for sorting/jump-anchors
  label: string;   // "Saturday, February 24, 2024" — display only
  threads: ArchiveThread[];
}

// Most Slack messages are one short plain-text line — running the full
// react-markdown + remark-gfm + rehype-raw + rehype-sanitize pipeline on
// every single one adds up fast on a channel with hundreds/thousands of
// messages. Skip it (and render as plain text) unless the message actually
// contains something Markdown would do anything with; newlines route
// through Markdown too since a plain white-space:pre-wrap div renders
// multi-paragraph text slightly differently than proper paragraph tags.
// A bare URL with no other markdown syntax and no newline (a single-line
// "just a link" message) also needs to route through Markdown — remark-gfm
// autolinks it, but only messages that reach MarkdownView in the first
// place get that treatment.
const MARKDOWN_SYNTAX = /[*_~`[\]()#>]|\n|https?:\/\//;
function needsMarkdown(text: string): boolean {
  return MARKDOWN_SYNTAX.test(text);
}

// en-CA formats as ISO (YYYY-MM-DD), matching the convention lib/dates/today.ts
// already established for church-local date keys.
function groupByDay(threads: ArchiveThread[]): DayGroup[] {
  const byDay = new Map<string, DayGroup>();
  for (const t of threads) {
    const d = new Date(t.parent.posted_at);
    const dateKey = d.toLocaleDateString("en-CA", { timeZone: CHURCH_TZ });
    const existing = byDay.get(dateKey);
    if (existing) {
      existing.threads.push(t);
    } else {
      const label = d.toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: CHURCH_TZ,
      });
      byDay.set(dateKey, { dateKey, label, threads: [t] });
    }
  }
  return Array.from(byDay.values());
}

// Tallies every author across both parents and replies — the same
// count-and-sort convention as the search page's author chips.
function countAuthors(threads: ArchiveThread[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of threads) {
    for (const m of [t.parent, ...t.replies]) {
      const name = m.author_name ?? "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function MessageList({ threads, channelId }: { threads: ArchiveThread[]; channelId: string }) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<null | "author">(null);

  const authorCounts = useMemo(() => countAuthors(threads), [threads]);

  // Whole-thread inclusion, not top-level-only: a thread stays visible if
  // ANY message in it (parent or a reply) was authored by someone selected,
  // so filtering never leaves an orphaned reply whose parent got hidden, or
  // a parent whose replies mysteriously vanished.
  const filteredThreads = useMemo(() => {
    if (selectedAuthors.length === 0) return threads;
    const selected = new Set(selectedAuthors);
    return threads.filter((t) => [t.parent, ...t.replies].some((m) => selected.has(m.author_name ?? "Unknown")));
  }, [threads, selectedAuthors]);

  const groups = useMemo(() => {
    const ascending = groupByDay(filteredThreads); // threads already arrive oldest-first
    if (sortOrder === "asc") return ascending;
    // Newest-first: flip both the day order and the order of threads within
    // each day. Replies inside a thread stay chronological — reversing a
    // conversation's own back-and-forth would just be confusing to read.
    return [...ascending].reverse().map((g) => ({ ...g, threads: [...g.threads].reverse() }));
  }, [filteredThreads, sortOrder]);

  function jumpToDate(date: string) {
    document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div
        className="rsd-slack-sticky-bar"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}
      >
        <Pill
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
        >
          {sortOrder === "asc" ? "Oldest first ↓" : "Newest first ↑"}
        </Pill>
        <DateJumpCalendar dates={groups.map((g) => g.dateKey)} onSelect={jumpToDate} />
        {authorCounts.length > 0 && (
          <FilterDropdown
            label="Filter"
            items={authorCounts.map((a) => ({ id: a.name, label: a.name, count: a.count }))}
            selected={selectedAuthors}
            onChange={setSelectedAuthors}
            open={openDropdown === "author"}
            onOpenChange={() => setOpenDropdown((v) => (v === "author" ? null : "author"))}
            searchPlaceholder="Search users…"
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {groups.map((g) => (
          <div key={g.dateKey} id={`day-${g.dateKey}`} style={{ scrollMarginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gw-fg-muted)", letterSpacing: ".03em", marginBottom: 10 }}>
              {g.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.threads.map((t) => (
                <ThreadCard key={t.parent.id} thread={t} channelId={channelId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadCard({ thread, channelId }: { thread: ArchiveThread; channelId: string }) {
  return (
    <div className="rsd-card" style={{ padding: "14px 18px", gap: 10 }}>
      <MessageRow message={thread.parent} channelId={channelId} />
      {thread.replies.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 20, paddingLeft: 14, borderLeft: "2px solid var(--gw-border)" }}>
          {thread.replies.map((r) => (
            <MessageRow key={r.id} message={r} channelId={channelId} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message, channelId }: { message: ArchiveMessage; channelId: string }) {
  const time = new Date(message.posted_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ });
  const messageText = decodeSlackEntities(message.message_text);
  const [playingFile, setPlayingFile] = useState<ArchivedFile | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/portal/slack-archive/${encodeURIComponent(channelId)}#msg-${message.ts}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied (e.g. insecure context) — nothing
      // more to do; the icon just silently won't confirm a copy.
    }
  }

  return (
    <div id={`msg-${message.ts}`} style={{ display: "flex", flexDirection: "column", gap: 4, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
          {message.author_name ?? "Unknown"}
        </span>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {time}{message.edited ? " (edited)" : ""}
        </span>
        <button
          type="button"
          onClick={copyLink}
          title={linkCopied ? "Link copied!" : "Copy link to this message"}
          className="gw-press"
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center",
            background: "none", border: "none", cursor: "pointer", padding: 2,
            color: linkCopied ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
          }}
        >
          {linkCopied ? <Icons.CheckCircle width={13} height={13} /> : <Icons.Link width={13} height={13} />}
        </button>
      </div>
      {messageText && (
        <div className="rsd-slack-msg-text" style={{ fontSize: 13.5, color: "var(--gw-fg)", lineHeight: 1.5 }}>
          {needsMarkdown(messageText) ? (
            <MarkdownView>{emojify(messageText)}</MarkdownView>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{emojify(messageText)}</div>
          )}
        </div>
      )}
      {message.files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {message.files.map((f) => {
            const chipStyle: React.CSSProperties = {
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: f.error ? "var(--gw-error)" : "var(--rsd-accent)",
              background: "var(--gw-bg-elev)",
              border: `1px solid ${f.error ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
              borderRadius: 8, padding: "4px 10px", textDecoration: "none",
              cursor: "pointer", font: "inherit",
            };
            // A file kept outside Slack (a Google Doc, say) is only a link to
            // it, so it opens there rather than in the preview overlay.
            const kind = f.external ? null : previewKind(f);
            const icon = f.error
              ? <Icons.AlertCircle width={13} height={13} />
              : f.external ? <Icons.ExternalLink width={13} height={13} />
              : kind === "video" ? <Icons.Video width={13} height={13} />
              : kind === "image" ? <Icons.Image width={13} height={13} />
              : kind === "audio" ? <Icons.Music width={13} height={13} />
              : <Icons.FileText width={13} height={13} />;
            // A handful of degraded Slack file objects (the same ones with no
            // name/url_private) also lack a permalink — an empty href would
            // silently reload the page instead of going anywhere, so those
            // render as plain (non-clickable) text instead of a dead link.
            if (!f.permalink) {
              return (
                <span key={f.id} title={f.error ?? undefined} style={{ ...chipStyle, opacity: 0.7, cursor: "default" }}>
                  {icon}
                  {f.name || (f.deleted_in_slack ? "Deleted in Slack" : "(unnamed attachment)")}
                </span>
              );
            }
            // Images/video/audio preview in an overlay right here instead of
            // navigating away in a new tab — closing it lands you back in
            // the same spot in the thread. Everything else (PDFs, docs, …)
            // still opens in a new tab.
            if (kind && !f.error) {
              return (
                <button key={f.id} type="button" onClick={() => setPlayingFile(f)} title={f.error ?? undefined} style={chipStyle}>
                  {icon}
                  {f.name}
                </button>
              );
            }
            return (
              <a key={f.id} href={f.permalink} target="_blank" rel="noopener noreferrer" title={f.error ?? undefined} style={chipStyle}>
                {icon}
                {f.name}
              </a>
            );
          })}
        </div>
      )}
      {playingFile?.permalink && previewKind(playingFile) && (
        <FilePreviewModal
          src={playingFile.permalink}
          title={playingFile.name}
          kind={previewKind(playingFile)!}
          onClose={() => setPlayingFile(null)}
        />
      )}
      {message.reactions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {message.reactions.map((r) => {
            const names = r.users.map((u) => u.name ?? "Someone").join(", ");
            // Workspace-custom emoji have no Unicode equivalent and fall
            // back to the :name: text, same as before.
            const glyph = resolveEmojiShortcode(r.name.split("::")[0]);
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
