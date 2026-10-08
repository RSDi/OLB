"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import type { ArchiveMessage, ArchiveMessageFile, ArchiveThread } from "../../../../lib/slack-archive/data";
import type { ArchivedFile } from "../../../../lib/slack-archive/files";
import { albumMediaHref, albumMediaKind, needsPreviewToShow, showsInline, thumbnailPathFor } from "../../../../lib/slack-archive/album";
import { messageAnchorId, messageHref, messageTsFromHash } from "../../../../lib/slack-archive/anchors";
import { resolveEmojiShortcode } from "../../../../lib/slack-archive/emoji";
import { decodeSlackEntities } from "../../../../lib/slack-archive/text";
import { DateJumpCalendar } from "./DateJumpCalendar";
import { FilePreviewModal, type PreviewKind } from "./FilePreviewModal";
import { FilterDropdown } from "../_shared/FilterDropdown";
import { SlackText } from "../_shared/SlackText";

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

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

// The message a link opened this page at ("#msg-<ts>": the photo album's
// "View in conversation", a search result, a copied link). It's shown
// highlighted for as long as the link points at it. Client-only: the server
// never sees the hash.
function useLinkedMessageTs(): string | null {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  return messageTsFromHash(hash);
}

interface DayGroup {
  dateKey: string; // YYYY-MM-DD in CHURCH_TZ — stable id for sorting/jump-anchors
  label: string;   // "Saturday, February 24, 2024" — display only
  threads: ArchiveThread[];
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
  const linkedTs = useLinkedMessageTs();

  // The browser's own jump to the anchor happens before the page is ready
  // and leaves the message under the sticky bar; center it once it's here.
  useEffect(() => {
    if (linkedTs) document.getElementById(messageAnchorId(linkedTs))?.scrollIntoView({ block: "center" });
  }, [linkedTs]);

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
                <ThreadCard key={t.parent.id} thread={t} channelId={channelId} linkedTs={linkedTs} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadCard({ thread, channelId, linkedTs }: { thread: ArchiveThread; channelId: string; linkedTs: string | null }) {
  return (
    <div className="rsd-card" style={{ padding: "14px 18px", gap: 10 }}>
      <MessageRow message={thread.parent} channelId={channelId} linked={thread.parent.ts === linkedTs} />
      {thread.replies.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 20, paddingLeft: 14, borderLeft: "2px solid var(--gw-border)" }}>
          {thread.replies.map((r) => (
            <MessageRow key={r.id} message={r} channelId={channelId} linked={r.ts === linkedTs} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message, channelId, linked }: { message: ArchiveMessage; channelId: string; linked: boolean }) {
  const time = new Date(message.posted_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ });
  const messageText = decodeSlackEntities(message.message_text);
  const [playingFile, setPlayingFile] = useState<ArchiveMessageFile | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}${messageHref(channelId, message.ts)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied (e.g. insecure context) — nothing
      // more to do; the icon just silently won't confirm a copy.
    }
  }

  // Photos and videos show in place; everything else is a file chip.
  const inline = message.files.filter((f) => f.permalink && showsInline(f, Boolean(f.thumb_url)));
  const chips = message.files.filter((f) => !inline.includes(f));
  const chip = (f: ArchiveMessageFile) => <FileChip key={f.id} file={f} onPreview={() => setPlayingFile(f)} />;
  const preview = playingFile ? previewKind(playingFile) : null;

