// The Search log page's arithmetic (lib/portal-search/log-stats.ts): what
// became of each question, the period's totals and cost, and the questions
// the assistant couldn't answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citedHref, costOf, gaps, matchesFilter, outcomeOf, summarize, type LogRow } from "../../lib/portal-search/log-stats.ts";

let n = 0;
const row = (over: Partial<LogRow>): LogRow => ({
  id: String(++n),
  created_at: `2026-10-01T0${n % 10}:00:00Z`,
  question: "When is practice?",
  follow_up: false,
  steps: [],
  cited: [{ type: "team", id: "t1", title: "12U" }],
  sources: 1,
  clarified: false,
  answered: true,
  duration_ms: 4000,
  input_tokens: 20_000,
  output_tokens: 1000,
  model: "anthropic/claude-sonnet-5.5",
  error: null,
  member: { full_name: "Pat Smith" },
  ...over,
});

test("outcomeOf sorts each question into what happened", () => {
  assert.equal(outcomeOf(row({})), "answered");
  assert.equal(outcomeOf(row({ cited: [] })), "no_answer");
  assert.equal(outcomeOf(row({ clarified: true, cited: [] })), "clarified");
  assert.equal(outcomeOf(row({ answered: false, error: "rate limited" })), "limited");
  assert.equal(outcomeOf(row({ answered: false, error: "gateway timeout" })), "failed");
});

test("costOf prices tokens by model, and skips models it doesn't know", () => {
  // 20k in at $2/M + 1k out at $10/M = 4¢ + 1¢.
  assert.equal(costOf(row({})), 0.05);
  assert.equal(costOf(row({ model: "someone/else" })), null);
  assert.equal(costOf(row({ input_tokens: null, output_tokens: null })), null);
});

test("summarize totals the period", () => {
  const s = summarize([
    row({}),
    row({ follow_up: true, member: { full_name: "Lee Jones" } }),
    row({ cited: [] }),
    row({ answered: false, error: "rate limited", model: null, input_tokens: null, output_tokens: null, duration_ms: 1000 }),
  ]);
  assert.equal(s.questions, 4);
  assert.equal(s.followUps, 1);
  assert.equal(s.people, 2);
  assert.deepEqual(s.byOutcome, { answered: 2, no_answer: 1, clarified: 0, limited: 1, failed: 0 });
  // Rate-limited questions aren't counted against the answer rate.
  assert.equal(s.answeredRate, 2 / 3);
  assert.equal(Math.round(s.cost * 100) / 100, 0.15);
  assert.equal(s.costedQuestions, 3);
  assert.equal(s.avgSeconds, 3.25);
  assert.equal(summarize([]).answeredRate, null);
});

test("gaps groups the same unanswered question, most asked first", () => {
  const g = gaps([
    row({ question: "Who orders uniforms?", cited: [], created_at: "2026-09-01T00:00:00Z" }),
    row({ question: "who orders the uniforms", cited: [], created_at: "2026-09-03T00:00:00Z" }),
    row({ question: "Uniforms: who orders them?", cited: [], created_at: "2026-09-02T00:00:00Z" }),
    row({ question: "Where is the gym key?", cited: [], created_at: "2026-09-05T00:00:00Z" }),
    row({ question: "When is practice?" }),
  ]);
  assert.deepEqual(g.map((x) => [x.question, x.times]), [["Who orders uniforms?", 3], ["Where is the gym key?", 1]]);
  assert.equal(g[0].last, "2026-09-03T00:00:00Z");
});

test("citedHref opens each kind of record, but not a bare Slack message", () => {
  assert.equal(citedHref("playbook", "p1"), "/portal/docs/p1");
  assert.equal(citedHref("maintenance", "t1"), "/portal/tasks/t1");
  assert.equal(citedHref("team", "x"), "/portal/directory/teams/x");
  assert.equal(citedHref("slack", "m1"), null);
});

test("matchesFilter narrows by outcome and by question or name", () => {
  const ok = row({});
  const gap = row({ cited: [], question: "Gym key?" });
  const failed = row({ answered: false, error: "boom" });
  assert.ok(matchesFilter(ok, "all", ""));
  assert.ok(!matchesFilter(ok, "no_answer", ""));
  assert.ok(matchesFilter(gap, "no_answer", "gym"));
  assert.ok(matchesFilter(failed, "problems", ""));
  assert.ok(matchesFilter(ok, "all", "pat"));
  assert.ok(!matchesFilter(ok, "all", "uniform"));
});
