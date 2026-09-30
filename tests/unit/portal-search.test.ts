// The portal's /portal/search page (lib/portal-search/query.ts): turning a
// question into search words, merging what each word finds, and numbering
// the top records for the AI answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerContext, mergeHits, searchTerms, type TermHits } from "../../lib/portal-search/query.ts";
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

test("answerContext numbers records and falls back to the result's own text", () => {
  const hits = mergeHits([{ term: "x", whole: false, hits: [hit("member", "m1", "Pat Smith"), hit("slack", "s1", "See you at practice")] }]);
  const texts = new Map([["member:m1", "Name: Pat Smith\nPhone: 555-0100"]]);
  const { sources, context } = answerContext(hits, texts);
  assert.deepEqual(sources.map((s) => [s.n, s.entity_type]), [[1, "member"], [2, "slack"]]);
  assert.match(context, /^\[1\] Member: Pat Smith\nName: Pat Smith\nPhone: 555-0100/);
  assert.match(context, /\[2\] Slack message: See you at practice\nSee you at practice/);
});

test("answerContext stays within its budget", () => {
  const many = Array.from({ length: 20 }, (_, i) => hit("playbook", `p${i}`, `Playbook ${i}`));
  const texts = new Map(many.map((h) => [`playbook:${h.id}`, "x".repeat(5000)]));
  const { sources, context } = answerContext(mergeHits([{ term: "p", whole: false, hits: many }]), texts, { budget: 10_000 });
  assert.ok(sources.length >= 1 && sources.length < 12);
  assert.ok(context.length <= 10_000 + 3100);
});
