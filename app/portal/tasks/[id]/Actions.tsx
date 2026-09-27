"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Select, Textarea, Input } from "../../../components/ui";
import { ChipSelect } from "../QueueRow";
import { getRecordedCommentState } from "../../../../lib/reelnotes/actions";
import {
  changeTicketStatus,
  changeTicketPriority,
  assignTicket,
  addTicketComment,
  softDeleteTicket,
  castRequestVote,
  decideRequest,
  addSubtasks,
  addSubtasksFromActionItems,
  setTaskSchedule,
  setTaskDeadline,
  type TicketStatus,
  type VoteValue,
} from "../../../../lib/maintenance/actions";
import { memberDisplayName } from "../../../../lib/members/display";

// Status / Priority / Assigned-to render as editable "oval" chip selects in the
// task's Details card (staff only). They update optimistically and refresh the
// page on success so the matching chips elsewhere (e.g. the description header)
// stay in sync; on error they roll back and alert.
function statusChipClass(s: TicketStatus): string {
  if (s === "open") return "rsd-chip-warn";
  if (s === "in_progress") return "rsd-chip-accent";
  if (s === "cancelled") return "rsd-chip-mute";
  return "rsd-chip-success";
}

export function StatusSelect({ ticketId, current }: { ticketId: string; current: TicketStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<TicketStatus>(current);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TicketStatus;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeTicketStatus(ticketId, next);
      if (result.error) {
        setValue(previous);
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ChipSelect value={value} onChange={handleChange} disabled={pending} chipClass={statusChipClass(value)}>
      <option value="open">Open</option>
      <option value="in_progress">In Progress</option>
      <option value="done">Done</option>
      <option value="cancelled">Cancelled</option>
    </ChipSelect>
  );
}

export function PrioritySelect({
  ticketId,
  current,
  priorities,
}: {
  ticketId: string;
  current: string;
  priorities: { id: string; label: string; chip_class: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeTicketPriority(ticketId, next);
      if (result.error) {
        setValue(previous);
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  const chipClass = priorities.find((p) => p.id === value)?.chip_class ?? "rsd-chip-mute";
  return (
    <ChipSelect value={value} onChange={handleChange} disabled={pending} chipClass={chipClass}>
      {priorities.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </ChipSelect>
  );
}

interface StaffMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string;
}

export function AssignSelect({
  ticketId,
  current,
  staff,
}: {
  ticketId: string;
  current: string | null;
  staff: StaffMember[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await assignTicket(ticketId, next || null);
      if (result.error) {
        setValue(previous);
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ChipSelect value={value} onChange={handleChange} disabled={pending} chipClass="rsd-chip-mute">
      <option value="">Unassigned</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {memberDisplayName(s)}
        </option>
      ))}
    </ChipSelect>
  );
}

export function CommentForm({
  ticketId,
  parentId,
  onPosted,
  onCancel,
  placeholder,
  submitLabel,
  compact,
  enableRecording,
}: {
  ticketId: string;
  parentId?: string;
  onPosted?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
  // Top-level composer only: offer recording the comment instead of typing it.
  // The audio is transcribed by ReelNotes and posted back as a comment.
  enableRecording?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recording state (only used when enableRecording).
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // The recording being processed, so we can poll for its comment + auto-refresh.
  const [recordingId, setRecordingId] = useState<string | null>(null);
  // A recording that failed transcription, kept so the user can retry it inline.
  const [failedRecordingId, setFailedRecordingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await addTicketComment(ticketId, trimmed, parentId ?? null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
      onPosted?.();
    });
  }

  async function retryFailedTranscription() {
    if (!failedRecordingId) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/reelnotes/recordings/${failedRecordingId}/retry-transcription`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Retry failed (${res.status})`);
      }
      // Re-submitted: resume polling for the fresh job.
      setRecordingId(failedRecordingId);
      setFailedRecordingId(null);
      setTranscribing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  async function startRecording() {
    setError(null);
    setFailedRecordingId(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void uploadRecording(blob, mimeType, elapsedRef.current);
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

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setIsRecording(false);
  }

  async function uploadRecording(blob: Blob, mimeType: string, durationSec: number) {
    setUploading(true);
    setError(null);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `recording.${ext}`);
      form.append("duration_sec", String(durationSec));
      form.append("source", "pwa");
      form.append("mime_type", mimeType);
      form.append("linked_entity_type", "task");
      form.append("linked_entity_id", ticketId);
      const res = await fetch("/api/reelnotes/upload", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }
      // Transcription is async — the comment posts when the webhook completes.
      // Grab the recording id so we can poll for it and auto-refresh.
      const json = await res.json().catch(() => null);
      const recId = (json as { recording?: { id?: string } } | null)?.recording?.id ?? null;
      setRecordingId(recId);
      setTranscribing(true);
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // While a recording is processing, poll for its comment to land and then
  // auto-refresh (no manual Refresh needed). Stops on failure or after a few
  // minutes, leaving the manual Refresh as a fallback.
  useEffect(() => {
    if (!transcribing || !recordingId) return;
    let attempts = 0;
    const maxAttempts = 45; // ~3 min at 4s intervals
    const iv = setInterval(async () => {
      attempts += 1;
      const st = await getRecordedCommentState(ticketId, recordingId);
      if (st.posted) {
        clearInterval(iv);
        setTranscribing(false);
        setRecordingId(null);
        router.refresh();
      } else if (st.failed) {
        clearInterval(iv);
        setTranscribing(false);
        // Keep the id so the user can retry without re-recording; surface
        // AssemblyAI's real reason when we have it.
        setFailedRecordingId(recordingId);
        setRecordingId(null);
        setError(st.error ? `Transcription failed: ${st.error}` : "That recording couldn't be transcribed.");
      } else if (attempts >= maxAttempts) {
        clearInterval(iv);
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [transcribing, recordingId, ticketId, router]);

  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  // Mid-recording: a focused control replaces the compose form.
  if (isRecording) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Pill variant="ghost" size="sm" onClick={stopRecording}>
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gw-error)", display: "inline-block", marginRight: 6, animation: "pulse 1.2s infinite" }}
          />
          Stop · {mins}:{secs}
        </Pill>
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>Recording…</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? "Add a comment…"}
        rows={compact ? 2 : 3}
        required
        autoFocus={Boolean(parentId)}
      />
      {error && <ErrorLine message={error} />}
      {failedRecordingId && !transcribing && (
        <button
          type="button"
          onClick={retryFailedTranscription}
          disabled={retrying}
          className="gw-press"
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 100,
            background: "var(--rsd-accent-fill)",
            color: "var(--rsd-accent-fill-on)",
            border: "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: retrying ? "default" : "pointer",
          }}
        >
          <Icons.Refresh width={12} height={12} />
          {retrying ? "Retrying…" : "Retry transcription"}
        </button>
      )}
      {transcribing && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rsd-accent)", display: "inline-block", animation: "pulse 1.2s infinite" }}
          />
          Transcribing your recording — it’ll appear here automatically when it’s ready.{" "}
          <button
            type="button"
            onClick={() => { setTranscribing(false); setRecordingId(null); router.refresh(); }}
            style={{ background: "none", border: "none", padding: 0, color: "var(--rsd-accent)", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh now
          </button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
        {enableRecording && !parentId && (
          <Pill
            variant="ghost"
            size="sm"
            onClick={startRecording}
            disabled={uploading || pending}
            style={{ marginRight: "auto" }}
          >
            <Icons.Mic width={13} height={13} style={{ color: "var(--gw-error)", marginRight: 6 }} />
            {uploading ? "Uploading…" : "Record"}
          </Pill>
        )}
        {onCancel && (
          <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Pill>
        )}
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : submitLabel ?? "Post comment"}
        </Pill>
      </div>
    </form>
  );
}

export function DeleteButton({ ticketId, childCount = 0 }: { ticketId: string; childCount?: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Soft-delete this request? You can restore it from Settings → Deleted.")) return;
    // A parent ("project"): ask whether to take its sub-tasks down with it or
    // keep them as standalone tasks. OK = delete them too; Cancel = keep them.
    let cascadeChildren = false;
    if (childCount > 0) {
      cascadeChildren = confirm(
        `This has ${childCount} to-do${childCount === 1 ? "" : "s"}.\n\n` +
          `OK — delete the to-do${childCount === 1 ? "" : "s"} too.\n` +
          `Cancel — keep ${childCount === 1 ? "it" : "them"} as standalone task${childCount === 1 ? "" : "s"}.`,
      );
    }
    setError(null);
    startTransition(async () => {
      const result = await softDeleteTicket(ticketId, { cascadeChildren });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portal/tasks");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: "var(--gw-error-bg)",
          color: "var(--gw-error)",
          border: "1px solid rgba(229,62,62,.25)",
          fontSize: 13,
          fontWeight: 700,
          cursor: pending ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Icons.Trash width={14} height={14} />
        {pending ? "Deleting…" : "Delete request"}
      </button>
      {error && <ErrorLine message={error} />}
    </div>
  );
}

// A3: record what a task actually cost. Saved on blur / Enter.
function ErrorLine({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>
      <Icons.AlertCircle width={12} height={12} />
      {message}
    </div>
  );
}

// Board review (migrations 0050 + 0074): members cast advisory yes/no votes
// (a "no" needs a reason), then any one member finalizes with a manual Approve
// or Decline + a note that's emailed to the requester. Shown while pending_review.
export interface VoteRow {
  voterName: string;
  vote: VoteValue;
  note: string | null;
  isMe: boolean;
}

export function VotePanel({
  ticketId,
  votes,
  yesCount,
  noCount,
  waitingOn,
  myVote,
}: {
  ticketId: string;
  votes: VoteRow[];
  yesCount: number;
  noCount: number;
  waitingOn: string[];
  myVote: VoteValue | null;
}) {
  const router = useRouter();
  const [decliningNote, setDecliningNote] = useState(false);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState<null | "approved" | "declined">(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cast(vote: VoteValue, voteNote?: string) {
    setError(null);
    startTransition(async () => {
      const r = await castRequestVote(ticketId, vote, voteNote);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDecliningNote(false);
      setNote("");
      router.refresh();
    });
  }

  function openDecision(decision: "approved" | "declined") {
    setError(null);
    setDeciding(decision);
    setDecisionNote(
      decision === "approved" ? "Good news — the board approved your request." : "",
    );
  }

  function submitDecision() {
    if (!deciding) return;
    setError(null);
    startTransition(async () => {
      const r = await decideRequest(ticketId, deciding, decisionNote);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(
        deciding === "approved"
          ? "Request approved — the requester has been emailed."
          : "Request declined — the requester has been emailed.",
      );
      setDeciding(null);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Advisory tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
        <span className="rsd-chip rsd-chip-accent">{yesCount} yes</span>
        <span className="rsd-chip rsd-chip-warn">{noCount} no</span>
        <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}>advisory</span>
      </div>

      {/* Votes cast so far */}
      {votes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {votes.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline" }}>
              {v.vote === "yes" ? (
                <Icons.CheckCircle width={13} height={13} style={{ color: "var(--rsd-accent)", flexShrink: 0, alignSelf: "center" }} />
              ) : (
                <Icons.X width={13} height={13} style={{ color: "var(--gw-error)", flexShrink: 0, alignSelf: "center" }} />
              )}
              <span style={{ fontWeight: 600 }}>
                {v.voterName}
                {v.isMe ? " (you)" : ""}
              </span>
              {v.note && <span style={{ color: "var(--gw-fg-muted)" }}>— {v.note}</span>}
            </div>
          ))}
        </div>
      )}
      {waitingOn.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          Waiting on: {waitingOn.join(", ")}
        </div>
      )}

      {/* My advisory vote — a compact Yes/No toggle that highlights your pick. */}
      {!decliningNote ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            Your vote
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <Pill
              variant={myVote === "yes" ? "accent" : "ghost"}
              size="sm"
              onClick={() => cast("yes")}
              disabled={pending || myVote === "yes"}
              style={{ flex: 1, justifyContent: "center" }}
            >
              <Icons.CheckCircle width={14} height={14} /> Yes
            </Pill>
            <Pill
              variant="ghost"
              size="sm"
              onClick={() => {
                setDecliningNote(true);
                setError(null);
              }}
              disabled={pending || myVote === "no"}
              style={{
                flex: 1,
                justifyContent: "center",
                ...(myVote === "no"
                  ? { background: "var(--gw-error-bg)", borderColor: "var(--gw-error)", color: "var(--gw-error)" }
                  : {}),
              }}
            >
              <Icons.X width={14} height={14} /> No
            </Pill>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea
            label="Reason for voting no"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Required — shared with the requester if the request is declined."
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Pill
              variant="ghost"
              size="sm"
              onClick={() => {
                setDecliningNote(false);
                setNote("");
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Pill>
            <Pill
              variant="accent"
              size="sm"
              onClick={() => cast("no", note)}
              disabled={pending || !note.trim()}
              style={{ background: "var(--rsd-error-fill)", borderColor: "var(--rsd-error-fill)", color: "#fff" }}
            >
              {pending ? "Voting…" : "Confirm no vote"}
            </Pill>
          </div>
        </div>
      )}
      {/* Manual decision — any one board member finalizes. */}
      <div style={{ borderTop: "1px solid var(--gw-border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
          Finalize decision
        </div>
        {deciding === null ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="accent" size="md" onClick={() => openDecision("approved")} disabled={pending} style={{ flex: 1, justifyContent: "center" }}>
              <Icons.CheckCircle width={15} height={15} /> Approve
            </Pill>
            <Pill variant="ghost" size="md" onClick={() => openDecision("declined")} disabled={pending} style={{ flex: 1, justifyContent: "center" }}>
              <Icons.X width={15} height={15} /> Decline
            </Pill>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Textarea
              label={deciding === "approved" ? "Note to the requester (emailed)" : "Reason — emailed to the requester"}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              rows={4}
              placeholder={deciding === "approved" ? "Sent with the approval — edit as needed." : "Required — explain why it wasn't approved."}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Pill variant="ghost" size="sm" onClick={() => { setDeciding(null); setError(null); }} disabled={pending}>
                Cancel
              </Pill>
              <Pill
                variant="accent"
                size="sm"
                onClick={submitDecision}
                disabled={pending || (deciding === "declined" && !decisionNote.trim())}
                style={deciding === "declined" ? { background: "var(--rsd-error-fill)", borderColor: "var(--rsd-error-fill)", color: "#fff" } : undefined}
              >
                {pending ? "Saving…" : deciding === "approved" ? "Approve & send" : "Decline & send"}
              </Pill>
            </div>
          </div>
        )}
      </div>

      {done && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rsd-accent)" }}>{done}</div>
      )}
      {error && <ErrorLine message={error} />}
    </div>
  );
}

// Add sub-tasks to a task — turning it into a "project". Any member may add to
// their own task; staff to any. One textarea, one sub-task per line. Inline so
// there's no trip to a separate form.
export function AddSubtask({ parentId }: { parentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      setError("Add at least one to-do.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addSubtasks(parentId, lines);
      if (r.error) {
        setError(r.error);
        return;
      }
      setText("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Pill variant="ghost" size="sm" onClick={() => setOpen(true)} style={{ justifyContent: "center" }}>
        <Icons.Plus width={14} height={14} /> Add a to-do
      </Pill>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Textarea
        label="To-Dos (one per line)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        placeholder={"Confirm booking & details\nSet up tables & chairs\nOpen & lock the building"}
      />
      {error && <ErrorLine message={error} />}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Pill>
      </div>
    </div>
  );
}

// "Turn into sub-tasks" — from a recorded note's action items, create one
// sub-task per ticked item on this task (carrying owner + priority). Items
// already turned into a task (task_id set) show as added and can't re-add.
export function PromoteFromRecording({
  parentId,
  recordingId,
  items,
}: {
  parentId: string;
  recordingId: string;
  items: { id: string; text: string; task_id?: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const available = items.filter((i) => !i.task_id);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(available.map((i) => [i.id, true])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (available.length === 0) return null;

  const chosen = available.filter((i) => checked[i.id]).map((i) => i.id);

  function submit() {
    if (chosen.length === 0) {
      setError("Pick at least one item.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addSubtasksFromActionItems(parentId, recordingId, chosen);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gw-press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 10px",
          borderRadius: 100,
          background: "transparent",
          color: "var(--rsd-accent)",
          border: "1px dashed var(--gw-border)",
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <Icons.LayoutDashboard width={11} height={11} /> Turn into to-dos
      </button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        border: "1px solid var(--gw-border)",
        borderRadius: 10,
        background: "var(--gw-bg-elev)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
        Pick the items to add as to-dos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {available.map((i) => (
          <label key={i.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!checked[i.id]}
              onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))}
              style={{ marginTop: 3 }}
            />
            <span style={{ color: "var(--gw-fg)", lineHeight: 1.45 }}>{i.text}</span>
          </label>
        ))}
      </div>
      {error && <ErrorLine message={error} />}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" onClick={submit} disabled={pending || chosen.length === 0}>
          {pending ? "Adding…" : `Add ${chosen.length} to-do${chosen.length === 1 ? "" : "s"}`}
        </Pill>
      </div>
    </div>
  );
}

// "When" — schedule a task: Active (no date), Scheduled for a day (a "later"
// item until then), or Someday (parked). Distinct from the deadline.
export function WhenControl({
  taskId,
  startOn,
  someday,
}: {
  taskId: string;
  startOn: string | null;
  someday: boolean;
}) {
  const router = useRouter();
  const initialMode: "active" | "scheduled" | "someday" = someday ? "someday" : startOn ? "scheduled" : "active";
  const [mode, setMode] = useState<"active" | "scheduled" | "someday">(initialMode);
  const [date, setDate] = useState(startOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { startOn?: string | null; someday?: boolean }) {
    setError(null);
    startTransition(async () => {
      const r = await setTaskSchedule(taskId, next);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMode(e: React.ChangeEvent<HTMLSelectElement>) {
    const m = e.target.value as "active" | "scheduled" | "someday";
    setMode(m);
    if (m === "active") {
      setDate("");
      save({ startOn: null, someday: false });
    } else if (m === "someday") {
      setDate("");
      save({ someday: true });
    } else if (date) {
      save({ startOn: date, someday: false });
    }
  }

  function handleDate(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value;
    setDate(d);
    if (d) save({ startOn: d, someday: false });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Select
        label="When"
        help="When you'll start working on it — separate from the deadline. Someday parks it out of the active list."
        value={mode}
        onChange={handleMode}
        disabled={pending}
      >
        <option value="active">Active</option>
        <option value="scheduled">Scheduled…</option>
        <option value="someday">Someday</option>
      </Select>
      {mode === "scheduled" && (
        <Input type="date" value={date} onChange={handleDate} disabled={pending} />
      )}
      {error && <ErrorLine message={error} />}
    </div>
  );
}

// "Deadline" — a hard due date, shown in red when overdue. Independent of When.
export function DeadlineControl({ taskId, dueOn }: { taskId: string; dueOn: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(dueOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(d: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setTaskDeadline(taskId, d);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Input
        type="date"
        label="Deadline"
        help="A hard due date — shown in red when overdue. Separate from when you'll start."
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          save(e.target.value || null);
        }}
        disabled={pending}
      />
      {date && (
        <button
          type="button"
          onClick={() => {
            setDate("");
            save(null);
          }}
          disabled={pending}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--gw-fg-muted)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Clear deadline
        </button>
      )}
      {error && <ErrorLine message={error} />}
    </div>
  );
}
