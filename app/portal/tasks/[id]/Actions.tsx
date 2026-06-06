"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Select, Textarea } from "../../../components/ui";
import {
  changeTicketStatus,
  assignTicket,
  addTicketComment,
  softDeleteTicket,
  type TicketStatus,
} from "../../../../lib/maintenance/actions";

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
