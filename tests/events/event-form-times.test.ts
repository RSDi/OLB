// The event form's date-time fields hold Central wall-clock times
// ("YYYY-MM-DDTHH:mm"). The edit page fills them on the server (UTC on
// Vercel) and the form saves them in whatever timezone the browser is in, so
// both conversions go through lib/dates/zoned.ts. The process clock is pinned
// to UTC so a Central-time laptop can't hide a server-local mistake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedDatetimeLocal, toZonedDatetimeLocal } from "../../lib/dates/zoned.ts";

process.env.TZ = "UTC";

test("the edit form opens a 6:00 PM Central event at 18:00, in summer and winter", () => {
  assert.equal(toZonedDatetimeLocal(new Date("2026-10-05T23:00:00Z")), "2026-10-05T18:00"); // CDT
  assert.equal(toZonedDatetimeLocal(new Date("2026-12-07T00:00:00Z")), "2026-12-06T18:00"); // CST
});

test("a late-evening event opens on its Central day, not the UTC one", () => {
  // Monday 9:30 PM CDT is Tuesday 02:30 UTC.
  assert.equal(toZonedDatetimeLocal(new Date("2026-10-06T02:30:00Z")), "2026-10-05T21:30");
});

test("saving the form reads its fields as Central time", () => {
  assert.equal(fromZonedDatetimeLocal("2026-10-05T18:00").toISOString(), "2026-10-05T23:00:00.000Z");
  assert.equal(fromZonedDatetimeLocal("2026-12-06T18:00").toISOString(), "2026-12-07T00:00:00.000Z");
});

test("saving an event without touching its time keeps the time", () => {
  for (const iso of ["2026-10-05T23:00:00.000Z", "2026-11-03T00:00:00.000Z", "2027-03-16T01:30:00.000Z"]) {
    assert.equal(fromZonedDatetimeLocal(toZonedDatetimeLocal(new Date(iso))).toISOString(), iso);
  }
});
