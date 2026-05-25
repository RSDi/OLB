"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Textarea } from "../../../components/ui";
import {
  toggleStep,
  completeInstance,
  skipInstance,
  reopenInstance,
  type InstanceStepCheck,
  type InstanceStatus,
} from "../../../../lib/pm/actions";

interface Step {
  id: string;
  label: string;
}

export function ChecklistAndActions({
  instanceId,
  status,
  steps,
  checks,
  initialNotes,
}: {
  instanceId: string;
  status: InstanceStatus;
  steps: Step[];
  checks: InstanceStepCheck[];
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isClosed = status === "done" || status === "skipped";

  function handleToggle(stepId: string, checked: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleStep(instanceId, stepId, checked);
      if (result.error) setError(result.error);
    });
  }

  function handleComplete() {
    const unchecked = steps.length - checks.filter((c) => c.checked).length;
    if (
      unchecked > 0 &&
      !confirm(`${unchecked} step${unchecked === 1 ? "" : "s"} still unchecked. Mark done anyway?`)
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeInstance(instanceId, notes);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleSkip() {
    const reason = window.prompt("Reason for skipping (optional):", notes);
    if (reason === null) return; // user cancelled
    setError(null);
    startTransition(async () => {
      const result = await skipInstance(instanceId, reason);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleReopen() {
    if (!confirm("Reopen this task? It will move back to In Progress.")) return;
    setError(null);
    startTransition(async () => {
      const result = await reopenInstance(instanceId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div
        className="rsd-card"
        style={{ gap: 0, padding: 0, overflow: "hidden" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            Checklist · {checks.filter((c) => c.checked).length}/{steps.length} done
          </h3>
        </div>
        {steps.length === 0 ? (
          <div
            style={{
              padding: "32px 18px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--gw-fg-muted)",
            }}
          >
            This template has no steps.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {steps.map((s, i) => {
              const check = checks.find((c) => c.step_id === s.id);
              const checked = Boolean(check?.checked);
              return (
                <label
                  key={s.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 18px",
                    borderBottom: i < steps.length - 1 ? "1px solid var(--gw-border)" : "none",
                    cursor: isClosed ? "default" : "pointer",
                    opacity: isClosed ? 0.7 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isClosed || pending}
                    onChange={(e) => handleToggle(s.id, e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      color: "var(--gw-fg)",
                      textDecoration: checked ? "line-through" : "none",
                      lineHeight: 1.5,
                    }}
                  >
                    {s.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Notes
        </h3>
        <Textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            isClosed
              ? "Read-only — reopen to edit"
              : "What happened, what was needed, anything to remember for next time."
          }
          rows={4}
          disabled={isClosed || pending}
        />
        <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {isClosed
            ? "Notes are saved with the last status change."
            : "Notes are saved when you mark done or skip."}
        </div>
      </div>

      <div className="rsd-card" style={{ gap: 12 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Actions
        </h3>
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--gw-error)",
              fontWeight: 600,
            }}
          >
            <Icons.AlertCircle width={12} height={12} />
            {error}
          </div>
        )}
        {isClosed ? (
          <Pill variant="ghost" size="md" onClick={handleReopen} disabled={pending}>
            <Icons.Undo width={12} height={12} /> Reopen task
          </Pill>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Pill variant="accent" size="md" onClick={handleComplete} disabled={pending}>
              <Icons.CheckCircle width={14} height={14} />
              {pending ? "Saving…" : "Mark done"}
            </Pill>
            <Pill variant="ghost" size="md" onClick={handleSkip} disabled={pending}>
              Skip this cycle
            </Pill>
          </div>
        )}
      </div>
    </>
  );
}
