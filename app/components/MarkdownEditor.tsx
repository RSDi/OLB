"use client";

import {
  useRef,
  useState,
  type DragEvent as RDragEvent,
  type ReactNode,
} from "react";
import { MarkdownView } from "./MarkdownView";
import {
  isImageFile,
  isVideoFile,
  uploadAttachment,
} from "../../lib/playbooks/attachments";

interface Props {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, rows = 20, placeholder }: Props) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNL = value.indexOf("\n", end);
    const lineEnd = nextNL === -1 ? value.length : nextNL;
    const block = value.substring(lineStart, lineEnd);
    const lines = block.length === 0 ? [""] : block.split("\n");
    const prefixed = lines.map((l, i) => getPrefix(i) + l).join("\n");
    const next = value.substring(0, lineStart) + prefixed + value.substring(lineEnd);
    applyChange(next, lineStart, lineEnd + (prefixed.length - block.length));
  }

  // Insert text at the current cursor position. If text needs its own block
  // (image, video) we surround with newlines as needed so it doesn't end up
  // glued to surrounding text.
  function insertBlock(text: string) {
    const ta = ref.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const before = value.substring(0, start);
    const after = value.substring(end);
    const needsLeading = before.length > 0 && !before.endsWith("\n");
    const needsTrailing = after.length > 0 && !after.startsWith("\n");
    const insertion =
      (needsLeading ? "\n" : "") + text + (needsTrailing ? "\n" : "");
    const next = before + insertion + after;
    const cursor = start + insertion.length;
    applyChange(next, cursor, cursor);
  }

  async function handleImageUpload(file: File) {
    if (!isImageFile(file)) {
      setUploadError("That doesn't look like an image file.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    const res = await uploadAttachment(file);
    setUploading(false);
    if (res.error) {
      setUploadError(res.error);
      return;
    }
    if (res.url) {
      const alt = file.name.replace(/\.[^.]+$/, "") || "image";
      insertBlock(`![${alt}](${res.url})`);
    }
  }

  function onImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
  }

  function onTextareaDragOver(e: RDragEvent<HTMLTextAreaElement>) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      if (!isDraggingOver) setIsDraggingOver(true);
    }
  }

  function onTextareaDragLeave() {
    setIsDraggingOver(false);
  }

  async function onTextareaDrop(e: RDragEvent<HTMLTextAreaElement>) {
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    const images = files.filter(isImageFile);
    if (images.length === 0) return;
    e.preventDefault();
    // Sequential — keeps cursor moves predictable and avoids racing onChange.
    for (const file of images) {
      // eslint-disable-next-line no-await-in-loop
      await handleImageUpload(file);
    }
  }

  function handleVideoInsert(title: string, url: string) {
    setVideoPanelOpen(false);
    const cleanTitle = title.trim() || "Video";
    insertBlock(`[▶ ${cleanTitle}](${url})`);
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
    {
      label: <ImageIcon />,
      title: "Insert image",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      label: <VideoIcon />,
      title: "Insert video",
      onClick: () => setVideoPanelOpen((v) => !v),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Hidden file input for the Image toolbar button. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={onImageInputChange}
        style={{ display: "none" }}
      />

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

      {videoPanelOpen && mode === "write" && (
        <VideoPanel
          onInsert={handleVideoInsert}
          onCancel={() => setVideoPanelOpen(false)}
          onUploadError={setUploadError}
        />
      )}

      {(uploading || uploadError) && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            background: uploadError ? "var(--gw-error-bg)" : "var(--gw-bg-elev)",
            color: uploadError ? "var(--gw-error)" : "var(--gw-fg-muted)",
            border: `1px solid ${uploadError ? "var(--gw-error)" : "var(--gw-border)"}`,
          }}
        >
          {uploadError ? `Upload failed: ${uploadError}` : "Uploading…"}
        </div>
      )}

      {mode === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onDragOver={onTextareaDragOver}
          onDragLeave={onTextareaDragLeave}
          onDrop={onTextareaDrop}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: "100%",
            padding: "16px 18px",
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: `1px ${isDraggingOver ? "dashed" : "solid"} ${
              isDraggingOver ? "var(--rsd-accent)" : "var(--gw-border)"
            }`,
            borderRadius: 12,
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
            transition: "border-color 120ms",
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
            <MarkdownView>{value}</MarkdownView>
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

function VideoPanel({
  onInsert,
  onCancel,
  onUploadError,
}: {
  onInsert: (title: string, url: string) => void;
  onCancel: () => void;
  onUploadError: (msg: string | null) => void;
}) {
  const [source, setSource] = useState<"url" | "upload">("url");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!isVideoFile(file)) {
      onUploadError("That doesn't look like a video file.");
      return;
    }
    onUploadError(null);
    setUploading(true);
    const res = await uploadAttachment(file);
    setUploading(false);
    if (res.error) {
      onUploadError(res.error);
      return;
    }
    if (res.url) {
      setUrl(res.url);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "") || "Video");
    }
  }

  const canInsert = url.trim().length > 0 && !uploading;

  return (
    <div
      className="rsd-card"
      style={{
        padding: 16,
        gap: 12,
        background: "var(--gw-bg-elev)",
        border: "1px solid var(--gw-border)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13 }}>Insert video</div>

      <div style={{ display: "flex", gap: 4 }}>
        <SubTab active={source === "url"} onClick={() => setSource("url")}>
          URL
        </SubTab>
        <SubTab active={source === "upload"} onClick={() => setSource("upload")}>
          Upload file
        </SubTab>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (shown on the play card)"
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "var(--gw-bg)",
          color: "var(--gw-fg)",
          border: "1px solid var(--gw-border)",
          fontSize: 13,
          outline: "none",
        }}
      />

      {source === "url" ? (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=… or https://example.com/clip.mp4"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--gw-bg)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            outline: "none",
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            style={{ fontSize: 12 }}
          />
          {uploading && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>Uploading…</div>
          )}
          {url && !uploading && (
            <div
              style={{
                fontSize: 12,
                color: "var(--gw-success)",
                fontWeight: 600,
              }}
            >
              Uploaded — ready to insert.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "8px 14px",
            borderRadius: 100,
            background: "transparent",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canInsert}
          onClick={() => onInsert(title, url.trim())}
          style={{
            padding: "8px 14px",
            borderRadius: 100,
            background: "var(--rsd-accent)",
            color: "var(--rsd-accent-on)",
            border: "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: canInsert ? "pointer" : "not-allowed",
            opacity: canInsert ? 1 : 0.5,
          }}
        >
          Insert
        </button>
      </div>
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

function SubTab({
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
        padding: "4px 10px",
        borderRadius: 6,
        background: active ? "var(--gw-bg)" : "transparent",
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
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
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
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 4v4" />
      <path d="M3 4h1.5" />
      <path d="M3 14h3l-3 3h3" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 9l4-2v10l-4-2" />
    </svg>
  );
}
