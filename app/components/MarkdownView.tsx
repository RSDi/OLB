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
