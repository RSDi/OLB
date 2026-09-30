// Repeating events keep their Central wall-clock time and weekday on every
// occurrence, on both sides of a daylight-saving change, whatever the
// server's timezone (Vercel runs in UTC). lib/events/occurrences.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expandEventOccurrences } from "../../lib/events/occurrences.ts";
import { zonedParts, zonedTimeToUtc } from "../../lib/dates/zoned.ts";

const central = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function weekly(start_at: string, end_at: string | null, weekdays: number[]) {
  return { id: "e", start_at, end_at, recurring: true, recur_freq: "weekly", recur_weekdays: weekdays };
}

test("a 6:00 PM weekly practice stays 6:00 PM Central after daylight saving ends and starts", () => {
  // Mon/Wed 6:00–7:30 PM CDT, first on Monday Oct 5, 2026.
  const ev = weekly("2026-10-05T23:00:00Z", "2026-10-06T00:30:00Z", [1, 3]);
  const occ = expandEventOccurrences([ev], {
    from: new Date("2026-10-01T12:00:00Z"),
    to: new Date("2027-03-31T12:00:00Z"),
  });
  const at = (day: string) => occ.find((o) => central(o.startAt).startsWith(day));
  // Before (CDT), after Nov 1 (CST), and after Mar 14 (CDT again).
  for (const day of ["Mon, Oct 5", "Mon, Nov 2", "Wed, Jan 6", "Mon, Mar 15"]) {
    const o = at(day);
    assert.ok(o, `${day} is an occurrence`);
    assert.equal(central(o.startAt), `${day}, 6:00 PM`);
    assert.equal(central(o.endAt!), `${day}, 7:30 PM`);
  }
  assert.equal(at("Mon, Nov 2")!.startAt, "2026-11-03T00:00:00.000Z");
  assert.ok(occ.every((o) => /^(Mon|Wed)/.test(central(o.startAt))), "only Mondays and Wednesdays");
});

test("an evening event that's already tomorrow in UTC stays on its Central day", () => {
  // Monday 7:30 PM CDT is Tuesday 00:30 UTC.
  const ev = weekly("2026-10-06T00:30:00Z", null, [1]);
  const occ = expandEventOccurrences([ev], {
    from: new Date("2026-10-01T12:00:00Z"),
    to: new Date("2026-11-30T12:00:00Z"),
  });
  const days = occ.map((o) => central(o.startAt));
  assert.equal(days[0], "Mon, Oct 5, 7:30 PM", "the first Monday isn't dropped");
  assert.ok(days.every((d) => d.startsWith("Mon") && d.endsWith("7:30 PM")), days.join(" | "));
  assert.equal(days.length, 9); // Oct 5 … Nov 30
});

test("a one-off event passes through untouched", () => {
  const ev = { id: "x", start_at: "2026-11-10T01:00:00Z", end_at: null, recurring: false };
  const occ = expandEventOccurrences([ev], { from: new Date("2026-01-01"), to: new Date("2026-01-02") });
  assert.deepEqual(occ.map((o) => [o.startAt, o.recurringInstance]), [["2026-11-10T01:00:00Z", false]]);
});

test("zoned helpers round-trip Central wall-clock times, DST included", () => {
  const p = zonedParts(new Date("2026-11-03T00:00:00Z"));
  assert.deepEqual([p.ymd, p.hour, p.minute], ["2026-11-02", 18, 0]);
  assert.equal(zonedTimeToUtc("2026-07-04", { hour: 18, minute: 0 }).toISOString(), "2026-07-04T23:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-12-25", { hour: 18, minute: 0 }).toISOString(), "2026-12-26T00:00:00.000Z");
  // 2:30 AM doesn't exist on Mar 14, 2027 (clocks jump 2→3): it lands at 3:30 CDT.
  assert.equal(zonedTimeToUtc("2027-03-14", { hour: 2, minute: 30 }).toISOString(), "2027-03-14T08:30:00.000Z");
});

test("a morning event on the spring-forward Sunday keeps its time", () => {
  // Sundays 7:00 AM Central, first on Mar 7, 2027; clocks jump 2→3 AM on Mar 14.
  const ev = weekly("2027-03-07T13:00:00Z", null, [0]);
  const occ = expandEventOccurrences([ev], {
    from: new Date("2027-03-07T12:00:00Z"),
    to: new Date("2027-03-21T12:00:00Z"),
  });
  assert.deepEqual(occ.map((o) => central(o.startAt)), ["Sun, Mar 7, 7:00 AM", "Sun, Mar 14, 7:00 AM", "Sun, Mar 21, 7:00 AM"]);
  assert.equal(occ[1].startAt, "2027-03-14T12:00:00.000Z");
  // 3:00 AM, the first minute after the jump, is 3:00 CDT.
  assert.equal(zonedTimeToUtc("2027-03-14", { hour: 3, minute: 0 }).toISOString(), "2027-03-14T08:00:00.000Z");
});
