"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignShutdown } from "../../../lib/shutdown/actions";

export interface ShutdownTeamMember {
  id: string;
  fullName: string;
}

// Phase 2b: staff pick who's on shutdown for an event. Assigning creates/links
// the shutdown task and posts a heads-up to the team's Slack channel. The
// assignee then runs it from their own task queue.
export function ShutdownAssignment({
  eventId,
  teamMembers,
  assigneeId,
  assigneeName,
  taskStatus,
}: {
  eventId: string;
  teamMembers: ShutdownTeamMember[];
  assigneeId: string | null;
  assigneeName: string | null;
  taskStatus: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assign(memberId: string) {
    if (!memberId || memberId === assigneeId) return;
    setError(null);
    startTransition(async () => {
      const res = await assignShutdown(eventId, memberId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const done = taskStatus === "done";

  return (
    <div
      className="rsd-card"
      style={{ gap: 10, display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--gw-fg)" }}>Shutdown assignment</div>
          <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", marginTop: 2 }}>
            {done
              ? `Completed by ${assigneeName ?? "a team member"}.`
              : assigneeName
                ? `Assigned to ${assigneeName}.`
                : "Nobody is assigned yet."}
          </div>
        </div>
        {done && (
          <span className="rsd-chip rsd-chip-accent" style={{ flexShrink: 0 }}>Done</span>
        )}
      </div>

      {teamMembers.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          No Building Shutdown team members yet — add some in Settings → Volunteer Teams.
        </div>
      ) : (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
            {assigneeName ? "Reassign to" : "Assign to"}
          </span>
          <select
            value={assigneeId ?? ""}
            onChange={(e) => assign(e.target.value)}
            disabled={pending}
            style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
          >
            <option value="">— Pick a team member —</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)" }}>{error}</div>
      )}
    </div>
  );
}
