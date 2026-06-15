"use client";
import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { CommentForm, PromoteFromRecording } from "./Actions";
import { ActionRow, SummaryBullet, normalizeSummaryBullet } from "reelnotes/ui";
import { resolveAvatarUrl } from "../../../../lib/members/avatar";
import type { CommentRecording, AssignableMember } from "../../../../lib/reelnotes/data";
import {
  setActionItemRouted,
  toggleActionItemDone,
  setActionItemOwner,
  toggleActionItemSupporter,
  editActionItemText,
  setMyThingsEnabled,
} from "../../../../lib/reelnotes/actions";
import { deleteTicketComment } from "../../../../lib/maintenance/actions";
import { memberDisplayName } from "../../../../lib/members/display";

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
    nickname: string | null;
    email: string;
    avatar_url: string | null;
    // Synthetic author for Slack thread replies: full_name is already a
    // ready-to-show display name, so it's shown verbatim (not short-named).
    external?: boolean;
  } | null;
}

const MAX_VISIBLE_DEPTH = 5;
const INDENT_PX = 28;

// A comment author's display name. Real members get the short name; synthetic
// Slack authors carry a ready-to-show full_name that's shown verbatim.
function authorName(author: ThreadComment["author"]): string {
  if (!author) return "Unknown";
  if (author.external) return author.full_name || author.email || "Unknown";
  return memberDisplayName(author);
}

const collapseToggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 0,
  background: "transparent",
  border: "none",
  color: "var(--gw-fg-muted)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  cursor: "pointer",
};

