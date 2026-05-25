"use client";
import { useState } from "react";
import { Icons } from "../../../components/icons";
import { CommentForm } from "./Actions";

export interface ThreadComment {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  parent_id: string | null;
  author: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

const MAX_VISIBLE_DEPTH = 5;
const INDENT_PX = 28;

export function CommentThread({
  ticketId,
  comments,
  canComment,
}: {
  ticketId: string;
  comments: ThreadComment[];
  canComment: boolean;
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
  depth,
  border,
}: {
  comment: ThreadComment;
  childrenByParent: Map<string | null, ThreadComment[]>;
  ticketId: string;
  canComment: boolean;
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
          {comment.author?.avatar_url ? (
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
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              {formatDateTime(comment.created_at)}
            </span>
          </div>
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
              depth={depth + 1}
              border={i < children.length - 1}
            />
          ))}
        </div>
      )}
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
