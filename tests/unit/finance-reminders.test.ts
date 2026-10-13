// Messages to families from Finances (0133): {balance} and friends, and when
// the weekly reminder goes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REMINDER,
  cleanReminder,
  dueText,
  familyKey,
  fillMoney,
  isoWeekday,
  moneyFor,
  reminderDue,
  reminderSummary,
  type ReminderSettings,
} from "../../lib/finances/reminders.ts";

const on: ReminderSettings = { ...DEFAULT_REMINDER, reminder_enabled: true, reminder_subject: "s", reminder_body: "b" };

test("{balance}, {due_date} and {family} fill in; {player} is left for the message", () => {
  const text = "Hi {family} family: {balance} for {player}, due {due_date}.";
  assert.equal(fillMoney(text, { balanceCents: 13930, dueOn: "2026-11-15", family: "Wesner" }), "Hi Wesner family: $139.30 for {player}, due November 15, 2026.");
  // A credit never reads as a negative amount, and no date reads "soon".
  assert.equal(fillMoney("{balance} by {due_date}", { balanceCents: -2400, dueOn: null, family: "X" }), "$0.00 by soon");
  assert.equal(dueText("2027-01-05"), "January 5, 2027");
});

test("a family's money adds up every Payments account its players are in", () => {
  const accounts = [
    { playerIds: ["luke", "nate"], balanceCents: 11530, name: "Wesner" },
    { playerIds: ["max"], balanceCents: 0, name: "Malone" },
  ];
  const m = moneyFor(["nate"], accounts, { luke: "2026-11-01" }, "2026-11-15");
  assert.deepEqual(m, { balanceCents: 11530, dueOn: "2026-11-01", family: "Wesner" });
  assert.equal(moneyFor(["max"], accounts, {}, "2026-11-15").dueOn, "2026-11-15");
  assert.equal(familyKey(["nate", "luke"]), "luke,nate");
});

test("the weekly reminder: its day, after the start, while they owe, unless paused", () => {
  // 2026-11-16 is a Monday.
  assert.equal(isoWeekday("2026-11-16"), 1);
  assert.equal(isoWeekday("2026-11-22"), 7);
  const fam = { balanceCents: 5000, dueOn: "2026-11-15", paused: false };
  assert.equal(reminderDue(on, "2026-11-16", fam), true);
  assert.equal(reminderDue(on, "2026-11-17", fam), false, "not the day");
  assert.equal(reminderDue(on, "2026-11-09", fam), false, "before the due date");
  assert.equal(reminderDue({ ...on, reminder_offset_days: -7 }, "2026-11-09", fam), true, "a week before");
  assert.equal(reminderDue({ ...on, reminder_offset_days: 14 }, "2026-11-23", fam), false, "two weeks after starts the 29th");
  assert.equal(reminderDue(on, "2026-11-16", { ...fam, balanceCents: 0 }), false, "paid up");
  assert.equal(reminderDue(on, "2026-11-16", { ...fam, paused: true }), false, "paused");
  assert.equal(reminderDue(on, "2026-11-16", { ...fam, dueOn: null }), false, "no due date");
  assert.equal(reminderDue({ ...on, reminder_start: "owing" }, "2026-11-16", { ...fam, dueOn: null }), true, "as soon as they owe");
  assert.equal(reminderDue({ ...on, reminder_enabled: false }, "2026-11-16", fam), false, "off");
});

test("the reminder's settings are checked, and read back in plain words", () => {
  assert.match(reminderSummary({ ...on, reminder_offset_days: 7 }), /^Every Monday, from a week after each family's due date/);
  assert.match(reminderSummary({ ...on, reminder_start: "owing", reminder_weekday: 5 }), /^Every Friday, to every family that owes/);
  assert.ok("error" in cleanReminder({ ...on, reminder_roles: [] }));
  assert.ok("error" in cleanReminder({ ...on, reminder_weekday: 8 }));
  assert.ok("error" in cleanReminder({ ...on, reminder_body: " " }));
  const owing = cleanReminder({ ...on, reminder_start: "owing", reminder_offset_days: 7 });
  assert.ok(!("error" in owing) && owing.reminder_offset_days === 0);
  // Off, it saves without wording.
  assert.ok(!("error" in cleanReminder({ ...DEFAULT_REMINDER })));
});
