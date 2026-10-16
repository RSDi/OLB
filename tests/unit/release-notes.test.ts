// Release notes (lib/release-notes): in-code list, automatic versions, and
// the seen-marker used by Settings → Release Notes and the What's new toast.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cmpVersion,
  nextSeenVersion,
  seenReleaseVersion,
  unseenReleases,
  withVersions,
  type AuthoredRelease,
} from "../../lib/release-notes/model.ts";
import { RELEASES } from "../../lib/release-notes/releases.ts";

test("the 10/16 seed entries are newest-first with derived versions from 26.10.0", () => {
  assert.equal(RELEASES.length, 5);
  assert.deepEqual(
    RELEASES.map((r) => [r.version, r.title]),
    [
      ["26.10.4", "Age eligibility and swing-ups"],
      ["26.10.3", "Tick families off before you send"],
      ["26.10.2", "Roadmap Preview column"],
      ["26.10.1", "Covered via sibling, and Travel sees every player"],
      ["26.10.0", "Staying elsewhere and sibling marking"],
    ]
  );
  assert.ok(RELEASES.every((r) => r.date === "October 16, 2026"));
  assert.ok(RELEASES.every((r) => r.features.length >= 2));
  assert.deepEqual(RELEASES[0].tour, ["settings-season", "directory"]);
  assert.deepEqual(RELEASES[1].tour, ["email-families-send", "slack-dms-send"]);
  assert.equal(RELEASES[2].tour, undefined);
  assert.equal(RELEASES[3].tour, "hotel-covered-sibling");
  assert.equal(RELEASES[4].tour, "hotel-staying-elsewhere");
});

test("withVersions fills omitted versions from the oldest anchor", () => {
  const authored: AuthoredRelease[] = [
    { date: "October 16, 2026", title: "C", color: "#000", features: ["c"] },
    { date: "October 16, 2026", title: "B", color: "#000", features: ["b"] },
    { date: "May 7, 2026", title: "A", color: "#000", features: ["a"], version: "26.8.140" },
  ];
  assert.deepEqual(
    withVersions(authored).map((r) => r.version),
    ["26.8.142", "26.8.141", "26.8.140"]
  );
});

test("withVersions refuses a missing oldest version or a non-descending stack", () => {
  assert.throws(
    () => withVersions([{ date: "d", title: "No version", color: "#000", features: ["x"] }]),
    /oldest entry/
  );
  assert.throws(
    () =>
      withVersions([
        { date: "d", title: "New", color: "#000", features: ["x"], version: "26.10.0" },
        { date: "d", title: "Old", color: "#000", features: ["x"], version: "26.10.1" },
      ]),
    /descend/
  );
});

test("cmpVersion is numeric per segment, so 26.10.9 < 26.10.10", () => {
  assert.ok(cmpVersion("26.10.9", "26.10.10") < 0);
  assert.ok(cmpVersion("26.11.0", "26.10.10") > 0);
  assert.equal(cmpVersion("26.10.3", "26.10.3"), 0);
});

test("a first visit sees only the latest; later visits see anything newer than the marker", () => {
  assert.deepEqual(
    unseenReleases(RELEASES, null).map((r) => r.version),
    ["26.10.4"]
  );
  assert.deepEqual(
    unseenReleases(RELEASES, "26.10.1").map((r) => r.version),
    ["26.10.4", "26.10.3", "26.10.2"]
  );
  assert.deepEqual(unseenReleases(RELEASES, "26.10.4"), []);
  assert.deepEqual(unseenReleases(RELEASES, "26.11.0"), []);
});

test("nextSeenVersion advances to the latest and never goes backward", () => {
  assert.equal(nextSeenVersion(RELEASES, null), "26.10.4");
  assert.equal(nextSeenVersion(RELEASES, "26.10.0"), "26.10.4");
  assert.equal(nextSeenVersion(RELEASES, "26.11.0"), "26.11.0");
  assert.equal(nextSeenVersion([], "26.10.0"), "26.10.0");
});

test("seenReleaseVersion keeps a non-empty string", () => {
  assert.equal(seenReleaseVersion("26.10.3"), "26.10.3");
  assert.equal(seenReleaseVersion("  26.10.0  "), "26.10.0");
  assert.equal(seenReleaseVersion(""), null);
  assert.equal(seenReleaseVersion(null), null);
  assert.equal(seenReleaseVersion(3), null);
});
