"use client";
import { useState, useTransition, type ChangeEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  changeTicketPriority,
  changeTicketStatus,
  assignTicket,
  type TicketStatus,
} from "../../../lib/maintenance/actions";
import { memberDisplayName } from "../../../lib/members/display";

interface PriorityOption {
  id: string;
  label: string;
  chip_class: string;
}

interface StaffMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string;
}

interface Submitter {
  full_name: string | null;
  nickname: string | null;
  email: string;
}

interface TicketRow {
  id: string;
  description: string;
  status: TicketStatus;
  review_status: "pending_review" | "approved" | "declined";
  reviewed_at: string | null;
  created_at: string;
  submitted_by: string | null;
  assigned_to: string | null;
  category: { name: string; chip_class: string } | null;
  area: { name: string } | null;
  priority: { id: string; label: string; chip_class: string } | null;
}

export function QueueRow({
  ticket,
  submitter,
  staff,
  priorities,
  staffList,
}: {
  ticket: TicketRow;
  submitter: Submitter | null;
  staff: boolean;
  priorities: PriorityOption[];
  staffList: StaffMember[];
}) {
  const router = useRouter();
  const [hover, setHover] = useState(false);

  function handleRowClick() {
    router.push(`/portal/tasks/${ticket.id}`);
  }

  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <tr
      onClick={handleRowClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: "pointer",
        background: hover ? "var(--gw-bg-elev)" : "transparent",
        transition: "background 120ms",
      }}
    >
      <td>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)", lineHeight: 1.3 }}>
          {truncate(ticket.description, 80)}
        </div>
      </td>
      <td>
        {ticket.category ? (
          <span className={`rsd-chip ${ticket.category.chip_class}`} style={{ fontSize: 11 }}>
            {ticket.category.name}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>{ticket.area?.name ?? "—"}</td>
      <td onClick={stop}>
        {staff ? (
          <InlinePrioritySelect
            ticketId={ticket.id}
            current={ticket.priority?.id ?? ""}
            priorities={priorities}
          />
        ) : ticket.priority ? (
          <span className={`rsd-chip ${ticket.priority.chip_class}`}>{ticket.priority.label}</span>
        ) : (
          "—"
        )}
      </td>
      <td onClick={stop}>
        {ticket.review_status === "pending_review" ? (
          <span className="rsd-chip rsd-chip-warn">Pending review</span>
        ) : ticket.review_status === "declined" ? (
          <span className="rsd-chip rsd-chip-warn">Declined</span>
        ) : staff ? (
          <InlineStatusSelect ticketId={ticket.id} current={ticket.status} />
        ) : (
          // For a member, lead with the committee's decision when one was
          // actually made (reviewed_at set), then the work status.
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {ticket.reviewed_at && <span className="rsd-chip rsd-chip-accent">Approved</span>}
            {statusChip(ticket.status)}
          </span>
        )}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>{formatDate(ticket.created_at)}</td>
      {staff && <td>{submitter ? memberDisplayName(submitter) : "—"}</td>}
      {staff && (
        <td onClick={stop}>
          <InlineAssignSelect ticketId={ticket.id} current={ticket.assigned_to} staff={staffList} />
        </td>
      )}
    </tr>
  );
}

function InlineStatusSelect({ ticketId, current }: { ticketId: string; current: TicketStatus }) {
  const [value, setValue] = useState<TicketStatus>(current);
  const [pending, startTransition] = useTransition();

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TicketStatus;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeTicketStatus(ticketId, next);
      if (result.error) {
        setValue(prev);
        window.alert(result.error);
      }
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

function InlinePrioritySelect({
  ticketId,
  current,
  priorities,
}: {
  ticketId: string;
  current: string;
  priorities: PriorityOption[];
}) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeTicketPriority(ticketId, next);
      if (result.error) {
        setValue(prev);
        window.alert(result.error);
      }
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

function InlineAssignSelect({
  ticketId,
  current,
  staff,
}: {
  ticketId: string;
  current: string | null;
  staff: StaffMember[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, startTransition] = useTransition();

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await assignTicket(ticketId, next || null);
      if (result.error) {
        setValue(prev);
        window.alert(result.error);
      }
    });
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={pending}
      style={{
        padding: "4px 26px 4px 10px",
        height: 28,
        borderRadius: 6,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg)",
        fontSize: 12,
        fontWeight: 600,
        color: value ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        appearance: "none",
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.5 : 1,
        maxWidth: 180,
        backgroundImage: chevronSvg("#888"),
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      <option value="">Unassigned</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {memberDisplayName(s)}
        </option>
      ))}
    </select>
  );
}

function ChipSelect({
  value,
  onChange,
  disabled,
  chipClass,
  children,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  disabled: boolean;
  chipClass: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`rsd-chip ${chipClass}`}
      style={{
        appearance: "none",
        paddingRight: 24,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid currentColor",
        opacity: disabled ? 0.5 : 1,
        backgroundImage: chevronSvg("currentColor"),
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      {children}
    </select>
  );
}

function statusChip(s: TicketStatus) {
  if (s === "open") return <span className="rsd-chip rsd-chip-warn">Open</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "cancelled") return <span className="rsd-chip rsd-chip-mute">Cancelled</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function statusChipClass(s: TicketStatus): string {
  if (s === "open") return "rsd-chip-warn";
  if (s === "in_progress") return "rsd-chip-accent";
  if (s === "cancelled") return "rsd-chip-mute";
  return "rsd-chip-success";
}

function chevronSvg(stroke: string): string {
  const escaped = stroke === "currentColor" ? "currentColor" : encodeURIComponent(stroke);
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${escaped}' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
