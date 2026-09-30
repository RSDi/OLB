"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "../../../../components/MarkdownEditor";
import { MarkdownView } from "../../../../components/MarkdownView";
import { Input, Pill, Textarea } from "../../../../components/ui";
import { saveMeeting } from "../../../../../lib/planning/actions";
import type { MeetingState, SavedBy } from "../../../../../lib/planning/data";
import { MEETING_STATUS_LABELS } from "../../../../../lib/planning/logic";
import {
  FIELD_LABELS,
  changedFields,
  cloneSnapshot,
  fieldTaskId,
  fieldValue,
  mergeSnapshots,
  noteField,
  type MeetingField,
  type MeetingSnapshot,
} from "../../../../../lib/planning/merge";
import { monthName, monthNumber, type MonthKey } from "../../../../../lib/planning/season";
import type { MeetingStatus, PlanningTask } from "../../../../../lib/planning/types";
import { PlanningTaskRow } from "../../_planning/PlanningTaskRow";
import { formatPlainDate, formatStamp } from "../../_planning/format";
import { useMeetingPresence } from "./useMeetingPresence";

const STATUSES: MeetingStatus[] = ["planned", "held", "skipped"];

const cardTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const cardHint: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2, lineHeight: 1.5 };

// A part someone else saved differently while this person was changing it.
interface Conflict {
  theirs: string;
  by: SavedBy | null;
}

function stampOf(s: MeetingState): string {
  return `${s.meetingId ?? "new"}:${s.revision}:${JSON.stringify(s.noteRevisions)}`;
}

function setPart(s: MeetingSnapshot, field: MeetingField, value: string): MeetingSnapshot {
  const next = cloneSnapshot(s);
  const task = fieldTaskId(field);
  if (task) {
    if (value) next.notes[task] = value;
    else delete next.notes[task];
  } else if (field === "status") next.status = value as MeetingStatus;
  else next[field as "meetsOn" | "agendaMd" | "minutesMd"] = value;
  return next;
}

