"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EmailArchiveThreadDetail, EmailArchiveThreadListItem } from "../../../../lib/email-archive/data";
import {
  formatArchivedOn,
  formatEmailWhen,
  formatEmailWhenLong,
  formatFileSize,
  participantsLabel,
} from "../../../../lib/email-archive/format";
import { sanitizeEmailHtml } from "../../../../lib/email-archive/sanitize";
import { emailThreadHref } from "../../../../lib/slack-archive/paths";

function emailFileHref(storagePath: string, filename: string): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/portal/archives/email/files/${encoded}?download=${encodeURIComponent(filename)}`;
}

export function EmailInbox({
  threads,
  selected,
  missingTable,
}: {
  threads: EmailArchiveThreadListItem[];
  selected: EmailArchiveThreadDetail | null;
  missingTable: boolean;
}) {
  const [q, setQ] = useState("");
  const [meeting, setMeeting] = useState("all");
  const [mailbox, setMailbox] = useState("all");

  const meetings = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of threads) {
      for (const l of t.links) map.set(l.meetingId, l.meetingLabel);
    }
    return [...map.entries()];
  }, [threads]);
  const mailboxes = useMemo(() => [...new Set(threads.map((t) => t.sourceMailbox).filter(Boolean))], [threads]);

  const filtered = threads.filter((t) => {
    if (meeting !== "all" && !t.links.some((l) => l.meetingId === meeting)) return false;
    if (mailbox !== "all" && t.sourceMailbox !== mailbox) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      t.subject.toLowerCase().includes(needle) ||
      t.snippet.toLowerCase().includes(needle) ||
      t.participants.some((p) => p.toLowerCase().includes(needle))
    );
  });

  if (missingTable) {
    return (
      <div className="rsd-card" style={{ padding: 24, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        Email archive isn&apos;t on this database yet. Apply migration 0149 in the Supabase SQL editor.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          data-tour="archives-email-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search emails…"
          aria-label="Search emails"
          style={{
            flex: 1,
            minWidth: 180,
            border: "1px solid var(--gw-border)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "var(--gw-bg)",
            fontSize: 13,
            fontWeight: 500,
          }}
        />
        <select
          aria-label="Linked to"
          value={meeting}
          onChange={(e) => setMeeting(e.target.value)}
          style={{
            border: "1px solid var(--gw-border)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "var(--gw-bg)",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          <option value="all">Linked to: All meetings</option>
          {meetings.map(([id, label]) => (
            <option key={id} value={id}>
              Linked to: {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Source"
          value={mailbox}
          onChange={(e) => setMailbox(e.target.value)}
          style={{
            border: "1px solid var(--gw-border)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "var(--gw-bg)",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          <option value="all">Source: All</option>
          {mailboxes.map((m) => (
            <option key={m} value={m}>
              Source: {m}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rsd-card" style={{ padding: 24, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {threads.length === 0
            ? "No archived emails yet. Jeff's agent copies threads here so the board can open them without Gmail."
            : "No emails match those filters."}
        </div>
      ) : (
        <div className="rsd-email-split">
          <div className="rsd-card" style={{ padding: 0, overflow: "hidden" }}>
            {filtered.map((t) => {
              const active = selected?.gmailThreadId === t.gmailThreadId;
              return (
                <Link
                  key={t.id}
                  href={emailThreadHref(t.gmailThreadId)}
                  className={active ? "rsd-email-row on" : "rsd-email-row"}
                  style={{
                    display: "block",
                    padding: "12px 16px",
                    borderTop: "1px solid var(--gw-border)",
                    textDecoration: "none",
                    color: "inherit",
                    background: active ? "var(--rsd-warn-bg, #fffbea)" : undefined,
                    boxShadow: active ? "inset 3px 0 0 var(--rsd-accent-fill)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{participantsLabel(t.participants) || "Unknown"}</span>
                    {t.messageCount > 1 && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--gw-fg-muted)",
                          border: "1px solid var(--gw-border)",
                          borderRadius: 99,
                          padding: "0 6px",
                        }}
                      >
                        {t.messageCount}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gw-fg-muted)" }}>
                      {formatEmailWhen(t.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, margin: "3px 0" }}>{t.subject || "(no subject)"}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--gw-fg-muted)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {t.snippet}
                  </div>
                  {t.links.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.links.map((l) => (
                        <span key={l.id} className="rsd-chip rsd-chip-accent" style={{ fontSize: 11 }}>
                          {l.meetingLabel.replace(" board meeting", "")}
                          {l.agendaItemLabel ? ` · ${l.agendaItemLabel}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="rsd-card" style={{ padding: "20px 24px" }}>
            {selected ? <ThreadDetail thread={selected} /> : (
              <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                Pick an email on the left.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadDetail({ thread }: { thread: EmailArchiveThreadDetail }) {
  return (
    <div data-tour="archives-email-thread">
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {thread.links.map((l) => (
          <Link
            key={l.id}
            href={l.meetingMonth ? `/portal/events/meetings/${l.meetingMonth}` : "/portal/events"}
            className="rsd-chip rsd-chip-accent"
            style={{ fontSize: 11, textDecoration: "none" }}
          >
            Linked from: {l.meetingLabel}
            {l.agendaItemLabel ? ` → ${l.agendaItemLabel}` : ""}
          </Link>
        ))}
        {thread.createdAt && (
          <span className="rsd-chip rsd-chip-success" style={{ fontSize: 11 }}>
            {formatArchivedOn(thread.createdAt)}
          </span>
        )}
      </div>
      <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800 }}>{thread.subject || "(no subject)"}</h2>
      {thread.messages.map((m) => (
        <article key={m.id} style={{ borderTop: "1px solid var(--gw-border)", padding: "12px 0" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1fr",
              gap: "4px 10px",
              fontSize: 12.5,
              padding: "0 0 12px",
            }}
          >
            <b style={{ color: "var(--gw-fg-muted)", fontWeight: 700 }}>From</b>
            <span>{m.from || "Unknown"}</span>
            {m.to.length > 0 && (
              <>
                <b style={{ color: "var(--gw-fg-muted)", fontWeight: 700 }}>To</b>
                <span>{m.to.join(", ")}</span>
              </>
            )}
            {m.cc.length > 0 && (
              <>
                <b style={{ color: "var(--gw-fg-muted)", fontWeight: 700 }}>Cc</b>
                <span>{m.cc.join(", ")}</span>
              </>
            )}
            <b style={{ color: "var(--gw-fg-muted)", fontWeight: 700 }}>Date</b>
            <span>{formatEmailWhenLong(m.sentAt)}</span>
          </div>
          {m.bodyHtml ? (
            <div className="rsd-email-body" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(m.bodyHtml) }} />
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
              {m.bodyText}
            </pre>
          )}
          {m.attachments.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {m.attachments.map((a) => (
                <a
                  key={a.id}
                  href={emailFileHref(a.storagePath, a.filename)}
                  className="rsd-link"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {a.filename}
                  {a.sizeBytes != null ? ` · ${formatFileSize(a.sizeBytes)}` : ""}
                </a>
              ))}
            </div>
          )}
        </article>
      ))}
      <div
        style={{
          marginTop: 18,
          padding: "12px 14px",
          background: "var(--gw-bg-elev)",
          borderRadius: 10,
          fontSize: 12,
          color: "var(--gw-fg-muted)",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>Source: {thread.sourceMailbox}</span>
        <span>Gmail thread {thread.gmailThreadId}</span>
        <span>
          {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}
          {thread.attachmentCount ? ` · ${thread.attachmentCount} attachment${thread.attachmentCount === 1 ? "" : "s"}` : " · no attachments"}
        </span>
        {thread.addedBy && <span>Imported by {thread.addedBy}</span>}
      </div>
    </div>
  );
}
