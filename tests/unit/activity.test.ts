// The Activity page's pure pieces: the "Preview as" cookie and who can be
// previewed (lib/activity/preview-*.ts), and how recorded paths, durations,
// times and devices are shown (lib/activity/paths.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodePreviewCookie,
  parsePreviewCookie,
  previewExpired,
} from "../../lib/activity/preview-cookie.ts";
import { previewBlocker } from "../../lib/activity/preview-rules.ts";
import {
  describePath,
  fmtDay,
  fmtDuration,
  lastDays,
  parseUserAgent,
  pathLabel,
  relTime,
} from "../../lib/activity/paths.ts";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const SECRET = "a".repeat(43);

test("preview cookie round-trips and rejects anything malformed", () => {
  const c = { id: ID, secret: SECRET, expiresAt: 1_800_000_000_000 };
  assert.deepEqual(parsePreviewCookie(encodePreviewCookie(c)), c);
  assert.equal(parsePreviewCookie(undefined), null);
  assert.equal(parsePreviewCookie(""), null);
  assert.equal(parsePreviewCookie(`${ID}.${SECRET}`), null);
  assert.equal(parsePreviewCookie(`not-a-uuid.${SECRET}.1`), null);
  assert.equal(parsePreviewCookie(`${ID}.short.1`), null);
  assert.equal(parsePreviewCookie(`${ID}.${SECRET}.soon`), null);
  assert.equal(parsePreviewCookie(`${ID}.${SECRET}.1.extra`), null);
});

test("a preview expires at its deadline", () => {
  const c = { id: ID, secret: SECRET, expiresAt: 1000 };
  assert.equal(previewExpired(c, 999), false);
  assert.equal(previewExpired(c, 1000), true);
});

test("only approved, signed-up members other than you can be previewed", () => {
  const ok = { user_id: "u-1", role: "member", status: "approved", access_revoked_at: null, deleted_at: null };
  assert.equal(previewBlocker(ok, "me"), null);
  assert.equal(previewBlocker({ ...ok, role: "admin" }, "me"), null);
  assert.notEqual(previewBlocker({ ...ok, user_id: null }, "me"), null);
  assert.notEqual(previewBlocker(ok, "u-1"), null);
  assert.equal(previewBlocker({ ...ok, role: "super_admin" }, "me"), null);
  assert.notEqual(previewBlocker({ ...ok, status: "pending" }, "me"), null);
  assert.notEqual(previewBlocker({ ...ok, status: "denied" }, "me"), null);
  assert.notEqual(previewBlocker({ ...ok, access_revoked_at: "2026-09-01T00:00:00Z" }, "me"), null);
  assert.notEqual(previewBlocker({ ...ok, deleted_at: "2026-09-01T00:00:00Z" }, "me"), null);
});

test("recorded paths read as words", () => {
  assert.equal(pathLabel("/portal/directory"), "Directory");
  assert.equal(pathLabel("/portal/directory/3f2b8c1e"), "Directory · Profile");
  assert.equal(pathLabel("/portal/directory/teams/abc"), "Directory · Team page");
  assert.equal(pathLabel("/portal/docs/abc/history"), "Playbooks · Playbook · History");
  assert.equal(pathLabel("/portal/contacts/abc/edit"), "External Contacts · Contact · Edit");
  assert.equal(pathLabel("/portal/slack-archive/search?q=tournament"), "Slack Archive · Search · Search: tournament");
  assert.equal(pathLabel("/portal"), "Dashboard");
  assert.equal(pathLabel("/portal/something-new"), "something-new");
  assert.deepEqual(describePath("/portal/activity?u=abc"), { section: "Activity", page: undefined, detail: undefined });
});

test("durations", () => {
  assert.equal(fmtDuration(0), "0s");
  assert.equal(fmtDuration(45_000), "45s");
  assert.equal(fmtDuration(12 * 60_000), "12m");
  assert.equal(fmtDuration(65 * 60_000), "1h 5m");
  assert.equal(fmtDuration(2 * 3600_000), "2h");
  assert.equal(fmtDuration(50 * 3600_000), "2d 2h");
  assert.equal(fmtDuration(-5), "0s");
});

test("relative times", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  assert.equal(relTime(null, now), "—");
  assert.equal(relTime("2026-09-27T11:59:50Z", now), "just now");
  assert.equal(relTime("2026-09-27T11:55:00Z", now), "5 minutes ago");
  assert.equal(relTime("2026-09-27T09:00:00Z", now), "3 hours ago");
  assert.equal(relTime("2026-09-26T12:00:00Z", now), "yesterday");
  assert.equal(relTime("2026-09-13T12:00:00Z", now), "2 weeks ago");
});

test("devices", () => {
  assert.equal(parseUserAgent(null), "—");
  assert.equal(
    parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    "Safari · iPhone"
  );
  assert.equal(
    parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0"),
    "Edge · Windows"
  );
  assert.equal(
    parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"),
    "Chrome · Mac"
  );
});

test("the last 30 days, in club time, across a daylight-saving change", () => {
  // 2026-11-01 is the fall-back day in Chicago.
  const days = lastDays(30, Date.parse("2026-11-15T05:30:00Z")); // 11:30pm Nov 14 in Chicago
  assert.equal(days.length, 30);
  assert.equal(days[29], "2026-11-14");
  assert.equal(days[0], "2026-10-16");
  assert.equal(new Set(days).size, 30);
  assert.equal(fmtDay("2026-11-01"), "Nov 1");
});
