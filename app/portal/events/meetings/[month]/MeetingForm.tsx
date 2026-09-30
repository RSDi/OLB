"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "../../../../components/MarkdownEditor";
import { Input, Pill, Textarea } from "../../../../components/ui";
import { saveMeeting } from "../../../../../lib/planning/actions";
import { MEETING_STATUS_LABELS } from "../../../../../lib/planning/logic";
import { monthName, monthNumber, type MonthKey } from "../../../../../lib/planning/season";
import type { MeetingStatus, PlanningTask } from "../../../../../lib/planning/types";
import { PlanningTaskRow } from "../../_planning/PlanningTaskRow";

const STATUSES: MeetingStatus[] = ["planned", "held", "skipped"];

const cardTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const cardHint: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2, lineHeight: 1.5 };

// A month's board meeting: when, whether it happened, the agenda, the
// minutes, and a note on each task the board talked about. One Save for all.
export function MeetingForm({
  month,
  saved,
  initial,
  thisMonth,
  earlier,
}: {
  month: MonthKey;
  // Whether this meeting has been saved before (else the agenda is a draft).
  saved: boolean;
  initial: { meetsOn: string; status: MeetingStatus; agendaMd: string; minutesMd: string; notes: Record<string, string> };
  thisMonth: PlanningTask[];
  earlier: PlanningTask[];
}) {
  const router = useRouter();
  const [meetsOn, setMeetsOn] = useState(initial.meetsOn);
  const [status, setStatus] = useState<MeetingStatus>(initial.status);
  const [agenda, setAgenda] = useState(initial.agendaMd);
  const [minutes, setMinutes] = useState(initial.minutesMd);
  const [notes, setNotes] = useState<Record<string, string>>(initial.notes);
  const [open, setOpen] = useState<Set<string>>(() => new Set(Object.keys(initial.notes)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState(initial);

  const changedNotes = useMemo(
    () =>
      Object.keys({ ...base.notes, ...notes }).filter((id) => (notes[id] ?? "").trim() !== (base.notes[id] ?? "").trim()),
    [notes, base],
  );
  const dirty =
    !saved ||
    meetsOn !== base.meetsOn ||
    status !== base.status ||
    agenda !== base.agendaMd ||
    minutes !== base.minutesMd ||
    changedNotes.length > 0;

  // Don't lose typed minutes to a stray tab close.
  useEffect(() => {
    if (!dirty || !saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saved]);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveMeeting({
        month,
        meetsOn: meetsOn || null,
        status,
        agendaMd: agenda,
        minutesMd: minutes,
        notes: changedNotes.map((taskId) => ({ taskId, noteMd: notes[taskId] ?? "" })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBase({ meetsOn, status, agendaMd: agenda, minutesMd: minutes, notes: { ...notes } });
      router.refresh();
    });
  }

  function taskList(tasks: PlanningTask[]) {
    return tasks.map((t) => {
      const isOpen = open.has(t.id);
      return (
        <div key={t.id} style={{ borderTop: "1px solid var(--gw-border)" }}>
          <PlanningTaskRow task={t} />
          <div style={{ padding: "0 18px 12px 52px" }}>
            {isOpen ? (
              <Textarea
                aria-label={`Minutes for "${t.title}"`}
                value={notes[t.id] ?? ""}
                onChange={(e) => setNotes((p) => ({ ...p, [t.id]: e.target.value }))}
                rows={2}
                placeholder="What the board said or decided about this"
              />
            ) : (
              <button
                data-tour="meeting-task-note"
                type="button"
                onClick={() => setOpen((p) => new Set(p).add(t.id))}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--rsd-accent)",
                  cursor: "pointer",
                }}
              >
                + Add a note from this meeting
              </button>
            )}
          </div>
        </div>
      );
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 72 }}>
      <div data-tour="meeting-when" className="rsd-card" style={{ gap: 14, padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 200 }}>
            <Input label="Meeting date" type="date" value={meetsOn} onChange={(e) => setMeetsOn(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Status
            </span>
            <div role="radiogroup" aria-label="Status" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const on = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStatus(s)}
                    style={{
                      height: 42,
                      padding: "0 16px",
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: on ? "var(--rsd-accent)" : "var(--gw-border)",
                      background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg)",
                      color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {MEETING_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div data-tour="meeting-agenda" className="rsd-card" style={{ gap: 10, padding: "16px 20px" }}>
        <div>
          <h3 style={cardTitle}>Agenda</h3>
          <div style={cardHint}>
            {saved
              ? "What the board will cover."
              : `Drafted from ${monthName(monthNumber(month))}'s topics in the Template. Nothing's saved until you press Save meeting.`}
          </div>
        </div>
        <MarkdownEditor value={agenda} onChange={setAgenda} rows={8} placeholder={"- Topic one\n- Topic two"} />
      </div>

      <div data-tour="meeting-minutes" className="rsd-card" style={{ gap: 10, padding: "16px 20px" }}>
        <div>
          <h3 style={cardTitle}>Minutes</h3>
          <div style={cardHint}>Who was there, what was discussed, what was decided. Notes on a single task go with that task below.</div>
        </div>
        <MarkdownEditor value={minutes} onChange={setMinutes} rows={14} placeholder={"Present: …\n\nDecisions: …"} />
      </div>

      <div data-tour="meeting-tasks" className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px" }}>
          <h3 style={cardTitle}>This month&apos;s tasks</h3>
          <div style={cardHint}>
            Tick off what&apos;s done. A note saves with the meeting and shows on the task, so the history travels with it.
          </div>
        </div>
        {thisMonth.length > 0 ? (
          taskList(thisMonth)
        ) : (
          <div style={{ padding: "0 20px 16px", fontSize: 13, color: "var(--gw-fg-muted)" }}>
            No kept tasks this month. Tasks come from the season&apos;s Review.
          </div>
        )}
      </div>

      {earlier.length > 0 && (
        <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px" }}>
            <h3 style={cardTitle}>Still open from earlier months</h3>
            <div style={cardHint}>This season&apos;s kept tasks from before this month that aren&apos;t done yet.</div>
          </div>
          {taskList(earlier)}
        </div>
      )}

      <div
        data-tour="meeting-save"
        style={{
          position: "sticky",
          // Clear of the scroll-to-top button in the corner.
          bottom: 72,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "flex-end",
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 100,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          boxShadow: "0 6px 24px rgba(0,0,0,.12)",
          alignSelf: "flex-end",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: error ? "var(--gw-error)" : "var(--gw-fg-muted)" }}>
          {error ?? (dirty ? (saved ? "Unsaved changes" : "Not saved yet") : "All changes saved")}
        </span>
        <Pill variant="accent" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save meeting"}
        </Pill>
      </div>
    </div>
  );
}
