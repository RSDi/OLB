// The portal's /portal/search page (lib/portal-search/query.ts): turning a
// question into search words, merging what each word finds, numbering the
// records an answer can cite, and the progress lines the page shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHits, searchTerms, SourceRegistry, stepLabel, stripCitations, type TermHits } from "../../lib/portal-search/query.ts";
import type { SearchHit } from "../../lib/search/useGlobalSearch.ts";

const hit = (entity_type: SearchHit["entity_type"], id: string, title: string, rank = 0.1): SearchHit => ({
  entity_type, id, title, subtitle: null, href: `/portal/x/${id}`, rank,
});

test("searchTerms keeps the words worth searching for", () => {
  assert.deepEqual(searchTerms("Who fixes the gym lights?"), ["light", "fix", "gym"]);
  assert.deepEqual(searchTerms("When is the next 10u tournament?"), ["tournament", "next", "10u"]);
  assert.deepEqual(searchTerms("what is it"), []);
  // Each word once, however it's spelled.
  assert.deepEqual(searchTerms("Practices practice PRACTICE"), ["practice"]);
  assert.ok(searchTerms("a b c d e f g h i j k l m n o p q r s t uniform jersey shorts socks shoes bags balls").length <= 6);
});

test("mergeHits ranks records found by more of the words first", () => {
  const lists: TermHits[] = [
    { term: "gym", whole: false, hits: [hit("playbook", "p1", "Gym setup"), hit("event", "e1", "Gym night", 0.9)] },
    { term: "light", whole: false, hits: [hit("playbook", "p1", "Gym setup")] },
  ];
  const merged = mergeHits(lists);
  assert.deepEqual(merged.map((h) => h.id), ["p1", "e1"]);
  assert.deepEqual(merged[0].matched.sort(), ["gym", "light"]);
});

test("a word-for-word match of the whole question counts extra", () => {
  const merged = mergeHits([
    { term: "game day plan", whole: true, hits: [hit("playbook", "p2", "Game day plan")] },
    { term: "game", whole: false, hits: [hit("event", "e2", "Game"), hit("playbook", "p2", "Game day plan")] },
    { term: "plan", whole: false, hits: [hit("event", "e2", "Game")] },
  ]);
  assert.equal(merged[0].id, "p2");
});

test("SourceRegistry numbers each record once, in the order it's found", () => {
  const reg = new SourceRegistry();
  const a = reg.add({ entity_type: "playbook", id: "p1", title: "Game day", href: "/portal/docs/p1", text: "short" });
  const b = reg.add({ entity_type: "event", id: "e1", title: "Tournament", href: "/portal/events/e1/edit", text: "Sat" });
  const again = reg.add({ entity_type: "playbook", id: "p1", title: "Game day", href: "/portal/docs/p1", text: "a longer full text" });
  assert.deepEqual([a, b, again], [1, 2, 1]);
  // The longer text wins, so a full record replaces a search snippet.
  assert.equal(reg.get(1)?.text, "a longer full text");
  assert.deepEqual(reg.sources().map((s) => [s.n, s.entity_type]), [[1, "playbook"], [2, "event"]]);
  assert.equal(reg.get(3), undefined);
});

test("SourceRegistry.cited lists what an answer cites, in order, once each", () => {
  const reg = new SourceRegistry();
  reg.add({ entity_type: "playbook", id: "p1", title: "Game day", href: "/x", text: "t" });
  reg.add({ entity_type: "team", id: "t1", title: "12U Black", href: "/y", text: "t" });
  const cited = reg.cited("Arrive at 8am [2]. Bring water [1][2]. Parking is free [9].");
  assert.deepEqual(cited.map((c) => [c.n, c.id]), [[2, "t1"], [1, "p1"]]);
});

test("SourceRegistry caps a record's text", () => {
  const reg = new SourceRegistry();
  reg.add({ entity_type: "playbook", id: "p1", title: "Long", href: "/x", text: "x".repeat(20_000) });
  assert.ok((reg.get(1)?.text.length ?? 0) <= 8_002);
});

test("stripCitations drops an earlier answer's [n] markers", () => {
  assert.equal(stripCitations("Practice is Tuesday [1]. Games on Saturday [2][3]."), "Practice is Tuesday. Games on Saturday.");
});

test("stepLabel describes each lookup in plain words", () => {
  assert.equal(stepLabel("search_portal", { query: "uniform order" }), "Searching for “uniform order”");
  assert.equal(stepLabel("schedule", { from: "2026-10-03", to: "2026-10-04", team: "12U" }), "Checking the calendar, Oct 3 – Oct 4 (12U)");
  assert.equal(stepLabel("team", { name: "10U" }), "Looking up the 10U team");
  assert.equal(stepLabel("tasks", { filter: "overdue" }), "Checking overdue tasks");
  assert.equal(stepLabel("get_record", { source: 2 }), "Reading source 2");
  assert.equal(stepLabel("something_new", {}), "Looking something up");
});
