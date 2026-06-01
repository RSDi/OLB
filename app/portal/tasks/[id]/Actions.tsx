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
  approveRequest,
  declineRequest,
  type TicketStatus,
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

// Committee decision: approve, or decline with a required reason (emailed to
// the requester). Shown only while review_status is 'pending_review'.
export function ReviewActions({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveRequest(ticketId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }
  function decline() {
    if (!reason.trim()) {
      setError("Please add a reason for the requester.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await declineRequest(ticketId, reason.trim());
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!declining ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Pill variant="accent" size="md" onClick={approve} disabled={pending} style={{ flex: 1, justifyContent: "center" }}>
            <Icons.CheckCircle width={15} height={15} /> Approve
          </Pill>
          <Pill
            variant="ghost"
            size="md"
            onClick={() => {
              setDeclining(true);
              setError(null);
            }}
            disabled={pending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Icons.X width={15} height={15} /> Decline
          </Pill>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea
            label="Reason for declining"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Shared with the requester."
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Pill
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeclining(false);
                setReason("");
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Pill>
            <Pill
              variant="accent"
              size="sm"
              onClick={decline}
              disabled={pending || !reason.trim()}
              style={{ background: "var(--gw-error)", borderColor: "var(--gw-error)", color: "#fff" }}
            >
              {pending ? "Declining…" : "Confirm decline"}
            </Pill>
          </div>
        </div>
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
