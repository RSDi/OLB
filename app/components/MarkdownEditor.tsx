"use client";

import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { MD_REHYPE_PLUGINS, MD_REMARK_PLUGINS } from "./markdown-plugins";

interface Props {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, rows = 20, placeholder }: Props) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const ref = useRef<HTMLTextAreaElement>(null);

  function applyChange(next: string, selStart: number, selEnd: number) {
    onChange(next);
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  }

  function wrap(prefix: string, suffix: string = prefix) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.substring(start, end);
    const next =
      value.substring(0, start) +
      prefix +
      selected +
      suffix +
      value.substring(end);
    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;
    applyChange(next, newStart, newEnd);
  }

  function prefixLines(getPrefix: (lineIndex: number) => string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    // Expand to whole-line bounds so the prefix lands at the line start.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNL = value.indexOf("\n", end);
    const lineEnd = nextNL === -1 ? value.length : nextNL;
    const block = value.substring(lineStart, lineEnd);
    const lines = block.length === 0 ? [""] : block.split("\n");
    const prefixed = lines.map((l, i) => getPrefix(i) + l).join("\n");
    const next = value.substring(0, lineStart) + prefixed + value.substring(lineEnd);
    applyChange(next, lineStart, lineEnd + (prefixed.length - block.length));
  }

  const buttons: { label: ReactNode; title: string; onClick: () => void }[] = [
    { label: <strong>B</strong>, title: "Bold", onClick: () => wrap("**") },
    { label: <em>I</em>, title: "Italic", onClick: () => wrap("*") },
    {
      label: <span style={{ textDecoration: "underline" }}>U</span>,
      title: "Underline",
      onClick: () => wrap("<u>", "</u>"),
    },
    {
      label: <span style={{ textDecoration: "line-through" }}>S</span>,
      title: "Strikethrough",
      onClick: () => wrap("~~"),
    },
    {
      label: <BulletListIcon />,
      title: "Bulleted list",
      onClick: () => prefixLines(() => "- "),
    },
    {
      label: <NumberedListIcon />,
      title: "Numbered list",
      onClick: () => prefixLines((i) => `${i + 1}. `),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <ModeTab active={mode === "write"} onClick={() => setMode("write")}>
            Write
          </ModeTab>
          <ModeTab active={mode === "preview"} onClick={() => setMode("preview")}>
            Preview
          </ModeTab>
        </div>

        {mode === "write" && (
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: 2,
              borderRadius: 8,
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
            }}
          >
            {buttons.map((b, i) => (
              <ToolbarBtn
                key={i}
                title={b.title}
                onClick={(e) => {
                  // Prevent button click from stealing focus before we restore it.
                  e.preventDefault();
                  b.onClick();
                }}
              >
                {b.label}
              </ToolbarBtn>
            ))}
          </div>
        )}
      </div>

      {mode === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: "100%",
            padding: "16px 18px",
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
          }}
        />
      ) : (
        <article
          className="rsd-markdown"
          style={{
            padding: "24px 28px",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--gw-fg)",
            minHeight: 200,
          }}
        >
          {value.trim() ? (
            <ReactMarkdown
              remarkPlugins={[...MD_REMARK_PLUGINS]}
              rehypePlugins={[...MD_REHYPE_PLUGINS]}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p style={{ margin: 0, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              Nothing to preview yet.
            </p>
          )}
        </article>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        background: active ? "var(--gw-bg-elev)" : "transparent",
        border: "1px solid",
        borderColor: active ? "var(--gw-border)" : "transparent",
        fontSize: 12,
        fontWeight: 700,
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ToolbarBtn({
  children,
  title,
  onClick,
}: {
  children: ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "var(--gw-fg)",
        border: "none",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--gw-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function BulletListIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1" fill="currentColor" />
      <circle cx="3.5" cy="12" r="1" fill="currentColor" />
      <circle cx="3.5" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 4v4" />
      <path d="M3 4h1.5" />
      <path d="M3 14h3l-3 3h3" />
    </svg>
  );
}