  return (
    <div
      id={messageAnchorId(message.ts)}
      className={linked ? "rsd-slack-msg is-linked" : "rsd-slack-msg"}
      style={{ display: "flex", flexDirection: "column", gap: 4, scrollMarginTop: 16 }}
    >
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
          <SlackText text={messageText} />
        </div>
      )}
      {inline.length > 0 && (
        <div className="rsd-slack-media-row">
          {inline.map((f) =>
            albumMediaKind(f) === "video" ? (
              <InlineVideo key={f.id} file={f} fallback={chip(f)} />
            ) : (
              <InlineImage key={f.id} file={f} onOpen={() => setPlayingFile(f)} fallback={chip(f)} />
            ),
          )}
        </div>
      )}
      {chips.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{chips.map(chip)}</div>}
      {playingFile && preview && (
        <FilePreviewModal
          src={fullSizeSrc(playingFile)}
          title={playingFile.name}
          kind={preview}
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

// What the preview overlay shows: the original through the media route,
// which signs a fresh URL however long the page has been open. A photo most
// browsers can't show (HEIC) shows its preview image instead, when it has one.
function fullSizeSrc(file: ArchiveMessageFile): string {
  if (!file.storage_path) return file.permalink ?? "";
  if (file.thumb_url && needsPreviewToShow(file)) return albumMediaHref(thumbnailPathFor(file.storage_path));
  return albumMediaHref(file.storage_path);
}

// A photo in place at preview size (its preview image when the thumbnail
// job has made one, else the original); tap for the full-size view. It loads
// only as it scrolls into view. Its signed URL lasts an hour, so one that
// fails (the page was left open) is tried once more through the media
// route; one that fails there too becomes a file chip.
function InlineImage({ file, onOpen, fallback }: { file: ArchiveMessageFile; onOpen: () => void; fallback: React.ReactNode }) {
  const viaRoute = albumMediaHref(file.thumb_url ? thumbnailPathFor(file.storage_path!) : file.storage_path!);
  const [src, setSrc] = useState(file.thumb_url ?? file.permalink!);
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <button type="button" className="rsd-slack-media" onClick={onOpen} title={file.name} aria-label={`View ${file.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL, not a static asset next/image can optimize */}
      <img
        src={src}
        alt={file.name}
        loading="lazy"
        decoding="async"
        onError={() => (src === viaRoute ? setFailed(true) : setSrc(viaRoute))}
      />
    </button>
  );
}

// A video in place: its preview image (or a dark tile) with a play button,
// and nothing of the video itself is fetched until it's played, so a
// channel full of videos still loads quickly. It plays through the media
// route, which signs a fresh URL; one the browser can't play becomes a file
// chip.
function InlineVideo({ file, fallback }: { file: ArchiveMessageFile; fallback: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  if (playing) {
    return (
      <div className="rsd-slack-media is-playing">
        <video
          src={albumMediaHref(file.storage_path!)}
          title={file.name}
          controls
          autoPlay
          playsInline
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="rsd-slack-media rsd-slack-media-video"
      onClick={() => setPlaying(true)}
      title={file.name}
      aria-label={`Play ${file.name}`}
    >
      {file.thumb_url && !posterFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL, not a static asset next/image can optimize
        <img src={file.thumb_url} alt="" loading="lazy" decoding="async" onError={() => setPosterFailed(true)} />
      ) : (
        <span className="rsd-slack-media-blank">{file.name}</span>
      )}
      <span className="rsd-slack-media-play" aria-hidden="true">
        <Icons.Play width={18} height={18} />
      </span>
    </button>
  );
}

// An attachment as a chip: a failed download or a file with no link is
// plain text; audio (and a photo or video that can't show in place) opens
// in the preview overlay; anything else (PDFs, docs, Google files) opens in
// a new tab.
function FileChip({ file: f, onPreview }: { file: ArchiveMessageFile; onPreview: () => void }) {
  const chipStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 600, color: f.error ? "var(--gw-error)" : "var(--rsd-accent)",
    background: "var(--gw-bg-elev)",
    border: `1px solid ${f.error ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
    borderRadius: 8, padding: "4px 10px", textDecoration: "none",
    cursor: "pointer", font: "inherit",
  };
  // A file kept outside Slack (a Google Doc, say) is only a link to it, so
  // it opens there rather than in the preview overlay.
  const kind = f.external ? null : previewKind(f);
  const icon = f.error
    ? <Icons.AlertCircle width={13} height={13} />
    : f.external ? <Icons.ExternalLink width={13} height={13} />
    : kind === "video" ? <Icons.Video width={13} height={13} />
    : kind === "image" ? <Icons.Image width={13} height={13} />
    : kind === "audio" ? <Icons.Music width={13} height={13} />
    : <Icons.FileText width={13} height={13} />;
  // A handful of degraded Slack file objects (the same ones with no
  // name/url_private) also lack a permalink — an empty href would silently
  // reload the page instead of going anywhere, so those render as plain
  // (non-clickable) text instead of a dead link.
  if (!f.permalink) {
    return (
      <span title={f.error ?? undefined} style={{ ...chipStyle, opacity: 0.7, cursor: "default" }}>
        {icon}
        {f.name || (f.deleted_in_slack ? "Deleted in Slack" : "(unnamed attachment)")}
      </span>
    );
  }
  if (kind && !f.error) {
    return (
      <button type="button" onClick={onPreview} style={chipStyle}>
        {icon}
        {f.name}
      </button>
    );
  }
  return (
    <a href={f.permalink} target="_blank" rel="noopener noreferrer" title={f.error ?? undefined} style={chipStyle}>
      {icon}
      {f.name}
    </a>
  );
}
