// Server-side glue for schedule-conflict detection: pulls the candidate
// reservations (confirmed calendar events + other still-open requests) and runs
// the pure findConflicts() engine. Used by the request detail page (full list)
// and the review queue (per-row count → chip).
//
// De-dup rule: an APPROVED request is already represented by the calendar event
// it auto-created, so request-candidates are limited to PENDING ones (competing
// for the slot, not yet booked). A request never conflicts with its own event.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findConflicts,
  spacesFromLocation,
  timeFromTimestamp,
  dateFromTimestamp,
  type Conflict,
  type ConflictCandidate,
} from "./conflicts";

interface TicketLike {
  id: string;
  details: Record<string, unknown> | null;
}

// Narrower than ConflictTarget: date is guaranteed non-null (the loader always
// needs a concrete date to query), and it's still assignable to ConflictTarget.
type LoadedTarget = { spaces: string[]; date: string; start: string | null; end: string | null };

function targetFromDetails(d: Record<string, unknown> | null): LoadedTarget | null {
  if (!d) return null;
  const date = typeof d.date === "string" ? d.date : null;
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]) : [];
  if (!date || spaces.length === 0) return null;
  return {
    spaces,
    date,
    start: typeof d.startTime === "string" ? d.startTime : null,
    end: typeof d.endTime === "string" ? d.endTime : null,
  };
}

interface EventRow {
  id: string;
  title: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  source_ticket_id: string | null;
}
interface ReqRow {
  id: string;
  description: string | null;
  details: Record<string, unknown> | null;
}

function eventCandidate(e: EventRow, fallbackDate: string): ConflictCandidate {
  return {
    id: e.id,
    title: e.title || "Reservation",
    source: "event",
    spaces: spacesFromLocation(e.location),
    date: dateFromTimestamp(e.start_at) ?? fallbackDate,
    start: timeFromTimestamp(e.start_at),
    end: timeFromTimestamp(e.end_at),
  };
}
function reqCandidate(r: ReqRow): ConflictCandidate | null {
  const d = r.details ?? {};
  const date = typeof d.date === "string" ? d.date : null;
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]) : [];
  if (!date || spaces.length === 0) return null;
  return {
    id: r.id,
    title: (r.description ?? "").split("\n")[0].slice(0, 80) || "Another request",
    source: "request",
    spaces,
    date,
    start: typeof d.startTime === "string" ? d.startTime : null,
    end: typeof d.endTime === "string" ? d.endTime : null,
  };
}

// Full conflict list for one request (the detail page). Best-effort: any query
// error yields an empty list rather than breaking the page.
export async function loadConflictsForTicket(
  supabase: SupabaseClient,
  ticket: TicketLike,
): Promise<Conflict[]> {
  const target = targetFromDetails(ticket.details);
  if (!target) return [];
  try {
    const [{ data: events }, { data: reqs }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, location, start_at, end_at, source_ticket_id")
        .is("deleted_at", null)
        .gte("start_at", `${target.date}T00:00:00`)
        .lte("start_at", `${target.date}T23:59:59`),
      supabase
        .from("maintenance_requests")
        .select("id, description, details")
        .is("deleted_at", null)
        .not("details", "is", null)
        .eq("review_status", "pending_review")
        .eq("details->>date", target.date)
        .neq("id", ticket.id),
    ]);
    const candidates: ConflictCandidate[] = [];
    for (const e of (events as EventRow[] | null) ?? []) {
      if (e.source_ticket_id === ticket.id) continue; // not its own booking
      candidates.push(eventCandidate(e, target.date));
    }
    for (const r of (reqs as ReqRow[] | null) ?? []) {
      const c = reqCandidate(r);
      if (c) candidates.push(c);
    }
    return findConflicts(target, candidates);
  } catch (err) {
    console.error("[conflicts] load failed (non-fatal):", err);
    return [];
  }
}

// Per-row conflict counts for the review queue. One events query spanning the
// queue's date range; pending rows also check against each other.
export async function loadConflictCounts(
  supabase: SupabaseClient,
  rows: TicketLike[],
): Promise<Record<string, number>> {
  const targets = rows
    .map(r => ({ id: r.id, target: targetFromDetails(r.details) }))
    .filter((x): x is { id: string; target: LoadedTarget } => x.target !== null);
  if (targets.length === 0) return {};

  const dates = targets.map(t => t.target.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  let events: EventRow[] = [];
  try {
    const { data } = await supabase
      .from("events")
      .select("id, title, location, start_at, end_at, source_ticket_id")
      .is("deleted_at", null)
      .gte("start_at", `${minDate}T00:00:00`)
      .lte("start_at", `${maxDate}T23:59:59`);
    events = (data as EventRow[] | null) ?? [];
  } catch (err) {
    console.error("[conflicts] queue events load failed (non-fatal):", err);
  }

  // All the queue rows themselves are pending request-candidates.
  const rowCandidates = rows
    .map(r => reqCandidate({ id: r.id, description: null, details: r.details }))
    .filter((c): c is ConflictCandidate => c !== null);

  const counts: Record<string, number> = {};
  for (const { id, target } of targets) {
    const candidates: ConflictCandidate[] = [
      ...events.filter(e => e.source_ticket_id !== id).map(e => eventCandidate(e, target.date)),
      ...rowCandidates.filter(c => c.id !== id),
    ];
    const n = findConflicts(target, candidates).length;
    if (n > 0) counts[id] = n;
  }
  return counts;
}
