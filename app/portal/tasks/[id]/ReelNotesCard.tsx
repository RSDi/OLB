"use client";
// B3: record ReelNotes audio without leaving the task. Same MediaRecorder →
// /api/daves-idea/upload flow as the Dave's Idea page, plus linked_ticket_id
// so the recording attaches here: the pipeline posts its summary into this
// task's comment thread when transcription finishes, and the list below shows
// every recording captured on this task.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";

export interface LinkedRecording {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  transcribing: "Transcribing",
  extracting: "Summarizing",
  ready: "Ready",
  failed: "Failed",
};

export function ReelNotesCard({
  ticketId,
  recordings,
}: {
  ticketId: string;
  recordings: LinkedRecording[];
}) {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        void upload(blob, mimeType, elapsedRef.current);
      };
      elapsedRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access denied. Allow mic permission in your browser settings."
          : "Couldn't access the microphone."
      );
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setIsRecording(false);
  }

  async function upload(blob: Blob, mimeType: string, durationSec: number) {
    setUploading(true);
    setError(null);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `recording.${ext}`);
      form.append("duration_sec", String(durationSec));
      form.append("source", "pwa");
      form.append("mime_type", mimeType);
      form.append("linked_ticket_id", ticketId);
      const res = await fetch("/api/daves-idea/upload", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {recordings.map(r => (
        <a
          key={r.id}
          href={`/portal/daves-idea?r=${r.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            textDecoration: "none",
            color: "var(--gw-fg)",
          }}
        >
          <Icons.Mic width={13} height={13} style={{ color: "var(--rsd-accent)", flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
            {r.title || "Untitled recording"}
          </span>
          <span className={`rsd-chip ${r.status === "failed" ? "rsd-chip-warn" : "rsd-chip-mute"}`} style={{ fontSize: 10, flexShrink: 0 }}>
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        </a>
      ))}

      {!isRecording ? (
        <button
          onClick={start}
          disabled={uploading}
          className="gw-press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            cursor: uploading ? "not-allowed" : "pointer",
          }}
        >
          <Icons.Mic width={14} height={14} style={{ color: "var(--gw-error)" }} />
          {uploading ? "Uploading…" : "Record a note on this task"}
        </button>
      ) : (
        <button
          onClick={stop}
          className="gw-press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--gw-error)",
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#fff",
              animation: "pulse 1.2s infinite",
            }}
          />
          Stop · {mins}:{secs}
        </button>
      )}
      <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
        Talk through what you did or what's needed — the transcript and a summary
        comment land on this task automatically.
      </div>
      {error && (
        <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>{error}</div>
      )}
    </div>
  );
}
