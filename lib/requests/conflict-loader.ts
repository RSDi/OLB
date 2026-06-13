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
import { resolveOccurrences, type Occurrence } from "./recurrence";

interface TicketLike {
  id: string;
  details: Record<string, unknown> | null;
}

// Narrower than ConflictTarget: occurrences is guaranteed non-empty (the loader
// always needs at least one concrete date to query). Carries the resolved
// per-day windows (same for every day unless the member chose per-day hours).
type LoadedTarget = { spaces: string[]; occurrences: Occurrence[] };

function targetFromDetails(d: Record<string, unknown> | null): LoadedTarget | null {
  if (!d) return null;
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]) : [];
  const occurrences = resolveOccurrences(d); // sorted + unique dates, each with its window
  if (occurrences.length === 0 || spaces.length === 0) return null;
  return { spaces, occurrences };
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
// A request can be recurring (and carry per-day hours), so it becomes one
// candidate per occurrence — each with that day's own window — letting it clash
// on any shared day at the right time.
function reqCandidates(r: ReqRow): ConflictCandidate[] {
  const d = r.details ?? {};
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]) : [];
  const occurrences = resolveOccurrences(d);
  if (occurrences.length === 0 || spaces.length === 0) return [];
  const title = (r.description ?? "").split("\n")[0].slice(0, 80) || "Another request";
  return occurrences.map(o => ({ id: r.id, title, source: "request" as const, spaces, date: o.date, start: o.start, end: o.end }));
}

// Full conflict list for one request (the detail page). Best-effort: any query
// error yields an empty list rather than breaking the page.
export async function loadConflictsForTicket(
  supabase: SupabaseClient,
  ticket: TicketLike,
): Promise<Conflict[]> {
  const target = targetFromDetails(ticket.details);
  if (!target) return [];
  const dates = target.occurrences.map(o => o.date);
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  try {
    // Events are filtered to the date span; pending requests are loaded wholesale
    // (a recurring one can clash on a date its details.date column doesn't name),
    // then expanded + matched in memory. The pending pool is committee-sized.
    const [{ data: events }, { data: reqs }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, location, start_at, end_at, source_ticket_id")
        .is("deleted_at", null)
        .gte("start_at", `${minDate}T00:00:00`)
        .lte("start_at", `${maxDate}T23:59:59`),
      supabase
        .from("maintenance_requests")
        .select("id, description, details")
        .is("deleted_at", null)
        .not("details", "is", null)
        .eq("review_status", "pending_review")
        .neq("id", ticket.id),
    ]);
    const candidates: ConflictCandidate[] = [];
    for (const e of (events as EventRow[] | null) ?? []) {
      if (e.source_ticket_id === ticket.id) continue; // not its own booking
      candidates.push(eventCandidate(e, minDate));
    }
    for (const r of (reqs as ReqRow[] | null) ?? []) {
      candidates.push(...reqCandidates(r));
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

  const dates = targets.flatMap(t => t.target.occurrences.map(o => o.date)).sort();
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

  // All the queue rows themselves are pending request-candidates (each expanded
  // across its own recurrence series).
  const rowCandidates = rows.flatMap(r => reqCandidates({ id: r.id, description: null, details: r.details }));

  const counts: Record<string, number> = {};
  for (const { id, target } of targets) {
    const candidates: ConflictCandidate[] = [
      ...events.filter(e => e.source_ticket_id !== id).map(e => eventCandidate(e, minDate)),
      ...rowCandidates.filter(c => c.id !== id),
    ];
    const n = findConflicts(target, candidates).length;
    if (n > 0) counts[id] = n;
  }
  return counts;
}
