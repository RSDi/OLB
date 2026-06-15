"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Select, Textarea } from "../../../components/ui";
import {
  changeTicketStatus,
  assignTicket,
  addTicketComment,
  softDeleteTicket,
  castRequestVote,
  addSubtasks,
  addSubtasksFromActionItems,
  type TicketStatus,
  type VoteValue,
} from "../../../../lib/maintenance/actions";
import { memberDisplayName } from "../../../../lib/members/display";

export function StatusSelect({
  ticketId,
  current,
}: {
  ticketId: string;
  current: TicketStatus;
}) {
  const [value, setValue] = useState<TicketStatus>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TicketStatus;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await changeTicketStatus(ticketId, next);
      if (result.error) {
        setError(result.error);
        setValue(previous);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Select label="Status" value={value} onChange={handleChange} disabled={pending}>
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="cancelled">Cancelled</option>
      </Select>
      {error && <ErrorLine message={error} />}
    </div>
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
  const [value, setValue] = useState<string>(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await assignTicket(ticketId, next || null);
      if (result.error) {
        setError(result.error);
        setValue(previous);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Select label="Assigned to" value={value} onChange={handleChange} disabled={pending}>
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {memberDisplayName(s)}
          </option>
        ))}
      </Select>
      {error && <ErrorLine message={error} />}
    </div>
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

  async function startRecording() {
    setError(null);
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
      setTranscribing(true);
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
      {transcribing && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          Transcribing your recording — it’ll post as a comment here in a moment.{" "}
          <button
            type="button"
            onClick={() => { setTranscribing(false); router.refresh(); }}
            style={{ background: "none", border: "none", padding: 0, color: "var(--rsd-accent)", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh
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
        `This has ${childCount} sub-task${childCount === 1 ? "" : "s"}.\n\n` +
          `OK — delete the sub-task${childCount === 1 ? "" : "s"} too.\n` +
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

// Committee voting (migration 0050): every committee member votes yes/no; a
// simple majority decides instantly. "No" requires a note. Votes can be
// changed until the decision lands. Shown only while pending_review.
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
  threshold,
  waitingOn,
  myVote,
}: {
  ticketId: string;
  votes: VoteRow[];
  yesCount: number;
  noCount: number;
  threshold: number;
  waitingOn: string[];
  myVote: VoteValue | null;
}) {
  const router = useRouter();
  const [decliningNote, setDecliningNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decidedMsg, setDecidedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cast(vote: VoteValue, voteNote?: string) {
    setError(null);
    startTransition(async () => {
      const r = await castRequestVote(ticketId, vote, voteNote);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.decided === "approved") setDecidedMsg("That was the deciding vote — request approved. The requester has been notified.");
      if (r.decided === "declined") setDecidedMsg("That was the deciding vote — request declined. The requester has been notified.");
      setDecliningNote(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
        <span className="rsd-chip rsd-chip-accent">{yesCount} yes</span>
        <span className="rsd-chip rsd-chip-warn">{noCount} no</span>
        <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          {threshold} {threshold === 1 ? "vote" : "votes"} decide{threshold === 1 ? "s" : ""} it
        </span>
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

      {/* My vote */}
      {!decliningNote ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Pill
            variant="accent"
            size="md"
            onClick={() => cast("yes")}
            disabled={pending || myVote === "yes"}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Icons.CheckCircle width={15} height={15} /> {myVote === "yes" ? "You voted yes" : myVote ? "Change to yes" : "Vote yes"}
          </Pill>
          <Pill
            variant="ghost"
            size="md"
            onClick={() => {
              setDecliningNote(true);
              setError(null);
            }}
            disabled={pending || myVote === "no"}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Icons.X width={15} height={15} /> {myVote === "no" ? "You voted no" : myVote ? "Change to no" : "Vote no"}
          </Pill>
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
              style={{ background: "var(--gw-error)", borderColor: "var(--gw-error)", color: "#fff" }}
            >
              {pending ? "Voting…" : "Confirm no vote"}
            </Pill>
          </div>
        </div>
      )}
      {decidedMsg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rsd-accent)" }}>{decidedMsg}</div>
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
      setError("Add at least one sub-task.");
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
        <Icons.Plus width={14} height={14} /> Add a sub-task
      </Pill>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Textarea
        label="Sub-tasks (one per line)"
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
        <Icons.LayoutDashboard width={11} height={11} /> Turn into sub-tasks
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
        Pick the items to add as sub-tasks
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
          {pending ? "Adding…" : `Add ${chosen.length} sub-task${chosen.length === 1 ? "" : "s"}`}
        </Pill>
      </div>
    </div>
  );
}
