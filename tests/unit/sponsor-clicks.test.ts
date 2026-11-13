import { test } from "node:test";
import assert from "node:assert/strict";
import { countedLink, goLink, sponsorBySlug } from "../../lib/sponsors/links.ts";
import { sumClicks } from "../../lib/sponsors/clicks.ts";

test("a counted sponsor's web address goes through /go, others stay as they are", () => {
  assert.equal(countedLink("https://www.teamtimehq.com", "site"), "/go/team-time?from=site");
  assert.equal(countedLink("https://teamtimehq.com/about", "site"), "/go/team-time?from=site");
  assert.equal(countedLink("https://dundeema.com", "live"), "/go/dundee?from=live");
  assert.equal(countedLink("https://example.com", "site"), "https://example.com");
  assert.equal(countedLink("not a url", "site"), "not a url");
  assert.equal(goLink("nelson", "live"), "/go/nelson?from=live");
  assert.equal(sponsorBySlug("nelson")?.url, "https://www.nelsonproducefarm.com");
  assert.equal(sponsorBySlug("nope"), undefined);
});

test("clicks add up per sponsor: people are different browsers, split by where they clicked", () => {
  const rows = [
    { sponsor: "team-time", source: "live", visitor_id: "a", created_at: "2026-11-13T17:00:00Z" },
    { sponsor: "team-time", source: "live", visitor_id: "a", created_at: "2026-11-13T18:00:00Z" },
    { sponsor: "team-time", source: "site", visitor_id: "b", created_at: "2026-11-13T17:30:00Z" },
    { sponsor: "dundee", source: "live", visitor_id: "c", created_at: "2026-11-13T16:00:00Z" },
  ];
  const t = sumClicks(rows);
  assert.deepEqual(
    t.map((r) => [r.slug, r.clicks, r.people, r.live, r.site, r.lastAt]),
    [
      ["team-time", 3, 2, 2, 1, "2026-11-13T18:00:00Z"],
      ["dundee", 1, 1, 1, 0, "2026-11-13T16:00:00Z"],
      ["nelson", 0, 0, 0, 0, null],
    ]
  );
});
