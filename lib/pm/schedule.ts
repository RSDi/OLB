// Schedule computation for PM templates. Kept in its own module so both the
// action layer and the UI can use it (the UI shows "next would be …" preview
// when editing a template).

export type ScheduleKind = "monthly_day" | "weekly_day" | "after_completion_days";

export function computeNextScheduledFor({
  kind,
  value,
  lastCompletedAt,
  today = new Date(),
}: {
  kind: ScheduleKind;
  value: number;
  lastCompletedAt?: Date | null;
  today?: Date;
}): Date {
  if (kind === "monthly_day") {
    const day = clamp(value, 1, 28);
    const candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (sameDay(candidate, today) || candidate > today) return candidate;
    return new Date(today.getFullYear(), today.getMonth() + 1, day);
  }
  if (kind === "weekly_day") {
    const targetDow = clamp(value, 0, 6);
    const currentDow = today.getDay();
    const daysUntil = (targetDow - currentDow + 7) % 7;
    const target = new Date(today);
    target.setDate(today.getDate() + daysUntil);
    target.setHours(0, 0, 0, 0);
    return target;
  }
  if (kind === "after_completion_days") {
    const base = lastCompletedAt ?? today;
    const target = new Date(base);
    target.setDate(target.getDate() + Math.max(1, value));
    target.setHours(0, 0, 0, 0);
    return target;
  }
  throw new Error(`Unknown schedule kind: ${kind}`);
}

export function describeSchedule(kind: ScheduleKind, value: number): string {
  if (kind === "monthly_day") {
    return `Monthly on day ${value}`;
  }
  if (kind === "weekly_day") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Weekly on ${days[clamp(value, 0, 6)]}`;
  }
  if (kind === "after_completion_days") {
    return `${value} day${value === 1 ? "" : "s"} after last completion`;
  }
  return "Unknown schedule";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
