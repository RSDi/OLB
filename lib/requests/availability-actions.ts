"use server";

// Booking-calendar availability: the busy windows (existing confirmed
// reservations) for a set of spaces over a date range, so the wizard can show
// members only the free start times. Runs with the member's session — approved
// members can read all non-deleted events (RLS events_select_authenticated),
// which is exactly the calendar everyone already sees on /portal/events.
//
// Pending requests deliberately do NOT block here: they're competing requests,
// not confirmed bookings, and the board still gets the conflict flag.

import { createClient } from "../supabase/server";
import { spacesFromLocation, timeFromTimestamp, dateFromTimestamp } from "./conflicts";
import { hhmmToMinutes, type BusyWindow } from "./availability";

interface EventRow {
  location: string | null;
  start_at: string;
  end_at: string | null;
}

// date (YYYY-MM-DD) → merged busy windows for any of the requested spaces.
export async function loadBusyWindows(
  spaces: string[],
  fromDate: string,
  toDate: string,
): Promise<Record<string, BusyWindow[]>> {
  if (!Array.isArray(spaces) || spaces.length === 0) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return {};

  const supabase = await createClient();
  let rows: EventRow[] = [];
  try {
    const { data } = await supabase
      .from("events")
      .select("location, start_at, end_at")
      .is("deleted_at", null)
      .gte("start_at", `${fromDate}T00:00:00`)
      .lte("start_at", `${toDate}T23:59:59`);
    rows = (data as EventRow[] | null) ?? [];
  } catch (err) {
    console.error("[availability] events load failed (non-fatal):", err);
    return {};
  }

  const out: Record<string, BusyWindow[]> = {};
  for (const e of rows) {
    const evSpaces = spacesFromLocation(e.location);
    if (!evSpaces.some((s) => spaces.includes(s))) continue; // not a space we care about
    const date = dateFromTimestamp(e.start_at);
    if (!date) continue;
    const startMin = hhmmToMinutes(timeFromTimestamp(e.start_at));
    // No/blank times → treat as all-day busy. Missing end → assume 1 hour.
    const win: BusyWindow =
      startMin == null
        ? { start: 0, end: 24 * 60 }
        : { start: startMin, end: hhmmToMinutes(timeFromTimestamp(e.end_at)) ?? startMin + 60 };
    (out[date] ??= []).push(win);
  }
  return out;
}
