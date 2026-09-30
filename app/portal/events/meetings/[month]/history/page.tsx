import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../../components/icons";
import { MarkdownView } from "../../../../../components/MarkdownView";
import { createClient } from "../../../../../../lib/supabase/server";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { canUsePlanning } from "../../../../../../lib/planning/access";
import { namesForUsers } from "../../../../../../lib/planning/data";
import { diffContext, lineDiff } from "../../../../../../lib/planning/diff";
import { MEETING_STATUS_LABELS, parseMonthParam, splitDescription } from "../../../../../../lib/planning/logic";
import { firstDayOf, monthLabel } from "../../../../../../lib/planning/season";
import type { MeetingStatus } from "../../../../../../lib/planning/types";
import { formatPlainDate, formatStamp } from "../../../_planning/format";
import { MigrationNotice } from "../../../_planning/nav";
import { RestoreButton } from "./RestoreButton";

interface VersionRow {
  id: string;
  revision: number;
  meets_on: string | null;
  status: MeetingStatus;
  agenda_md: string;
  minutes_md: string;
  changed_by: string | null;
  changed_at: string;
}

interface NoteVersionRow {
  id: string;
  task_id: string;
  note_md: string | null;
  changed_by: string | null;
  changed_at: string;
}

type Entry =
  | { kind: "meeting"; at: string; by: string | null; version: VersionRow; previous: VersionRow | null; latest: boolean }
  | { kind: "note"; at: string; by: string | null; note: NoteVersionRow; previous: NoteVersionRow | null };

// Every saved change to a month's board meeting, newest first: who changed
// what, when, and what it said. Versions are written by the database
// (migration 0105), so nothing saved can skip them.
export default async function MeetingHistoryPage({ params }: { params: Promise<{ month: string }> }) {
  const { month: raw } = await params;
  const month = parseMonthParam(raw);
  if (!month) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!canUsePlanning(viewer)) redirect("/portal/events");

  const supabase = await createClient();
  const { data: meeting } = await supabase.from("planning_meetings").select("id").eq("month", firstDayOf(month)).maybeSingle();
  const meetingId = (meeting as { id: string } | null)?.id ?? null;

  const [{ data: v, error: vErr }, { data: n }] = meetingId
    ? await Promise.all([
        supabase
          .from("planning_meeting_versions")
          .select("id, revision, meets_on, status, agenda_md, minutes_md, changed_by, changed_at")
          .eq("meeting_id", meetingId)
          .order("changed_at", { ascending: true }),
        supabase
          .from("planning_meeting_note_versions")
          .select("id, task_id, note_md, changed_by, changed_at")
          .eq("meeting_id", meetingId)
          .order("changed_at", { ascending: true }),
      ])
    : [{ data: [], error: null }, { data: [] }];
  const versions = (v as VersionRow[] | null) ?? [];
  const noteVersions = (n as NoteVersionRow[] | null) ?? [];

  const taskIds = [...new Set(noteVersions.map((x) => x.task_id))];
  const { data: t } = taskIds.length
    ? await supabase.from("maintenance_requests").select("id, description").in("id", taskIds)
    : { data: [] };
  const taskTitle = new Map(((t as { id: string; description: string }[] | null) ?? []).map((x) => [x.id, splitDescription(x.description).title]));
  const names = await namesForUsers(supabase, [...versions.map((x) => x.changed_by), ...noteVersions.map((x) => x.changed_by)]);

  const entries: Entry[] = [];
  versions.forEach((version, i) =>
    entries.push({
      kind: "meeting",
      at: version.changed_at,
      by: version.changed_by,
      version,
      previous: versions[i - 1] ?? null,
      latest: i === versions.length - 1,
    }),
  );
  const lastNote = new Map<string, NoteVersionRow>();
  for (const note of noteVersions) {
    entries.push({ kind: "note", at: note.changed_at, by: note.changed_by, note, previous: lastNote.get(note.task_id) ?? null });
    lastNote.set(note.task_id, note);
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <Link
        href={`/portal/events/meetings/${month}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        <Icons.ChevronLeft width={14} height={14} /> {monthLabel(month)} board meeting
      </Link>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>History</h2>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4, lineHeight: 1.6 }}>
          Every change to this meeting and its task notes, newest first, with who made it. Restoring an older version
          saves it as a new change, so nothing is ever lost.
        </div>
      </div>

      {vErr ? (
        <MigrationNotice />
      ) : entries.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "var(--gw-fg-muted)" }}>
          Nothing saved yet.
        </div>
      ) : (
        <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {entries.map((e, i) => (
            <div
              key={e.kind === "meeting" ? e.version.id : e.note.id}
              style={{ padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid var(--gw-border)", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{e.by ? names.get(e.by) ?? "A board member" : "A board member"}</strong>
                <span style={{ fontSize: 13, color: "var(--gw-fg)" }}>{e.kind === "meeting" ? meetingSummary(e) : noteSummary(e, taskTitle)}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gw-fg-muted)" }}>{formatStamp(e.at)}</span>
              </div>
              {e.kind === "meeting" ? <MeetingChange entry={e} month={month} /> : <NoteChange entry={e} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function meetingSummary(e: Extract<Entry, { kind: "meeting" }>): string {
  if (!e.previous) return "saved the meeting for the first time";
  const parts = changedParts(e.previous, e.version).map((p) => p.toLowerCase());
  if (parts.length === 0) return "saved";
  return `changed the ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`}`;
}

function changedParts(a: VersionRow, b: VersionRow): string[] {
  const out: string[] = [];
  if (a.meets_on !== b.meets_on) out.push("Date");
  if (a.status !== b.status) out.push("Status");
  if (a.agenda_md !== b.agenda_md) out.push("Agenda");
  if (a.minutes_md !== b.minutes_md) out.push("Minutes");
  return out;
}

function noteSummary(e: Extract<Entry, { kind: "note" }>, titles: Map<string, string>): string {
  const task = `“${titles.get(e.note.task_id) ?? "a task"}”`;
  if (e.note.note_md == null) return `removed the note on ${task}`;
  return e.previous && e.previous.note_md != null ? `edited the note on ${task}` : `added a note on ${task}`;
}

const when = (v: VersionRow) =>
  `${v.meets_on ? formatPlainDate(v.meets_on, true) : "No date"} · ${MEETING_STATUS_LABELS[v.status] ?? v.status}`;

function MeetingChange({ entry, month }: { entry: Extract<Entry, { kind: "meeting" }>; month: string }) {
  const { version, previous } = entry;
  const blocks: React.ReactNode[] = [];
  if (!previous || previous.meets_on !== version.meets_on || previous.status !== version.status) {
    blocks.push(
      <div key="when" style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
        {previous ? (
          <>
            <s>{when(previous)}</s> → <span style={{ color: "var(--gw-fg)" }}>{when(version)}</span>
          </>
        ) : (
          when(version)
        )}
      </div>,
    );
  }
  for (const [label, before, after] of [
    ["Agenda", previous?.agenda_md ?? "", version.agenda_md],
    ["Minutes", previous?.minutes_md ?? "", version.minutes_md],
  ] as const) {
    if (before === after) continue;
    blocks.push(<Diff key={label} label={label} before={before} after={after} />);
  }
  return (
    <>
      {blocks}
      <details>
        <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", cursor: "pointer" }}>
          See the whole meeting as of this version
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, fontSize: 14 }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>{when(version)}</div>
          <Section title="Agenda" md={version.agenda_md} />
          <Section title="Minutes" md={version.minutes_md} />
          {!entry.latest && <RestoreButton month={month} versionId={version.id} label={`on ${formatStamp(version.changed_at)}`} />}
        </div>
      </details>
    </>
  );
}

