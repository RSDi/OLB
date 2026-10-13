// Messages to families about what they owe (0133): the tokens filled in for
// each family, and when the weekly reminder goes. Pure, for client and
// server.

import { addDays, weekday } from "../onboarding/dates.ts"; // explicit extensions so node --test can load this file
import { formatAmount } from "./logic.ts";
import type { Recipient } from "../teams/family-mail.ts";

// What each family's message can say about them.
export interface FamilyMoney {
  balanceCents: number; // what they owe; zero or below is nothing
  dueOn: string | null; // "2026-11-15"
  family: string; // "Wesner"
}

export const BALANCE_TOKENS = ["{balance}", "{due_date}", "{family}"] as const;
export const BALANCE_TOKEN_HELP = "{balance} becomes what each family owes, {due_date} their due date, {family} their last name, and {player} their players' names.";

// "November 15, 2026".
export function dueText(day: string | null): string {
  if (!day) return "soon";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// {balance}, {due_date} and {family} for one family. {player} and {name}
// are left for the message's own filling.
export function fillMoney(text: string, money: FamilyMoney): string {
  return text
    .replace(/\{balance\}/gi, formatAmount(Math.max(0, money.balanceCents)))
    .replace(/\{due_date\}/gi, dueText(money.dueOn))
    .replace(/\{family\}/gi, money.family);
}

export const usesMoney = (text: string) => /\{(balance|due_date|family)\}/i.test(text);

// ─── The weekly reminder ────────────────────────────────────────────────────

export type ReminderStart = "owing" | "due";

export interface ReminderSettings {
  reminder_enabled: boolean;
  reminder_weekday: number; // 1 = Monday … 7 = Sunday
  reminder_start: ReminderStart;
  reminder_offset_days: number; // from the due date: -7 a week before
  reminder_roles: Recipient[];
  reminder_subject: string | null;
  reminder_body: string | null;
}

export const REMINDER_SUBJECT = "Omaha Lightning: {balance} still due";
export const REMINDER_BODY = `Hi {family} family,

A friendly reminder that {balance} is still due for {player}'s Omaha Lightning season, due {due_date}.

You can pay by Venmo or check, and you'll see your balance on the site under Payments. If you've already sent it, thank you, and please ignore this note.

Questions? Just reply to this email.

Omaha Lightning`;

export const DEFAULT_REMINDER: ReminderSettings = {
  reminder_enabled: false,
  reminder_weekday: 1,
  reminder_start: "due",
  reminder_offset_days: 0,
  reminder_roles: ["father", "mother", "guardian"],
  reminder_subject: null,
  reminder_body: null,
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// 1 = Monday … 7 = Sunday for a "2026-10-12" day.
export function isoWeekday(day: string): number {
  const w = weekday(day);
  return w === 0 ? 7 : w;
}

// The first day the reminder can go to a family with this due date, or null
// when it can't (it starts from a due date they don't have).
export function reminderStartsOn(s: Pick<ReminderSettings, "reminder_start" | "reminder_offset_days">, dueOn: string | null): string | null {
  if (s.reminder_start === "owing") return "0000-01-01";
  if (!dueOn) return null;
  return addDays(dueOn, s.reminder_offset_days);
}

// Whether today's run sends this family a reminder: it's on, it's the day,
// they owe, they aren't paused, and their start has come.
export function reminderDue(
  s: ReminderSettings,
  today: string,
  family: { balanceCents: number; dueOn: string | null; paused: boolean }
): boolean {
  if (!s.reminder_enabled || family.paused || family.balanceCents <= 0) return false;
  if (isoWeekday(today) !== s.reminder_weekday) return false;
  const start = reminderStartsOn(s, family.dueOn);
  return start != null && today >= start;
}

// "Every Monday, from a week after each family's due date, until they've paid."
export function reminderSummary(s: ReminderSettings): string {
  const day = `Every ${WEEKDAYS[s.reminder_weekday - 1] ?? "Monday"}`;
  const n = Math.abs(s.reminder_offset_days);
  const days = n === 7 ? "a week" : n === 14 ? "two weeks" : `${n} ${n === 1 ? "day" : "days"}`;
  const from =
    s.reminder_start === "owing"
      ? "to every family that owes"
      : s.reminder_offset_days === 0
        ? "from each family's due date"
        : s.reminder_offset_days < 0
          ? `from ${days} before each family's due date`
          : `from ${days} after each family's due date`;
  return `${day}, ${from}, until they've paid.`;
}

export function cleanReminder(input: Partial<ReminderSettings>): ReminderSettings | { error: string } {
  const weekdayN = Number(input.reminder_weekday);
  if (!Number.isInteger(weekdayN) || weekdayN < 1 || weekdayN > 7) return { error: "Pick the day it goes." };
  const start = input.reminder_start === "owing" ? "owing" : "due";
  const offset = Number(input.reminder_offset_days ?? 0);
  if (!Number.isInteger(offset) || offset < -60 || offset > 120) return { error: "Days from the due date: between 60 before and 120 after." };
  const roles = (["father", "mother", "guardian", "player"] as Recipient[]).filter((r) => input.reminder_roles?.includes(r));
  if (roles.length === 0) return { error: "Pick who gets it." };
  const subject = (input.reminder_subject ?? "").trim();
  const body = (input.reminder_body ?? "").trim();
  if (subject.length > 200) return { error: "The subject is too long (200 characters at most)." };
  if (body.length > 4000) return { error: "The message is too long (4,000 characters at most)." };
  if (input.reminder_enabled && (!subject || !body)) return { error: "Add the reminder's subject and message." };
  return {
    reminder_enabled: !!input.reminder_enabled,
    reminder_weekday: weekdayN,
    reminder_start: start,
    reminder_offset_days: start === "owing" ? 0 : offset,
    reminder_roles: roles,
    reminder_subject: subject || null,
    reminder_body: body || null,
  };
}

// One key per family, the same every week: its players' ids, sorted.
export function familyKey(playerIds: string[]): string {
  return [...playerIds].sort().join(",");
}

// A family's balance and due date from the Payments accounts its players
// are in: every account touched counts once, so a blended family adds up.
export function moneyFor(
  playerIds: string[],
  accounts: { playerIds: string[]; balanceCents: number; name: string }[],
  dues: Record<string, string>,
  defaultDue: string | null
): FamilyMoney {
  const wanted = new Set(playerIds);
  const touched = accounts.filter((a) => a.playerIds.some((id) => wanted.has(id)));
  const all = touched.flatMap((a) => a.playerIds);
  const due = all.map((id) => dues[id]).filter(Boolean).sort()[0] ?? defaultDue;
  return {
    balanceCents: touched.reduce((n, a) => n + a.balanceCents, 0),
    dueOn: due ?? null,
    family: touched.map((a) => a.name).join(" / ") || "Lightning",
  };
}
