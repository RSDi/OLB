"use client";
// ReelNotes action items (from a recording linked to this task) that haven't
// been promoted or dismissed, shown in the To-Dos section as lighter "suggested"
// rows. Accept promotes one into a real To-Do; Dismiss hides it; the header
// links down to the recorded note. Staff-only (the host gates rendering).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { addSubtasksFromActionItems } from "../../../../lib/maintenance/actions";
import { dismissActionItem } from "../../../../lib/reelnotes/actions";
import type { SuggestedTodo } from "../../../../lib/reelnotes/data";

export function SuggestedTodos({ ticketId, items }: { ticketId: string; items: SuggestedTodo[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(item: SuggestedTodo, fn: () => Promise<{ error?: string }>) {
    setActing(item.id);
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        setActing(null);
        return;
      }
      router.refresh();
    });
  }

  function jump(recordingId: string) {
    document
      .querySelector(`[data-recording-id="${recordingId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Group by recording so a task with notes from multiple recordings gets a
  // header + jump link for each.
  const groups = new Map<string, SuggestedTodo[]>();
  for (const it of items) {
    const arr = groups.get(it.recordingId);
    if (arr) arr.push(it);
    else groups.set(it.recordingId, [it]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--gw-border)" }}>
      {[...groups.entries()].map(([recordingId, group]) => (
        <div key={recordingId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--rsd-accent)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              <Icons.Mic width={13} height={13} />
              {group.length} suggested from a recording
            </span>
            <button
              type="button"
              onClick={() => jump(recordingId)}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "transparent", border: "none", color: "var(--rsd-accent)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Jump to note <Icons.ChevronDown width={13} height={13} />
            </button>
          </div>
          {group.map((item) => (
            <div
              key={item.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px dashed var(--gw-border)", borderRadius: 8, background: "var(--gw-bg-elev)", opacity: acting === item.id ? 0.5 : 1 }}
            >
              <Icons.Mic width={15} height={15} style={{ color: "var(--rsd-accent)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--gw-fg-muted)" }}>{item.text}</span>
              <button
                type="button"
                onClick={() => run(item, () => addSubtasksFromActionItems(ticketId, item.recordingId, [item.id]))}
                disabled={acting === item.id}
                className="gw-press"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 100, border: "1px solid var(--rsd-accent)", background: "var(--rsd-accent-bg)", color: "var(--rsd-accent)", cursor: "pointer", flexShrink: 0 }}
              >
                <Icons.CheckCircle width={13} height={13} /> Accept
              </button>
              <button
                type="button"
                onClick={() => run(item, () => dismissActionItem(item.id, ticketId))}
                disabled={acting === item.id}
                title="Dismiss"
                aria-label="Dismiss suggestion"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 100, border: "1px solid var(--gw-border)", background: "transparent", color: "var(--gw-fg-muted)", cursor: "pointer", flexShrink: 0 }}
              >
                <Icons.X width={13} height={13} />
              </button>
            </div>
          ))}
        </div>
      ))}
      {error && <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
