// Two board members editing the same meeting: merging what each of them
// changed. Every save (and every "Load latest") compares three versions of
// each part of the meeting, the date, status, agenda, minutes and each task
// note:
//
//   base    what this person's page started from
//   mine    what they have now
//   theirs  what's saved now (someone else may have saved since)
//
// A part only one of them changed takes that change, so edits to different
// parts combine by themselves. A part both changed differently is a
// conflict: nothing is saved until the person picks theirs or keeps their own.
// Pure; used by the server action and the meeting page. Tested in
// tests/unit/planning-merge.test.ts.

import type { MeetingStatus } from "./types.ts";

export interface MeetingSnapshot {
  meetsOn: string; // "" = no date
  status: MeetingStatus;
  agendaMd: string;
  minutesMd: string;
  // Task id → note. A missing or blank note is no note.
  notes: Record<string, string>;
}

export type MeetingField = "meetsOn" | "status" | "agendaMd" | "minutesMd" | `note:${string}`;

export const FIELD_LABELS: Record<"meetsOn" | "status" | "agendaMd" | "minutesMd", string> = {
  meetsOn: "Meeting date",
  status: "Status",
  agendaMd: "Agenda",
  minutesMd: "Minutes",
};

export function noteField(taskId: string): MeetingField {
  return `note:${taskId}`;
}

export function fieldTaskId(field: MeetingField): string | null {
  return field.startsWith("note:") ? field.slice(5) : null;
}

// Trailing whitespace and blank notes aren't changes anyone can see.
function norm(s: string | undefined): string {
  return (s ?? "").replace(/\s+$/, "");
}

export function fieldValue(s: MeetingSnapshot, field: MeetingField): string {
  const task = fieldTaskId(field);
  if (task) return norm(s.notes[task]);
  return norm(s[field as keyof typeof FIELD_LABELS] as string);
}

function setField(s: MeetingSnapshot, field: MeetingField, value: string): void {
  const task = fieldTaskId(field);
  if (task) {
    if (value) s.notes[task] = value;
    else delete s.notes[task];
  } else if (field === "status") {
    s.status = value as MeetingStatus;
  } else {
    s[field as "meetsOn" | "agendaMd" | "minutesMd"] = value;
  }
}

export function allFields(...snaps: MeetingSnapshot[]): MeetingField[] {
  const tasks = new Set<string>();
  for (const s of snaps) for (const id of Object.keys(s.notes)) tasks.add(id);
  return ["meetsOn", "status", "agendaMd", "minutesMd", ...[...tasks].sort().map(noteField)];
}

export function cloneSnapshot(s: MeetingSnapshot): MeetingSnapshot {
  return { ...s, notes: { ...s.notes } };
}

export interface MergeResult {
  merged: MeetingSnapshot;
  // Parts both people changed differently. `merged` holds theirs for these.
  conflicts: MeetingField[];
}

export function mergeSnapshots(base: MeetingSnapshot, mine: MeetingSnapshot, theirs: MeetingSnapshot): MergeResult {
  const merged = cloneSnapshot(theirs);
  const conflicts: MeetingField[] = [];
  for (const f of allFields(base, mine, theirs)) {
    const b = fieldValue(base, f);
    const m = fieldValue(mine, f);
    const t = fieldValue(theirs, f);
    if (m === t || m === b) continue; // same result, or only they changed it: theirs
    if (t === b) setField(merged, f, m); // only I changed it: mine
    else conflicts.push(f); // both changed it, differently
  }
  return { merged, conflicts };
}

// The parts where `a` and `b` differ.
export function changedFields(a: MeetingSnapshot, b: MeetingSnapshot): MeetingField[] {
  return allFields(a, b).filter((f) => fieldValue(a, f) !== fieldValue(b, f));
}
