"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { optOutShutdown } from "../../../../lib/shutdown/actions";

// Phase 2b: the assignee bows out of a shutdown. Unassigns the task and posts a
// "need cover" request to the team's Slack channel.
export function ShutdownOptOutButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function optOut() {
    if (!window.confirm("Let the team know you can't cover this shutdown? It'll be unassigned and posted for cover.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await optOutShutdown(taskId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={optOut}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 100,
          background: "transparent",
          color: "var(--gw-fg-muted)",
          border: "1px solid var(--gw-border)",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Notifying the team…" : "I can't cover this one"}
      </button>
      {error && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-error)" }}>{error}</div>}
    </div>
  );
}
