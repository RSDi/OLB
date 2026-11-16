"use client";
// One help request as a conversation: what was asked (with its page and any
// screenshot or video), then each reply, then a box to write back. Used by
// ? → My requests (the asker) and Help Requests (the board).
import { useState, type ReactNode } from "react";
import type { HelpRequest } from "../../../lib/help-requests/model";
import { Pill } from "../ui";

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function HelpThread({
  request,
  showPageDetails,
  onReply,
  offerClose = false,
}: {
  request: HelpRequest;
  // The board sees the page link and browser; the asker knows where they were.
  showPageDetails?: boolean;
  // Resolves to an error message, or null once sent. `close` is true from
  // the board's Reply and close.
  onReply: (body: string, close: boolean) => Promise<string | null>;
  // The board: also show Reply and close.
  offerClose?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function send(close = false) {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const err = await onReply(trimmed, close);
    setBusy(false);
    if (err) setError(err);
    else setText("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Bubble name={request.askerName} at={request.createdAt} mine>
        {request.body}
      </Bubble>
      {showPageDetails && (request.pageUrl || request.browser) && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {request.pageUrl && (
            <a href={request.pageUrl} target="_blank" rel="noreferrer" style={{ color: "var(--rsd-accent-text, var(--rsd-accent))", fontWeight: 600 }}>
              {request.pageTitle || request.pageUrl}
            </a>
          )}
          {request.browser && <span>· {request.browser}</span>}
          {request.askerEmail && <span>· {request.askerEmail}</span>}
        </div>
      )}
      {(request.screenshotUrl || request.videoUrl) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {request.screenshotUrl && (
            <a href={request.screenshotUrl} target="_blank" rel="noreferrer" title="Open the screenshot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={request.screenshotUrl}
                alt="Screenshot"
                style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: "1px solid var(--gw-border)", display: "block" }}
              />
            </a>
          )}
          {request.videoUrl && (
            <video
              src={request.videoUrl}
              controls
              preload="metadata"
              style={{ maxWidth: 320, maxHeight: 200, borderRadius: 8, border: "1px solid var(--gw-border)", background: "#000" }}
            />
          )}
        </div>
      )}
      {request.messages.map(m => (
        <Bubble key={m.id} name={m.authorName} at={m.createdAt} mine={m.fromAsker}>
          {m.body}
        </Bubble>
      ))}
      {request.closedAt && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          Closed {when(request.closedAt)}
          {request.closedBy ? ` by ${request.closedBy}` : ""}. Writing back opens it again.
        </div>
      )}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        maxLength={5000}
        disabled={busy}
        aria-label="Write a reply"
        placeholder="Write a reply…"
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        style={{
          padding: "10px 12px",
          border: "1px solid var(--gw-border)",
          borderRadius: 8,
          fontSize: 14,
          color: "var(--gw-fg)",
          background: "var(--gw-bg)",
          width: "100%",
          resize: "vertical",
          lineHeight: 1.5,
          fontFamily: "inherit",
        }}
      />
      {error && (
        <span role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
          {error}
        </span>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {offerClose && !request.closedAt && (
          <Pill variant="ghost" size="sm" onClick={() => void send(true)} disabled={!trimmed || busy}>
            Reply and close
          </Pill>
        )}
        <Pill variant="accent" size="sm" onClick={() => void send()} disabled={!trimmed || busy}>
          {busy ? "Sending…" : "Send"}
        </Pill>
      </div>
    </div>
  );
}

function Bubble({ name, at, mine, children }: { name: string; at: string; mine: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        alignSelf: mine ? "flex-start" : "flex-end",
        maxWidth: "88%",
        padding: "10px 12px",
        borderRadius: 12,
        background: mine ? "var(--gw-bg)" : "var(--rsd-accent-soft, var(--gw-bg))",
        border: "1px solid var(--gw-border)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginBottom: 4 }}>
        <strong style={{ color: "var(--gw-fg)" }}>{name}</strong> · {when(at)}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14 }}>{children}</div>
    </div>
  );
}
