// Conqueror league age eligibility (Ted Smith via the league, #2026-board).
// A player at a level cannot turn (max_age + 1) on or before the season end
// date, or they have to play up. 14U max age 14 = must not turn 15 on or
// before the end date. Pure module — safe for client and server. Dates are
// calendar YYYY-MM-DD; never go through Date.parse of a date-only string.

import { ageFromDob } from "./age.ts";

export const DEFAULT_SEASON_ENDS_ON = "2026-12-31";

export type AgeCap = {
  id?: string;
  age_group: string;
  max_age: number;
  sort_order: number;
};

// Seeded for a new season; Settings → Season lets the board edit these.
export const DEFAULT_AGE_CAPS: AgeCap[] = [
  { age_group: "10U", max_age: 10, sort_order: 10 },
  { age_group: "12U", max_age: 12, sort_order: 20 },
  { age_group: "14U", max_age: 14, sort_order: 30 },
  { age_group: "16U", max_age: 16, sort_order: 40 },
  { age_group: "18U", max_age: 18, sort_order: 50 },
];

export type SwingKind = "up" | "down";

export type ScheduledWeekend = {
  id: string;
  label: string;
  teamIds: string[];
};

export type EligibilityContext = {
  boardId: string;
  season: string;
  seasonEndsOn: string;
  caps: AgeCap[];
  weekends: ScheduledWeekend[];
};

export type SeasonSettings = {
  boardId: string;
  season: string;
  seasonEndsOn: string;
  caps: AgeCap[];
};

export type AgeCapInput = {
  id?: string;
  age_group: string;
  max_age: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return !!value && ISO.test(value);
}

// Age in full years on a calendar date. Same rules as ageFromDob.
export function ageOnDate(dob: string | null | undefined, on: string): number | null {
  if (!dob || !isIsoDate(on)) return null;
  const [y, m, d] = on.split("-").map(Number);
  return ageFromDob(dob, new Date(y, m - 1, d));
}

// The calendar date they turn `age` (dob 2011-10-25 + 15 → 2026-10-25).
export function turnsAgeOn(dob: string, age: number): string | null {
  if (!isIsoDate(dob) || !Number.isInteger(age) || age < 0) return null;
  const [y, m, d] = dob.split("-");
  return `${String(Number(y) + age).padStart(4, "0")}-${m}-${d}`;
}

export function capForGroup(caps: AgeCap[], ageGroup: string | null | undefined): AgeCap | null {
  if (!ageGroup) return null;
  const key = ageGroup.trim().toLowerCase();
  return caps.find((c) => c.age_group.trim().toLowerCase() === key) ?? null;
}

// Smallest U-number (or leading digits) wins; anything else sorts last.
export function ageGroupRank(group: string | null | undefined): number {
  if (!group) return Number.POSITIVE_INFINITY;
  const n = parseInt(group, 10);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

export function sortedCaps(caps: AgeCap[]): AgeCap[] {
  return [...caps].sort(
    (a, b) => a.sort_order - b.sort_order || a.max_age - b.max_age || a.age_group.localeCompare(b.age_group)
  );
}

// Eligible for a level when their age on the season end date is still at
// most max_age — they must not turn (max_age + 1) on or before that date.
export function isEligibleForLevel(
  dob: string | null | undefined,
  seasonEndsOn: string,
  cap: AgeCap
): boolean {
  const age = ageOnDate(dob, seasonEndsOn);
  return age != null && age <= cap.max_age;
}

// Youngest (lowest max_age, then sort_order) level they can stay on through
// the season end date. Null when there's no birthday or they're too old for
// every configured level.
export function lowestEligibleLevel(
  dob: string | null | undefined,
  seasonEndsOn: string,
  caps: AgeCap[]
): string | null {
  const eligible = sortedCaps(caps).filter((c) => isEligibleForLevel(dob, seasonEndsOn, c));
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => a.max_age - b.max_age || a.sort_order - b.sort_order)[0].age_group;
}

export function agesOutOn(dob: string | null | undefined, cap: AgeCap): string | null {
  if (!dob) return null;
  return turnsAgeOn(dob, cap.max_age + 1);
}

// Rostered on a level they age out of before the season ends. `on` is the
// birthday they become too old (the "Ages out 10/25/26" date).
export function rosterAgeOut(
  dob: string | null | undefined,
  rosterLevel: string | null | undefined,
  seasonEndsOn: string,
  caps: AgeCap[]
): { level: string; on: string } | null {
  const cap = capForGroup(caps, rosterLevel);
  if (!cap || isEligibleForLevel(dob, seasonEndsOn, cap)) return null;
  const on = agesOutOn(dob, cap);
  if (!on) return null;
  return { level: cap.age_group, on };
}

// "10/25/26" — the chip on a player who ages out of their rostered level.
export function formatAgesOutDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

export function agesOutLabel(on: string): string {
  return `Ages out ${formatAgesOutDate(on)}`;
}

export type PlayerEligibility = {
  ageAtSeasonEnd: number | null;
  lowestLevel: string | null;
  agesOut: { level: string; on: string } | null;
};

export function playerEligibility(
  dob: string | null | undefined,
  rosterLevel: string | null | undefined,
  seasonEndsOn: string,
  caps: AgeCap[]
): PlayerEligibility {
  return {
    ageAtSeasonEnd: ageOnDate(dob, seasonEndsOn),
    lowestLevel: lowestEligibleLevel(dob, seasonEndsOn, caps),
    agesOut: rosterAgeOut(dob, rosterLevel, seasonEndsOn, caps),
  };
}

// Younger players who can play up, and older players still age-eligible to
// move down, onto `target`. Same-age laterals and the target's own roster
// are left out. No team yet counts as "up" when they're eligible.
export function swingKind(
  player: { dob: string | null | undefined; teamId: string | null | undefined; teamAgeGroup: string | null | undefined },
  target: { teamId: string; ageGroup: string | null | undefined },
  seasonEndsOn: string,
  caps: AgeCap[]
): SwingKind | null {
  if (!player.dob || player.teamId === target.teamId) return null;
  const cap = capForGroup(caps, target.ageGroup);
  if (!cap || !isEligibleForLevel(player.dob, seasonEndsOn, cap)) return null;
  const theirs = ageGroupRank(player.teamAgeGroup);
  const ours = ageGroupRank(target.ageGroup);
  if (!Number.isFinite(ours)) return null;
  if (!player.teamId || !Number.isFinite(theirs) || theirs < ours) return "up";
  if (theirs > ours) return "down";
  return null;
}

export function weekendsSharedWith(
  playerTeamId: string | null | undefined,
  targetTeamId: string,
  weekends: ScheduledWeekend[]
): ScheduledWeekend[] {
  if (!playerTeamId || playerTeamId === targetTeamId) return [];
  return weekends.filter((w) => w.teamIds.includes(playerTeamId) && w.teamIds.includes(targetTeamId));
}

const DAY = /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;
const DAY_KEY: Record<string, string> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

function practiceDays(times: string[] | null | undefined): Set<string> {
  const days = new Set<string>();
  for (const t of times ?? []) {
    for (const m of t.matchAll(DAY)) {
      const key = DAY_KEY[m[1].toLowerCase()];
      if (key) days.add(key);
    }
  }
  return days;
}

// True when both teams list a practice on the same weekday. Free-text times
// (no day) never match — we only mark when the schedule data is clear.
export function practiceDaysOverlap(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const theirs = practiceDays(a);
  if (theirs.size === 0) return false;
  for (const d of practiceDays(b)) if (theirs.has(d)) return true;
  return false;
}