export function CommentThread({
  ticketId,
  comments,
  canComment,
  thingsEnabled = false,
  members = [],
  viewerMemberId = null,
  isSuperAdmin = false,
  canPromoteSubtasks = false,
}: {
  ticketId: string;
  comments: ThreadComment[];
  canComment: boolean;
  thingsEnabled?: boolean;
  // Directory members a recorded comment's action items can be assigned to.
  members?: AssignableMember[];
  // For comment deletion: authors may delete their own reply-free comments;
  // super-admins may delete a whole thread.
  viewerMemberId?: string | null;
  isSuperAdmin?: boolean;
  // Staff, on a top-level task: a recorded note can turn its action items into
  // sub-tasks of this task.
  canPromoteSubtasks?: boolean;
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
          members={members}
          viewerMemberId={viewerMemberId}
          isSuperAdmin={isSuperAdmin}
          canPromoteSubtasks={canPromoteSubtasks}
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
  members,
  viewerMemberId,
  isSuperAdmin,
  canPromoteSubtasks,
  depth,
  border,
}: {
  comment: ThreadComment;
  childrenByParent: Map<string | null, ThreadComment[]>;
  ticketId: string;
  canComment: boolean;
  thingsEnabled: boolean;
  members: AssignableMember[];
  viewerMemberId: string | null;
  isSuperAdmin: boolean;
  canPromoteSubtasks: boolean;
  depth: number;
  border: boolean;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const children = childrenByParent.get(comment.id) ?? [];
  const indent = Math.min(depth, MAX_VISIBLE_DEPTH) * INDENT_PX;

  // Author may delete their own reply-free comment; a super-admin may delete
  // any comment along with its whole reply subtree. (`children` only holds
  // live replies — the loader filters out soft-deleted ones.)
  const isAuthor = !!comment.author_id && comment.author_id === viewerMemberId;
  const canDelete = isSuperAdmin || (isAuthor && children.length === 0);
  const authorAvatar = resolveAvatarUrl(comment.author ?? {}, 64);

  function countDescendants(c: ThreadComment): number {
    const kids = childrenByParent.get(c.id) ?? [];
    return kids.reduce((n, k) => n + 1 + countDescendants(k), 0);
  }

  async function handleDelete() {
    if (deleting) return;
    const descendants = isSuperAdmin ? countDescendants(comment) : 0;
    const msg =
      descendants > 0
        ? `Delete this comment and its ${descendants} ${descendants === 1 ? "reply" : "replies"}?`
        : "Delete this comment?";
    if (!confirm(msg)) return;
    setDeleting(true);
    const res = await deleteTicketComment(comment.id);
    setDeleting(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

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
          ) : authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authorAvatar}
              alt=""
              width={32}
              height={32}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          ) : (
            <Icons.User width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
              {authorName(comment.author)}
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
            <RecordedNote
              ticketId={ticketId}
              recording={comment.recording}
              thingsEnabled={thingsEnabled}
              members={members}
              canPromoteSubtasks={canPromoteSubtasks}
            />
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
          {canDelete && !replying && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                marginTop: 6,
                marginLeft: canComment ? 14 : 0,
                padding: 0,
                background: "transparent",
                border: "none",
                color: "var(--gw-error)",
                fontSize: 12,
                fontWeight: 700,
                cursor: deleting ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icons.Trash width={11} height={11} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          {replying && (
            <div style={{ marginTop: 10 }}>
              <CommentForm
                ticketId={ticketId}
                parentId={comment.id}
                placeholder={`Reply to ${comment.author ? authorName(comment.author) : "this comment"}…`}
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
              members={members}
              viewerMemberId={viewerMemberId}
              isSuperAdmin={isSuperAdmin}
              canPromoteSubtasks={canPromoteSubtasks}
              depth={depth + 1}
              border={i < children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The inline body of a recorded comment: playable audio, the extracted action
// items (the ReelNotes ActionRow — assign/owner, supporters, suggested
// contacts, jump-to-moment, device-only Things push), and a collapsible summary
// + transcript. Everything lives on the task — no trip to ReelNotes.
function RecordedNote({
  ticketId,
  recording,
  thingsEnabled,
  members,
  canPromoteSubtasks,
}: {
  ticketId: string;
  recording: CommentRecording;
  thingsEnabled: boolean;
  members: AssignableMember[];
  canPromoteSubtasks: boolean;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const items = recording.action_items;
  const ready = recording.status === "ready";
  const hasSummary = !!recording.summary && recording.summary.length > 0;
  const hasTranscript = !!recording.transcript;

  // "Jump to this moment" seeks the inline player instead of opening ReelNotes.
  function seekTo(ms: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    void el.play().catch(() => {});
  }

  async function enableThings() {
    await setMyThingsEnabled(true);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Audio — play the recording without leaving the task. */}
      {recording.audio_url && (
        <audio ref={audioRef} controls preload="none" src={recording.audio_url} style={{ width: "100%", height: 34 }} />
      )}

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
          {ready ? "No action items extracted." : "Transcribing…"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map(a => (
            <ActionRow
              key={a.id}
              action={a}
              recordingTitle={recording.title}
              members={members}
              thingsEnabled={thingsEnabled}
              destinationIds={["things"]}
              onToggle={() => void toggleActionItemDone(a.id, ticketId, !a.done).then(() => router.refresh())}
              onRoute={target => void setActionItemRouted(a.id, ticketId, target).then(() => router.refresh())}
              onEdit={text => void editActionItemText(a.id, ticketId, text).then(() => router.refresh())}
              onSetOwner={memberId => void setActionItemOwner(a.id, ticketId, memberId).then(() => router.refresh())}
              onToggleSupporter={memberId => void toggleActionItemSupporter(a.id, ticketId, memberId).then(() => router.refresh())}
              onSeekToMs={seekTo}
            />
          ))}
        </div>
      )}

      {/* Summary — collapsible, content-driven sections. */}
      {hasSummary && (
        <div>
          <button
            onClick={() => setShowSummary(s => !s)}
            className="gw-press"
            style={collapseToggleStyle}
          >
            {showSummary ? <Icons.ChevronDown width={12} height={12} /> : <Icons.ChevronRight width={12} height={12} />}
            Summary
          </button>
          {showSummary && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              {recording.summary!.map((sec, i) => (
                <div key={`${i}-${sec.heading}`}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--gw-fg-muted)",
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {sec.heading}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {sec.bullets.map((b, j) => {
                      const nb = normalizeSummaryBullet(b);
                      return <SummaryBullet key={`${nb.text}-${j}`} bullet={nb} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transcript — collapsible, the full text. */}
      {hasTranscript && (
        <div>
          <button
            onClick={() => setShowTranscript(s => !s)}
            className="gw-press"
            style={collapseToggleStyle}
          >
            {showTranscript ? <Icons.ChevronDown width={12} height={12} /> : <Icons.ChevronRight width={12} height={12} />}
            Transcript
          </button>
          {showTranscript && (
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: "var(--gw-fg)", whiteSpace: "pre-wrap" }}>
              {recording.transcript}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {canPromoteSubtasks && items.length > 0 && (
          <PromoteFromRecording parentId={ticketId} recordingId={recording.id} items={items} />
        )}
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