function Section({ title, md }: { title: string; md: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>{title}</div>
      {md.trim() ? <MarkdownView>{md}</MarkdownView> : <em style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Empty</em>}
    </div>
  );
}

function Diff({ label, before, after }: { label: string; before: string; after: string }) {
  const lines = diffContext(lineDiff(before, after), 1);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.6, border: "1px solid var(--gw-border)", borderRadius: 8, overflow: "hidden" }}>
        {lines.map((l, i) =>
          l === null ? (
            <div key={i} style={{ padding: "0 10px", color: "var(--gw-fg-faint)" }}>…</div>
          ) : (
            <div
              key={i}
              style={{
                padding: "0 10px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: l.kind === "added" ? "var(--gw-success-bg)" : l.kind === "removed" ? "var(--gw-error-bg)" : "transparent",
                color: l.kind === "same" ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                textDecoration: l.kind === "removed" ? "line-through" : "none",
              }}
            >
              {l.kind === "added" ? "+ " : l.kind === "removed" ? "− " : "  "}
              {l.text || " "}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function NoteChange({ entry }: { entry: Extract<Entry, { kind: "note" }> }) {
  if (entry.note.note_md == null) {
    return entry.previous?.note_md ? <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}><s>{entry.previous.note_md}</s></div> : null;
  }
  if (entry.previous?.note_md) return <Diff label="Note" before={entry.previous.note_md} after={entry.note.note_md} />;
  return <div style={{ fontSize: 13, borderLeft: "3px solid var(--rsd-accent-line)", paddingLeft: 10 }}>{entry.note.note_md}</div>;
}
