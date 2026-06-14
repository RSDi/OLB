"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { CommentForm } from "./Actions";
import type { CommentRecording, CommentRecordingActionItem } from "../../../../lib/reelnotes/data";
import {
  setActionItemRouted,
  toggleActionItemDone,
  setMyThingsEnabled,
} from "../../../../lib/reelnotes/actions";

export interface ThreadComment {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  parent_id: string | null;
  // Set when this comment was posted from a ReelNotes recording (0065). The
  // recording (with its action items) is attached by the loader for staff.
  recording_id: string | null;
  recording?: CommentRecording | null;
  author: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

const MAX_VISIBLE_DEPTH = 5;
const INDENT_PX = 28;

const PRIORITY_CHIP: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "rsd-chip-success" },
  medium: { label: "Medium", cls: "rsd-chip-mute" },
  high: { label: "High", cls: "rsd-chip-warn" },
  emergency: { label: "Emergency", cls: "rsd-chip-error" },
};

export function CommentThread({
  ticketId,
  comments,
  canComment,
  thingsEnabled = false,
}: {
  ticketId: string;
  comments: ThreadComment[];
  canComment: boolean;
  thingsEnabled?: boolean;
}) {
  const childrenByParent = new Map<string | null, ThreadComment[]>();
  for (const c of comments) {
    const key = c.parent_id;
    const list = childrenByParent.get(key) ?? [];
    list.push(c);
    childrenByParent.set(key, list);
  }
  const roots = childrenByParent.get(null) ?? [];

  if (roots.length === 0) {
    return (
      <div
        style={{
          padding: "32px 18px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--gw-fg-muted)",
        }}
      >
        No comments yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {roots.map((c, i) => (
        <CommentNode
          key={c.id}
          comment={c}
          childrenByParent={childrenByParent}
          ticketId={ticketId}
          canComment={canComment}
          thingsEnabled={thingsEnabled}
          depth={0}
          border={i < roots.length - 1}
        />
      ))}
    </div>
  );
}

function CommentNode({
  comment,
  childrenByParent,
  ticketId,
  canComment,
  thingsEnabled,
  depth,
  border,
}: {
  comment: ThreadComment;
  childrenByParent: Map<string | null, ThreadComment[]>;
  ticketId: string;
  canComment: boolean;
  thingsEnabled: boolean;
  depth: number;
  border: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const children = childrenByParent.get(comment.id) ?? [];
  const indent = Math.min(depth, MAX_VISIBLE_DEPTH) * INDENT_PX;

  return (
    <div
      style={{
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "14px 18px",
          paddingLeft: 18 + indent,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {comment.recording ? (
            <Icons.Mic width={14} height={14} style={{ color: "var(--rsd-accent)" }} />
          ) : comment.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.author.avatar_url}
              alt=""
              width={32}
              height={32}
              style={{ objectFit: "cover" }}
            />
          ) : (
            <Icons.User width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
              {comment.author?.full_name ?? comment.author?.email ?? "Unknown"}
            </span>
            {comment.recording && (
              <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                <Icons.Mic width={9} height={9} style={{ marginRight: 3 }} />
                Recorded note
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              {formatDateTime(comment.created_at)}
            </span>
          </div>

          {/* A recorded comment renders its action items inline; a typed
              comment renders its text. */}
          {comment.recording ? (
            <RecordedNote ticketId={ticketId} recording={comment.recording} thingsEnabled={thingsEnabled} />
          ) : (
            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                color: "var(--gw-fg)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {comment.body}
            </div>
          )}

          {canComment && !replying && (
            <button
              type="button"
              onClick={() => setReplying(true)}
              style={{
                marginTop: 6,
                padding: 0,
                background: "transparent",
                border: "none",
                color: "var(--gw-fg-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icons.ArrowRight
                width={11}
                height={11}
                style={{ transform: "scaleX(-1) rotate(180deg)" }}
              />
              Reply
            </button>
          )}
          {replying && (
            <div style={{ marginTop: 10 }}>
              <CommentForm
                ticketId={ticketId}
                parentId={comment.id}
                placeholder={`Reply to ${comment.author?.full_name ?? comment.author?.email ?? "this comment"}…`}
                submitLabel="Post reply"
                compact
                onCancel={() => setReplying(false)}
                onPosted={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div>
          {children.map((c, i) => (
            <CommentNode
              key={c.id}
              comment={c}
              childrenByParent={childrenByParent}
              ticketId={ticketId}
              canComment={canComment}
              thingsEnabled={thingsEnabled}
              depth={depth + 1}
              border={i < children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The inline body of a recorded comment: its extracted action items (each with
// a done toggle + device-only Things push) and a link to the full transcript.
function RecordedNote({
  ticketId,
  recording,
  thingsEnabled,
}: {
  ticketId: string;
  recording: CommentRecording;
  thingsEnabled: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = recording.action_items;
  const ready = recording.status === "ready";

  async function pushThings(a: CommentRecordingActionItem) {
    if (busyId) return;
    const link = `${window.location.origin}/portal/reelnotes?r=${recording.id}&t=${a.id}`;
    const url =
      "things:///add?title=" +
      encodeURIComponent(a.text) +
      "&notes=" +
      encodeURIComponent(`From a recorded note on this task\n${link}`);
    window.location.href = url;
    setBusyId(a.id);
    await setActionItemRouted(a.id, ticketId, "Things");
    setBusyId(null);
    router.refresh();
  }

  async function toggle(a: CommentRecordingActionItem) {
    if (busyId) return;
    setBusyId(a.id);
    await toggleActionItemDone(a.id, ticketId, !a.done);
    setBusyId(null);
    router.refresh();
  }

  async function enableThings() {
    await setMyThingsEnabled(true);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
          {ready ? "No action items extracted." : "Transcribing…"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((a) => {
            const pri = PRIORITY_CHIP[a.priority] ?? PRIORITY_CHIP.medium;
            const busy = busyId === a.id;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <button
                  onClick={() => toggle(a)}
                  disabled={busy}
                  title={a.done ? "Mark not done" : "Mark done"}
                  className="gw-press"
                  style={{
                    flexShrink: 0,
                    marginTop: 1,
                    display: "inline-flex",
                    background: "transparent",
                    border: "none",
                    cursor: busy ? "default" : "pointer",
                    color: a.done ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                  }}
                >
                  <Icons.CheckCircle width={15} height={15} />
                </button>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: a.done ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                    textDecoration: a.done ? "line-through" : "none",
                  }}
                >
                  {a.text}
                </span>
                <span className={`rsd-chip ${pri.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>
                  {pri.label}
                </span>
                {a.routed_to ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gw-fg-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
                    → {a.routed_to}
                  </span>
                ) : (
                  thingsEnabled && (
                    <button
                      onClick={() => pushThings(a)}
                      disabled={busy}
                      className="gw-press"
                      title="Push to Things"
                      style={{
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        borderRadius: 100,
                        background: "var(--gw-bg-elev)",
                        color: "var(--gw-fg)",
                        border: "1px solid var(--gw-border)",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: busy ? "default" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Icons.CheckCircle width={10} height={10} /> Things
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a
          href={`/portal/reelnotes?r=${recording.id}`}
          style={{ fontSize: 11, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
        >
          View transcript in ReelNotes →
        </a>
        {!thingsEnabled && items.length > 0 && (
          <button
            onClick={enableThings}
            className="gw-press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 100,
              background: "transparent",
              color: "var(--rsd-accent)",
              border: "1px dashed var(--gw-border)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Icons.CheckCircle width={10} height={10} /> Enable one-tap push to Things
          </button>
        )}
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