// A month's board meeting: when, whether it happened, the agenda, the
// minutes, and a note on each task the board talked about. One Save for all.
// Several board members can have it open: saves merge what each changed
// (lib/planning/merge.ts), and the page shows who else is here.
export function MeetingForm({
  month,
  server,
  draftAgenda,
  thisMonth,
  earlier,
  me,
}: {
  month: MonthKey;
  // The meeting as it's saved now.
  server: MeetingState;
  // The agenda drafted from the Template, for a meeting nobody has saved yet.
  draftAgenda: string;
  thisMonth: PlanningTask[];
  earlier: PlanningTask[];
  me: { userId: string; name: string };
}) {
  const router = useRouter();
  const saved = server.meetingId !== null;
  // What this page started from, and what it has now.
  const [base, setBase] = useState<MeetingSnapshot>(server.snapshot);
  const [mine, setMine] = useState<MeetingSnapshot>(() =>
    saved ? cloneSnapshot(server.snapshot) : { ...cloneSnapshot(server.snapshot), agendaMd: draftAgenda },
  );
  const [known, setKnown] = useState<MeetingState>(server);
  // The server data this page last took in. It changes when the page reloads
  // its data (after a save here or someone else's); a save's own answer can
  // be newer, so only a change here is news.
  const [seenServer, setSeenServer] = useState(stampOf(server));
  const [conflicts, setConflicts] = useState<Map<MeetingField, Conflict>>(new Map());
  const [open, setOpen] = useState<Set<string>>(() => new Set(Object.keys(server.snapshot.notes)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changes = useMemo(() => changedFields(base, mine), [base, mine]);
  const dirty = changes.length > 0;
  const { peers, otherSave, announceSave, clearOtherSave } = useMeetingPresence(month, me, dirty);

  // Take in what's saved now: parts only they changed come in, parts only I
  // changed stay mine, parts we both changed wait for me to choose.
  function takeIn(latest: MeetingState, conflictFields?: MeetingField[]) {
    const { merged, conflicts: found } = mergeSnapshots(base, mine, latest.snapshot);
    const both = conflictFields ?? found;
    let next = merged;
    const waiting = new Map(conflicts);
    for (const f of both) {
      next = setPart(next, f, fieldValue(mine, f));
      const task = fieldTaskId(f);
      waiting.set(f, { theirs: fieldValue(latest.snapshot, f), by: task ? latest.noteSavedBy[task] ?? null : latest.savedBy });
      if (task) setOpen((p) => new Set(p).add(task));
    }
    setMine(next);
    setBase(latest.snapshot);
    setKnown(latest);
    setConflicts(waiting);
  }

  // The page reloaded its data (someone else saved, or we did): fold it in.
  if (stampOf(server) !== seenServer) {
    setSeenServer(stampOf(server));
    if (stampOf(server) !== stampOf(known)) takeIn(server);
  }

  // Someone else saved: load it straight away when there's nothing unsaved
  // here, otherwise offer to.
  useEffect(() => {
    if (otherSave && !dirty) {
      clearOtherSave();
      router.refresh();
    }
  }, [otherSave, dirty, clearOtherSave, router]);

  // Don't lose typed minutes to a stray tab close.
  useEffect(() => {
    if (!dirty || !saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saved]);

  function edit(field: MeetingField, value: string) {
    setMine((m) => setPart(m, field, value));
  }

  function resolve(field: MeetingField, useTheirs: boolean) {
    const c = conflicts.get(field);
    if (!c) return;
    if (useTheirs) edit(field, c.theirs);
    setConflicts((p) => {
      const next = new Map(p);
      next.delete(field);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveMeeting({ month, base, mine });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (!res.saved) {
        takeIn(res.state, res.conflicts);
        return;
      }
      setBase(res.state.snapshot);
      setMine(cloneSnapshot(res.state.snapshot));
      setKnown(res.state);
      announceSave();
      clearOtherSave();
      router.refresh();
    });
  }

  function loadLatest() {
    clearOtherSave();
    router.refresh();
  }

  const conflictCount = conflicts.size;
  const noteBy = (taskId: string) => known.noteSavedBy[taskId];

  function taskList(tasks: PlanningTask[]) {
    return tasks.map((t) => {
      const field = noteField(t.id);
      const isOpen = open.has(t.id);
      const by = noteBy(t.id);
      return (
        <div key={t.id} style={{ borderTop: "1px solid var(--gw-border)" }}>
          <PlanningTaskRow task={t} />
          <div style={{ padding: "0 18px 12px 52px", display: "flex", flexDirection: "column", gap: 6 }}>
            {conflicts.has(field) && (
              <ConflictBox
                what={`the note on “${t.title}”`}
                conflict={conflicts.get(field)!}
                onUseTheirs={() => resolve(field, true)}
                onKeepMine={() => resolve(field, false)}
              />
            )}
            {isOpen ? (
              <>
                <Textarea
                  aria-label={`Minutes for "${t.title}"`}
                  value={mine.notes[t.id] ?? ""}
                  onChange={(e) => edit(field, e.target.value)}
                  rows={2}
                  placeholder="What the board said or decided about this"
                />
                {by && base.notes[t.id] && (
                  <span style={{ fontSize: 11, color: "var(--gw-fg-muted)" }}>
                    Last edited by {by.name ?? "a board member"} · {formatStamp(by.at)}
                  </span>
                )}
              </>
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
                  alignSelf: "flex-start",
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

  const partConflict = (f: "meetsOn" | "status" | "agendaMd" | "minutesMd") =>
    conflicts.has(f) ? (
      <ConflictBox
        what={`the ${FIELD_LABELS[f].toLowerCase()}`}
        conflict={conflicts.get(f)!}
        onUseTheirs={() => resolve(f, true)}
        onKeepMine={() => resolve(f, false)}
        show={f === "meetsOn" ? (v) => (v ? formatPlainDate(v, true) : "No date") : f === "status" ? (v) => MEETING_STATUS_LABELS[v as MeetingStatus] ?? v : undefined}
        markdown={f === "agendaMd" || f === "minutesMd"}
      />
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 72 }}>
      <div data-tour="meeting-activity" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--gw-fg-muted)" }}>
        {known.savedBy ? (
          <span>
            Last edited by <strong style={{ color: "var(--gw-fg)" }}>{known.savedBy.name ?? "a board member"}</strong> ·{" "}
            {formatStamp(known.savedBy.at)}
          </span>
        ) : (
          <span>Not saved yet</span>
        )}
        {saved && (
          <Link data-tour="meeting-history" href={`/portal/events/meetings/${month}/history`} style={{ fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
            History
          </Link>
        )}
        {peers.length > 0 && (
          <span
            data-tour="meeting-peers"
            className="rsd-chip rsd-chip-warn"
            title="Changes they save merge with yours. If you both change the same part, you'll choose which to keep."
          >
            {peerLabel(peers)}
          </span>
        )}
      </div>

      {otherSave && dirty && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--rsd-warn-line)",
            background: "var(--rsd-warn-bg)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ flex: 1, minWidth: 200 }}>
            {otherSave.name} just saved changes. Load them to see what they did; your unsaved changes stay.
          </span>
          <Pill size="sm" variant="dark" onClick={loadLatest}>
            Load their changes
          </Pill>
        </div>
      )}

      {conflictCount > 0 && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid rgba(229,62,62,.3)",
            background: "var(--gw-error-bg)",
            color: "var(--gw-fg)",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          Someone else changed {conflictCount === 1 ? "a part" : `${conflictCount} parts`} of this meeting you were also
          changing. Choose which to keep in each red box below, then press Save meeting. Everything else of yours is
          still here.
        </div>
      )}

      <div data-tour="meeting-when" className="rsd-card" style={{ gap: 14, padding: "16px 20px" }}>
        {partConflict("meetsOn")}
        {partConflict("status")}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 200 }}>
            <Input label="Meeting date" type="date" value={mine.meetsOn} onChange={(e) => edit("meetsOn", e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Status
            </span>
            <div role="radiogroup" aria-label="Status" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const on = mine.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => edit("status", s)}
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
        {partConflict("agendaMd")}
        <MarkdownEditor value={mine.agendaMd} onChange={(v) => edit("agendaMd", v)} rows={8} placeholder={"- Topic one\n- Topic two"} />
      </div>

      <div data-tour="meeting-minutes" className="rsd-card" style={{ gap: 10, padding: "16px 20px" }}>
        <div>
          <h3 style={cardTitle}>Minutes</h3>
          <div style={cardHint}>Who was there, what was discussed, what was decided. Notes on a single task go with that task below.</div>
        </div>
        {partConflict("minutesMd")}
        <MarkdownEditor value={mine.minutesMd} onChange={(v) => edit("minutesMd", v)} rows={14} placeholder={"Present: …\n\nDecisions: …"} />
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
        <span style={{ fontSize: 13, fontWeight: 600, color: error || conflictCount ? "var(--gw-error)" : "var(--gw-fg-muted)" }}>
          {error ??
            (conflictCount > 0
              ? "Choose what to keep first"
              : dirty
                ? saved
                  ? "Unsaved changes"
                  : "Not saved yet"
                : "All changes saved")}
        </span>
        <Pill variant="accent" onClick={save} disabled={pending || !dirty || conflictCount > 0}>
          {pending ? "Saving…" : "Save meeting"}
        </Pill>
      </div>
    </div>
  );
}

function peerLabel(peers: { name: string; editing: boolean }[]): string {
  const first = (n: string) => n.split(" ")[0];
  const names = peers.map((p) => first(p.name));
  const list = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  const editing = peers.some((p) => p.editing);
  return `${list} ${peers.length === 1 ? "is" : "are"} ${editing ? "editing" : "here"} too`;
}

function ConflictBox({
  what,
  conflict,
  onUseTheirs,
  onKeepMine,
  show,
  markdown,
}: {
  // "the minutes", "the note on “…”"
  what: string;
  conflict: Conflict;
  onUseTheirs: () => void;
  onKeepMine: () => void;
  show?: (v: string) => string;
  markdown?: boolean;
}) {
  const who = conflict.by?.name ?? "Another board member";
  const when = conflict.by ? ` at ${formatStamp(conflict.by.at)}` : "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid rgba(229,62,62,.35)",
        background: "var(--gw-error-bg)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {who} changed {what}
        {when} while you were changing it too.
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>
        Their version
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          borderRadius: 8,
          padding: "8px 10px",
          maxHeight: 220,
          overflow: "auto",
        }}
      >
        {conflict.theirs ? (
          markdown ? <MarkdownView>{conflict.theirs}</MarkdownView> : show ? show(conflict.theirs) : conflict.theirs
        ) : (
          <em style={{ color: "var(--gw-fg-muted)" }}>Removed</em>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill size="sm" variant="ghost" onClick={onUseTheirs}>
          Use theirs
        </Pill>
        <Pill size="sm" variant="dark" onClick={onKeepMine}>
          Keep mine
        </Pill>
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", alignSelf: "center" }}>
          Yours is in the box below. Keep mine saves it over theirs.
        </span>
      </div>
    </div>
  );
}
