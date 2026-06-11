"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Select, Textarea, Input } from "../../../components/ui";
import {
  changeTicketStatus,
  assignTicket,
  addTicketComment,
  softDeleteTicket,
  castRequestVote,
  type TicketStatus,
  type VoteValue,
} from "../../../../lib/maintenance/actions";
import { promoteTaskToProject } from "../../../../lib/projects/actions";

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
            {s.full_name ?? s.email}
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
}: {
  ticketId: string;
  parentId?: string;
  onPosted?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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

export function DeleteButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Soft-delete this request? You can restore it from Settings → Deleted.")) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteTicket(ticketId);
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

// "A task became 2+ things to get done" — turn this request into a Project and
// seed the coordinated steps. The original request becomes the first task.
export function PromoteToProject({ ticketId, defaultTitle }: { ticketId: string; defaultTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [stepsText, setStepsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) {
      setError("Give the project a title.");
      return;
    }
    const steps = stepsText.split("\n").map((s) => s.trim()).filter(Boolean);
    setError(null);
    startTransition(async () => {
      const r = await promoteTaskToProject(ticketId, { title: title.trim(), steps });
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.projectId) router.push(`/portal/tasks/projects/${r.projectId}`);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <Pill variant="ghost" size="sm" onClick={() => setOpen(true)} style={{ justifyContent: "center" }}>
        <Icons.LayoutDashboard width={14} height={14} /> Bigger than one task? Make it a project
      </Pill>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Input label="Project title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea
        label="Steps (one per line)"
        value={stepsText}
        onChange={(e) => setStepsText(e.target.value)}
        rows={5}
        placeholder={"Confirm booking & details\nSet up tables & chairs\nKitchen access\nOpen & lock the building\nCustodial cleanup"}
      />
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
        This request becomes the first task; each line adds another.
      </div>
      {error && <ErrorLine message={error} />}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Pill>
      </div>
    </div>
  );
}
