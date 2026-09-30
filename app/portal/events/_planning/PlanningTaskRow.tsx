"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlanningTaskDone } from "../../../../lib/planning/actions";
import { lastDayOf } from "../../../../lib/planning/season";
import type { PlanningTask } from "../../../../lib/planning/types";
import { PlaybookChip, RoleChip } from "./chips";
import { formatPlainDate } from "./format";

// One kept task on the calendar, the Year view or a meeting page: tick it off
// in place, or open it (assign, comment, to-dos) on its task page.
export function PlanningTaskRow({ task, compact = false }: { task: PlanningTask; compact?: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(task.status === "done");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !done;
    setDone(next);
    setError(null);
    startTransition(async () => {
      const res = await setPlanningTaskDone(task.id, next);
      if (res.error) {
        setDone(!next);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  // A deadline someone set on the task (not just "by the end of the month").
  const customDue = task.dueOn && task.dueOn !== lastDayOf(task.month) ? task.dueOn : null;

  return (
    <div
      data-tour="planning-task"
      style={{
        display: "flex",
        gap: compact ? 8 : 12,
        alignItems: "flex-start",
        padding: compact ? "6px 0" : "10px 18px",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        title={done ? "Done. Tap to reopen" : "Mark done"}
        className="gw-press"
        style={{
          width: compact ? 18 : 22,
          height: compact ? 18 : 22,
          marginTop: compact ? 1 : 0,
          flexShrink: 0,
          borderRadius: 100,
          border: `2px solid ${done ? "var(--rsd-accent)" : "var(--gw-border)"}`,
          background: done ? "var(--rsd-accent-fill)" : "transparent",
          color: "var(--rsd-accent-fill-on)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: pending ? "wait" : "pointer",
          padding: 0,
        }}
      >
        {done && (
          <svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/portal/tasks/${task.id}`}
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: compact ? 600 : 700,
            color: done ? "var(--gw-fg-muted)" : "var(--gw-fg)",
            textDecoration: done ? "line-through" : "none",
            lineHeight: 1.4,
          }}
        >
          {task.title}
        </Link>
        {!compact && task.notes && (
          <div
            style={{
              fontSize: 12,
              color: "var(--gw-fg-muted)",
              marginTop: 2,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {task.notes}
          </div>
        )}
        {(task.role || task.playbook || (!compact && (task.assignee || customDue))) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
            <RoleChip role={task.role} />
            <PlaybookChip playbook={task.playbook} />
            {!compact && customDue && (
              <span className="rsd-chip rsd-chip-warn">Due {formatPlainDate(customDue)}</span>
            )}
            {!compact && task.assignee && (
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{task.assignee}</span>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "var(--gw-error)", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}
