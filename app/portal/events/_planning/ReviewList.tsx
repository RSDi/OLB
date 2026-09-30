"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../../components/ui";
import { reviewPlanningTasks, type ReviewDecision } from "../../../../lib/planning/actions";
import { monthLabel, type MonthKey } from "../../../../lib/planning/season";
import type { PlanningTask } from "../../../../lib/planning/types";
import { PlaybookChip, RoleChip } from "./chips";

export type ReviewShow = "pending" | "kept" | "tossed";

// The season's tasks by month, each with Keep / Toss (or undo), and a
// "Keep all" per month for the months the board takes as they are.
export function ReviewList({ tasks, show }: { tasks: PlanningTask[]; show: ReviewShow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const months: { key: MonthKey; items: PlanningTask[] }[] = [];
  for (const t of tasks) {
    const last = months[months.length - 1];
    if (last && last.key === t.month) last.items.push(t);
    else months.push({ key: t.month, items: [t] });
  }

  function decide(ids: string[], decision: ReviewDecision) {
    setError(null);
    setBusy(new Set(ids));
    startTransition(async () => {
      const res = await reviewPlanningTasks(ids, decision);
      if (res.error) setError(res.error);
      router.refresh();
      setBusy(new Set());
    });
  }

  if (tasks.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)", background: "var(--gw-error-bg)", borderRadius: 10, padding: "10px 14px" }}>
          {error}
        </div>
      )}
      {months.map((m) => (
        <div key={m.key} className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px",
              background: "var(--gw-bg)",
              borderBottom: "1px solid var(--gw-border)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>
              {monthLabel(m.key)}
            </span>
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
              {m.items.length} {m.items.length === 1 ? "task" : "tasks"}
            </span>
            {show === "pending" && m.items.length > 1 && (
              <span data-tour="planning-keep-all" style={{ marginLeft: "auto" }}>
                <Pill size="sm" variant="ghost" disabled={pending} onClick={() => decide(m.items.map((t) => t.id), "keep")}>
                  Keep all {m.items.length}
                </Pill>
              </span>
            )}
          </div>
          {m.items.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "12px 18px",
                borderBottom: i === m.items.length - 1 ? "none" : "1px solid var(--gw-border)",
                opacity: busy.has(t.id) ? 0.5 : 1,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <Link href={`/portal/tasks/${t.id}`} style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none", lineHeight: 1.4 }}>
                  {t.title}
                </Link>
                {t.notes && (
                  <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 3, lineHeight: 1.5 }}>{t.notes}</div>
                )}
                {(t.role || t.playbook) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <RoleChip role={t.role} />
                    <PlaybookChip playbook={t.playbook} />
                  </div>
                )}
              </div>
              <div data-tour="planning-review-decide" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {show !== "kept" && (
                  <Pill size="sm" variant="accent" disabled={pending} onClick={() => decide([t.id], "keep")}>
                    Keep
                  </Pill>
                )}
                {show !== "tossed" && (
                  <Pill size="sm" variant="ghost" disabled={pending} onClick={() => decide([t.id], "toss")}>
                    Toss
                  </Pill>
                )}
                {show !== "pending" && (
                  <Pill size="sm" variant="ghost" disabled={pending} onClick={() => decide([t.id], "undo")}>
                    Back to Review
                  </Pill>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
