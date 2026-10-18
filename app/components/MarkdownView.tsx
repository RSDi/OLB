"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { MD_REHYPE_PLUGINS, MD_REMARK_PLUGINS } from "./markdown-plugins";
import { VideoLink } from "./VideoLink";

interface Props {
  children: string;
}

// Walk an arbitrary ReactNode tree and join all text content. Used to detect
// the leading "▶ " sentinel in link text — children for a markdown link can
// be a string, an array, or nested formatting elements.
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return nodeText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function archiveLinkKind(href?: string): "email" | "slack" | "internal" | null {
  if (!href) return null;
  let path = href;
  try {
    if (/^https?:\/\//i.test(href)) path = new URL(href).pathname;
  } catch {
    return null;
  }
  const q = path.split("?")[0] ?? path;
  if (q.startsWith("/portal/archives/email/") || q === "/portal/archives/email") return "email";
  if (q.startsWith("/portal/archives/slack/") || q.startsWith("/portal/slack-archive/")) return "slack";
  if (q.startsWith("/portal/")) return "internal";
  return null;
}

// Single source of truth for rendering playbook markdown across the app:
// editor preview, detail view, and version history. The "▶ " prefix on link
// text is the convention for "render as click-to-play video card" — see
// MarkdownEditor's video toolbar button.
export function MarkdownView({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[...MD_REMARK_PLUGINS]}
      rehypePlugins={[...MD_REHYPE_PLUGINS]}
      components={{
        a({ href, children: linkChildren, ...rest }) {
          const text = nodeText(linkChildren);
          if (text.startsWith("▶ ") && href) {
            const title = text.slice(2).trim() || "Video";
            return <VideoLink href={href} title={title} />;
          }
          const kind = archiveLinkKind(href);
          if (kind) {
            const cls = kind === "email" ? "rsd-archive-link rsd-archive-link-email" : kind === "slack" ? "rsd-archive-link rsd-archive-link-slack" : undefined;
            return (
              <a href={href} className={cls} {...rest}>
                {linkChildren}
              </a>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {linkChildren}
            </a>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
