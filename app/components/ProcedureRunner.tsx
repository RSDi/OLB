"use client";

import { useState, useTransition } from "react";
import { Icons } from "./icons";
import { completeProcedure } from "../../lib/playbooks/procedures-actions";
import { completeShutdownTask } from "../../lib/shutdown/actions";

// The runnable side of a procedure (0066). Tick each step, then log the run —
// and post a Slack FYI when the procedure has notifications on. Shared between
// the playbook page, the event page, and the task page:
//   - `eventId` set (event page): the Slack notice links back to that event.
//   - `taskId` set (task page): completing also marks the shutdown task done,
//     and the assignee (not just staff) can run it.
export function ProcedureRunner({
  procedureId,
  title,
  steps,
  willNotify,
  eventId,
  taskId,
  startLabel,
}: {
  procedureId: string;
  title: string;
  steps: string[];
  // Whether completing this will actually post to Slack (notify on AND a
  // channel configured). Drives the finish-button label + result message;
  // false → it's just logged as done.
  willNotify: boolean;
  eventId?: string;
  taskId?: string;
  startLabel?: string;
}) {
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [runResult, setRunResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allChecked = steps.length > 0 && steps.every((_, i) => checked.has(i));

  function toggleStep(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function startRun() {
    setRunResult(null);
    setError(null);
    setChecked(new Set());
    setRunning(true);
  }

  function finishRun() {
    setError(null);
    startTransition(async () => {
      const res = taskId
        ? await completeShutdownTask(taskId)
        : await completeProcedure(procedureId, eventId ? { eventId } : undefined);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setRunning(false);
      setChecked(new Set());
      setRunResult(
        res.posted
          ? "Done — logged, and posted to the team's Slack channel."
          : willNotify
            ? "Done — logged, but the Slack notice didn't post (make sure the bot has been invited to the channel)."
            : "Done — logged as complete."
      );
    });
  }

  return (
    <div
      className="rsd-card"
      style={{ gap: 12, border: "1px solid var(--rsd-accent-line)", background: "var(--rsd-accent-bg)" }}
    >
      {!running ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>
              {steps.length}-step procedure
            </div>
            <button
              onClick={startRun}
              className="gw-press"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              <Icons.Play width={13} height={13} /> {startLabel ?? `Start ${title}`}
            </button>
          </div>
          {runResult && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-success, #16a34a)" }}>{runResult}</div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>Walk through each step</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {steps.map((label, i) => {
              const on = checked.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleStep(i)}
                  className="gw-press"
                  style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 10, background: "var(--gw-bg)", border: `1px solid ${on ? "var(--rsd-accent)" : "var(--gw-border)"}`, cursor: "pointer", width: "100%" }}
                >
                  <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--rsd-accent-fill)" : "transparent", border: `1.5px solid ${on ? "var(--rsd-accent)" : "var(--gw-border)"}`, color: "var(--rsd-accent-fill-on)" }}>
                    {on && <Icons.CheckCircle width={13} height={13} />}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--gw-fg)", textDecoration: on ? "line-through" : "none", opacity: on ? 0.7 : 1 }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button onClick={() => { setRunning(false); setChecked(new Set()); }} disabled={pending} style={{ padding: "9px 16px", borderRadius: 100, background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)", fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={finishRun} disabled={!allChecked || pending} className="gw-press" style={{ padding: "9px 18px", borderRadius: 100, background: allChecked ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)", color: allChecked ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)", border: allChecked ? "none" : "1px solid var(--gw-border)", fontSize: 13, fontWeight: 700, cursor: allChecked && !pending ? "pointer" : "not-allowed" }}>
              {pending ? "Finishing…" : willNotify ? "Done — notify the team" : "Done"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)" }}>{error}</div>
      )}
    </div>
  );
}
