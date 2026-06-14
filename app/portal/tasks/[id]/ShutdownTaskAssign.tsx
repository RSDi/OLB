"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignShutdownTask } from "../../../../lib/shutdown/actions";

export interface ShutdownTeamMember {
  id: string;
  fullName: string;
}

// Phase 2c: staff assign a (cron-generated) shutdown task to a Building Shutdown
// team member. Lists the team — not the generic staff list — since most
// volunteers aren't staff.
export function ShutdownTaskAssign({
  taskId,
  teamMembers,
  assigneeId,
  assigneeName,
}: {
  taskId: string;
  teamMembers: ShutdownTeamMember[];
  assigneeId: string | null;
  assigneeName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assign(memberId: string) {
    if (!memberId || memberId === assigneeId) return;
    setError(null);
    startTransition(async () => {
      const res = await assignShutdownTask(taskId, memberId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
        {assigneeName ? `Assigned to ${assigneeName} — reassign` : "Assign to a team member"}
      </span>
      {teamMembers.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          No Building Shutdown team members yet — add some in Settings → Volunteer Teams.
        </span>
      ) : (
        <select
          value={assigneeId ?? ""}
          onChange={(e) => assign(e.target.value)}
          disabled={pending}
          style={{ height: 40, maxWidth: 280, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
        >
          <option value="">— Pick a team member —</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      )}
      {error && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-error)" }}>{error}</div>}
    </div>
  );
}
