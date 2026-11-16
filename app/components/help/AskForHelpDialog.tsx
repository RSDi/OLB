"use client";
// ? → Ask for help: stuck, something broken, or an idea, in one box. The page
// address, page title and browser go along by themselves. Optional: one
// screenshot (Attach, or paste into the box) and one video (Record screen on
// a computer, or Attach video, like a phone's own screen recording). Either
// can be dragged onto the dialog. While recording, the dialog steps aside for
// a small bar so the person can show the problem. Files go straight to
// storage on Send. Ported from Operations.
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { sendHelpRequest, startHelpUpload } from "../../../lib/help-requests/actions";
import { checkHelpUpload, HELP_BUCKET, HELP_IMAGE_TYPES, HELP_VIDEO_TYPES, type HelpUploadKind } from "../../../lib/help-requests/model";
import { Icons } from "../icons";
import { Pill } from "../ui";
import { HelpDialog } from "./HelpDialog";
import { canRecordScreen, useScreenRecorder } from "./useScreenRecorder";

type Attachment = { file: File; url: string; note?: string };

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AskForHelpDialog({ onClose, onShowMine }: { onClose: () => void; onShowMine: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [image, setImage] = useState<Attachment | null>(null);
  const [video, setVideo] = useState<Attachment | null>(null);
  const [dragging, setDragging] = useState(false);
  const [canRecord] = useState(canRecordScreen);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // Preview links are freed when the dialog closes.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const list = urls.current;
    return () => list.forEach(u => URL.revokeObjectURL(u));
  }, []);
  function keep(file: File, note?: string): Attachment {
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { file, url, note };
  }

  const recorder = useScreenRecorder((file, withMic) => {
    setVideo(keep(file, withMic ? undefined : "Recorded without your microphone"));
  });
  const recording = recorder.state.phase === "recording" ? recorder.state : null;
  const trimmed = text.trim();
  const locked = busy || sent || !!recording;

  function attach(kind: HelpUploadKind, file: File | null | undefined) {
    if (!file) return;
    const bad = checkHelpUpload(kind, file.type, file.size);
    if (bad) {
      setError(bad);
      return;
    }
    setError(null);
    const named = kind === "screenshot" && !file.name ? new File([file], "Pasted image.png", { type: file.type }) : file;
    if (kind === "screenshot") setImage(keep(named));
    else setVideo(keep(named));
  }

  function onPaste(e: React.ClipboardEvent) {
    if (locked) return;
    const file = Array.from(e.clipboardData.items)
      .find(i => i.kind === "file" && i.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    e.preventDefault();
    attach("screenshot", file);
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  function onDragOver(e: React.DragEvent) {
    if (locked || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }
  function onDrop(e: React.DragEvent) {
    if (locked || !hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const img = files.find(f => f.type.startsWith("image/"));
    const vid = files.find(f => f.type.startsWith("video/"));
    if (!img && !vid) {
      attach("screenshot", files[0]);
      return;
    }
    if (img) attach("screenshot", img);
    if (vid) attach("video", vid);
  }

  async function upload(kind: HelpUploadKind, a: Attachment | null): Promise<string | null> {
    if (!a) return null;
    setProgress(kind === "video" ? "Uploading the video…" : "Uploading the screenshot…");
    const start = await startHelpUpload({ kind, contentType: a.file.type, size: a.file.size });
    if ("error" in start && start.error) throw new Error(start.error);
    const { path, token } = start as { path: string; token: string };
    const { error: upErr } = await createClient()
      .storage.from(HELP_BUCKET)
      .uploadToSignedUrl(path, token, a.file, { contentType: a.file.type });
    if (upErr) throw new Error(`Couldn't upload the ${kind}. Check your connection and try again.`);
    return path;
  }

  async function send() {
    if (!trimmed || locked) return;
    setBusy(true);
    setError(null);
    try {
      const screenshotPath = await upload("screenshot", image);
      const videoPath = await upload("video", video);
      setProgress("Sending…");
      const res = await sendHelpRequest({
        body: trimmed,
        pageUrl: window.location.href,
        pageTitle: document.title,
        userAgent: navigator.userAgent,
        screenshotPath,
        videoPath,
      });
      if (res.error) throw new Error(res.error);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const footer = sent ? (
    <>
      <Pill variant="ghost" size="sm" onClick={onShowMine}>
        My requests
      </Pill>
      <Pill variant="accent" size="sm" onClick={onClose}>
        Done
      </Pill>
    </>
  ) : (
    <>
      {progress && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginRight: "auto" }}>{progress}</span>}
      <Pill variant="ghost" size="sm" onClick={onClose} disabled={busy}>
        Cancel
      </Pill>
      <Pill variant="accent" size="sm" onClick={send} disabled={!trimmed || locked}>
        {busy ? "Sending…" : "Send"}
      </Pill>
    </>
  );

  return (
    <>
      <HelpDialog
        title="Ask for help"
        icon={<Icons.LifeBuoy width={16} height={16} />}
        onClose={onClose}
        canClose={!busy && !recording}
        footer={footer}
        hidden={!!recording}
      >
        {sent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>Thanks, it&apos;s on its way.</strong>
            <span style={{ color: "var(--gw-fg-muted)" }}>
              The board will get back to you. You&apos;ll see a dot on <strong>?</strong> when they reply, and you can read it
              under <strong>My requests</strong>.
            </span>
          </div>
        ) : (
          <div
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              outline: dragging ? "2px dashed var(--rsd-accent)" : "none",
              outlineOffset: 6,
              borderRadius: 8,
            }}
          >
            <span style={{ color: "var(--gw-fg-muted)", fontSize: 13 }}>
              Stuck, something not working, or have an idea? Tell us what you were trying to do. We&apos;ll see which page
              you&apos;re on.
            </span>
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={busy}
              rows={5}
              maxLength={5000}
              aria-label="What do you need help with?"
              placeholder="What do you need help with?"
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--gw-border)",
                borderRadius: 8,
                fontSize: 14,
                color: "var(--gw-fg)",
                background: "var(--gw-bg)",
                width: "100%",
                resize: "vertical",
                lineHeight: 1.6,
                fontFamily: "inherit",
              }}
            />

            {(image || video) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {image && (
                  <AttachmentRow label={image.file.name || "Screenshot"} onRemove={busy ? undefined : () => setImage(null)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 6 }} />
                  </AttachmentRow>
                )}
                {video && (
                  <AttachmentRow
                    label={video.file.name || "Video"}
                    note={video.note}
                    onRemove={busy ? undefined : () => setVideo(null)}
                  >
                    <video src={video.url} muted style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 6, background: "#000" }} />
                  </AttachmentRow>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!image && (
                <Pill variant="ghost" size="sm" onClick={() => imageInput.current?.click()} disabled={busy}>
                  <Icons.Image width={14} height={14} /> Attach screenshot
                </Pill>
              )}
              {!video && canRecord && (
                <Pill variant="ghost" size="sm" onClick={() => void recorder.start()} disabled={busy}>
                  <Icons.Video width={14} height={14} /> Record screen
                </Pill>
              )}
              {!video && (
                <Pill variant="ghost" size="sm" onClick={() => videoInput.current?.click()} disabled={busy}>
                  <Icons.Paperclip width={14} height={14} /> Attach video
                </Pill>
              )}
            </div>
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
              You can also paste a screenshot here, or drag a picture or video onto this box.
            </span>
            <input
              ref={imageInput}
              type="file"
              accept={HELP_IMAGE_TYPES.join(",")}
              hidden
              onChange={e => {
                attach("screenshot", e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={videoInput}
              type="file"
              accept={HELP_VIDEO_TYPES.join(",")}
              hidden
              onChange={e => {
                attach("video", e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {(error || recorder.error) && (
              <span role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
                {error || recorder.error}
              </span>
            )}
          </div>
        )}
      </HelpDialog>

      {recording && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 1500,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px 10px 16px",
            borderRadius: 100,
            background: "var(--gw-ink, #111)",
            color: "#fff",
            boxShadow: "0 12px 40px rgba(0,0,0,.3)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 10, background: "#e5484d" }} />
          Recording {clock(recording.ms)}
          {!recording.withMic && <span style={{ fontWeight: 500, opacity: 0.75 }}>· no microphone</span>}
          <button
            type="button"
            onClick={recorder.cancel}
            style={{ background: "none", border: "none", color: "#fff", opacity: 0.75, cursor: "pointer", fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={recorder.stop}
            style={{
              background: "#fff",
              color: "#111",
              border: "none",
              borderRadius: 100,
              padding: "6px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>
      )}
    </>
  );
}

function AttachmentRow({
  label,
  note,
  onRemove,
  children,
}: {
  label: string;
  note?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 6,
        border: "1px solid var(--gw-border)",
        borderRadius: 8,
        background: "var(--gw-bg)",
      }}
    >
      {children}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {note && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{note}</div>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          style={{ background: "none", border: "none", color: "var(--gw-fg-muted)", cursor: "pointer", padding: 6, display: "flex" }}
        >
          <Icons.X width={14} height={14} />
        </button>
      )}
    </div>
  );
}
