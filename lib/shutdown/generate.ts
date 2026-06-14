// Building-shutdown wizard, Phase 2c. Expands recurring, shutdown-linked events
// into upcoming occurrence dates and creates one dated, unassigned shutdown task
// per occurrence. Idempotent: a unique (event_id, occurrence_date) index +
// an existence check mean repeated runs (the daily cron) never duplicate.
//
// Server-only — uses the admin client so it can write without a user session,
// like the PM generator it mirrors. Assignment is left to staff (Phase 2b).

import { createAdminClient } from "../supabase/admin";
import { formatDateLabel } from "../requests/recurrence";
import { eventOccurrenceDates, type EventRecurrence } from "../events/recurrence";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type RecurringEvent = EventRecurrence & {
  id: string;
  title: string;
};

export interface GenerateSummary {
  timestamp: string;
  events_scanned: number;
  tasks_created: number;
  skipped: number;
  errors: { eventId: string; error: string }[];
}

// Generate shutdown tasks for every recurring, shutdown-linked event whose
// occurrences fall within the next `windowDays`. `today` is injectable for
// tests; defaults to now.
export async function generateUpcomingShutdownTasks(opts?: {
  windowDays?: number;
  today?: Date;
}): Promise<GenerateSummary> {
  const windowDays = opts?.windowDays ?? 21;
  const today = opts?.today ?? new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowDays);
  const todayStr = ymd(today);
  const windowEndStr = ymd(windowEnd);

  const admin = createAdminClient();
  const summary: GenerateSummary = {
    timestamp: new Date().toISOString(),
    events_scanned: 0,
    tasks_created: 0,
    skipped: 0,
    errors: [],
  };

  const { data: evRaw, error: evErr } = await admin
    .from("events")
    .select("id, title, start_at, recurring, recur_freq, recur_weekdays, recur_until, recur_monthly_week, recur_monthly_weekday, recur_except")
    .eq("recurring", true)
    .not("shutdown_procedure_id", "is", null)
    .is("deleted_at", null);
  if (evErr) {
    summary.errors.push({ eventId: "(query)", error: evErr.message });
    return summary;
  }
  const events = (evRaw as RecurringEvent[]) ?? [];
  summary.events_scanned = events.length;

  // The category for shutdown tasks (seeded in 0061).
  const { data: cat } = await admin
    .from("task_categories")
    .select("id")
    .ilike("name", "Building Shutdown")
    .is("deleted_at", null)
    .maybeSingle();
  const categoryId = (cat as { id: string } | null)?.id ?? null;

  for (const ev of events) {
    // Resolve this event's occurrence dates in the rolling window (weekly or
    // monthly, minus any skipped dates) via the shared recurrence engine.
    const dates = eventOccurrenceDates(ev, todayStr, windowEndStr);
    if (dates.length === 0) {
      summary.skipped += 1;
      continue;
    }

    for (const date of dates) {
      // Idempotency: skip if a live task already covers this occurrence.
      const { data: existing } = await admin
        .from("maintenance_requests")
        .select("id")
        .eq("event_id", ev.id)
        .eq("occurrence_date", date)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) {
        summary.skipped += 1;
        continue;
      }
      const { error: insErr } = await admin.from("maintenance_requests").insert({
        description: `Building shutdown — ${ev.title} · ${formatDateLabel(date)}`,
        status: "open",
        review_status: "approved",
        event_id: ev.id,
        occurrence_date: date,
        category_id: categoryId,
      });
      if (insErr) {
        // A concurrent run may have inserted the same (event, date) — the unique
        // index throws 23505, which we treat as already-done, not an error.
        if ((insErr as { code?: string }).code === "23505") {
          summary.skipped += 1;
        } else {
          summary.errors.push({ eventId: ev.id, error: insErr.message });
        }
        continue;
      }
      summary.tasks_created += 1;
    }
  }

  return summary;
}
