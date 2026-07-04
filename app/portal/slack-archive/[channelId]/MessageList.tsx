"use client";

import { useMemo, useState } from "react";
import * as emoji from "node-emoji";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Pill } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import type { ArchiveMessage, ArchiveThread } from "../../../../lib/slack-archive/data";
import { DateJumpCalendar } from "./DateJumpCalendar";

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
const MARKDOWN_SYNTAX = /[*_~`[\]()#>]|\n/;
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

export function MessageList({ threads }: { threads: ArchiveThread[] }) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const groups = useMemo(() => {
    const ascending = groupByDay(threads); // threads already arrive oldest-first
    if (sortOrder === "asc") return ascending;
    // Newest-first: flip both the day order and the order of threads within
    // each day. Replies inside a thread stay chronological — reversing a
    // conversation's own back-and-forth would just be confusing to read.
    return [...ascending].reverse().map((g) => ({ ...g, threads: [...g.threads].reverse() }));
  }, [threads, sortOrder]);

  function jumpToDate(date: string) {
    document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <Pill
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
        >
          {sortOrder === "asc" ? "Oldest first ↓" : "Newest first ↑"}
        </Pill>
        <DateJumpCalendar dates={groups.map((g) => g.dateKey)} onSelect={jumpToDate} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {groups.map((g) => (
          <div key={g.dateKey} id={`day-${g.dateKey}`} style={{ scrollMarginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gw-fg-muted)", letterSpacing: ".03em", marginBottom: 10 }}>
              {g.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.threads.map((t) => (
                <ThreadCard key={t.parent.id} thread={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
          {needsMarkdown(message.message_text) ? (
            <MarkdownView>{message.message_text}</MarkdownView>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.message_text}</div>
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
            };
            const icon = f.error ? <Icons.AlertCircle width={13} height={13} /> : <Icons.FileText width={13} height={13} />;
            // A handful of degraded Slack file objects (the same ones with no
            // name/url_private) also lack a permalink — an empty href would
            // silently reload the page instead of going anywhere, so those
            // render as plain (non-clickable) text instead of a dead link.
            if (!f.permalink) {
              return (
                <span key={f.id} title={f.error ?? undefined} style={{ ...chipStyle, opacity: 0.7, cursor: "default" }}>
                  {icon}
                  {f.name || "(unnamed attachment)"}
                </span>
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
