// The Search log page (/portal/search/log): what became of each question in
// search_log (migration 0112), the period's totals, and the questions the
// assistant couldn't answer. Pure functions, so the unit tests can run them
// directly.

import { searchTerms, type SourceType } from "./query.ts";

export interface LogRow {
  id: string;
  created_at: string;
  question: string;
  follow_up: boolean;
  steps: Array<{ tool: string; input: unknown }> | null;
  cited: Array<{ type: string; id: string; title: string }> | null;
  sources: number;
  clarified: boolean;
  answered: boolean;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  error: string | null;
  member: { full_name: string | null } | null;
}

// answered:  an answer citing at least one record
// no_answer: an answer that cited nothing (it said it couldn't find it)
// clarified: it asked which one was meant
// limited:   past the per-minute limit; records only
// failed:    the AI answer failed; records only
export type Outcome = "answered" | "no_answer" | "clarified" | "limited" | "failed";

export function outcomeOf(r: Pick<LogRow, "answered" | "clarified" | "cited" | "error">): Outcome {
  if (r.clarified) return "clarified";
  if (r.error === "rate limited") return "limited";
  if (!r.answered) return "failed";
  return (r.cited?.length ?? 0) > 0 ? "answered" : "no_answer";
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  answered: "Answered",
  no_answer: "Couldn't answer",
  clarified: "Asked which one",
  limited: "Rate limited",
  failed: "AI failed",
};

// Dollars per million tokens, input / output, for the models the Search page
// has used. A model not listed here is left out of the cost estimate.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-5.5": { input: 2, output: 10 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
};

export function costOf(r: Pick<LogRow, "model" | "input_tokens" | "output_tokens">): number | null {
  const price = r.model ? MODEL_PRICES[r.model] : undefined;
  if (!price || (r.input_tokens == null && r.output_tokens == null)) return null;
  return ((r.input_tokens ?? 0) * price.input + (r.output_tokens ?? 0) * price.output) / 1_000_000;
}

export interface LogSummary {
  questions: number;
  followUps: number;
  people: number;
  byOutcome: Record<Outcome, number>;
  // Answered with a source, out of the questions the AI took on (rate-limited
  // ones aside).
  answeredRate: number | null;
  cost: number;
  costedQuestions: number;
  avgSeconds: number | null;
}

export function summarize(rows: LogRow[]): LogSummary {
  const byOutcome: Record<Outcome, number> = { answered: 0, no_answer: 0, clarified: 0, limited: 0, failed: 0 };
  let cost = 0;
  let costed = 0;
  let ms = 0;
  let timed = 0;
  const people = new Set<string>();
  for (const r of rows) {
    byOutcome[outcomeOf(r)]++;
    const c = costOf(r);
    if (c != null) {
      cost += c;
      costed++;
    }
    if (r.duration_ms != null) {
      ms += r.duration_ms;
      timed++;
    }
    if (r.member?.full_name) people.add(r.member.full_name);
  }
  const attempted = rows.length - byOutcome.limited;
  return {
    questions: rows.length,
    followUps: rows.filter((r) => r.follow_up).length,
    people: people.size,
    byOutcome,
    answeredRate: attempted > 0 ? byOutcome.answered / attempted : null,
    cost,
    costedQuestions: costed,
    avgSeconds: timed ? ms / timed / 1000 : null,
  };
}

// Two wordings of the same question ("Who orders the uniforms?", "who
// orders uniforms") share their search words.
const normalize = (q: string) => [...searchTerms(q)].sort().join(" ");

// The questions it couldn't answer, the same question asked more than once
// (in any wording with the same search words) counted together, most asked first, then most recent. What's missing from
// the portal: each is a playbook or a record worth writing.
export function gaps(rows: LogRow[], limit = 10): Array<{ question: string; times: number; last: string }> {
  const byQ = new Map<string, { question: string; times: number; last: string }>();
  for (const r of rows) {
    if (outcomeOf(r) !== "no_answer") continue;
    const key = normalize(r.question);
    if (!key) continue;
    const cur = byQ.get(key);
    if (cur) {
      cur.times++;
      if (r.created_at > cur.last) cur.last = r.created_at;
    } else {
      byQ.set(key, { question: r.question, times: 1, last: r.created_at });
    }
  }
  return [...byQ.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last)).slice(0, limit);
}

// Where a cited record opens. Slack messages aren't linked: the log keeps the
// message's id, not its channel.
export function citedHref(type: string, id: string): string | null {
  const t = type as SourceType;
  switch (t) {
    case "playbook": return `/portal/docs/${id}`;
    case "event": return `/portal/events/${id}/edit`;
    case "maintenance": return `/portal/tasks/${id}`;
    case "member": return `/portal/directory/${id}`;
    case "contact": return `/portal/contacts/${id}`;
    case "pm_task": return `/portal/pm/${id}`;
    case "pm_template": return `/portal/pm/templates/${id}/edit`;
    case "asset": return `/portal/pm/assets/${id}`;
    case "team": return `/portal/directory/teams/${id}`;
    case "schedule": return "/portal/schedule";
    default: return null;
  }
}

export type LogFilter = "all" | "no_answer" | "clarified" | "problems";

export function matchesFilter(r: LogRow, filter: LogFilter, text: string): boolean {
  const o = outcomeOf(r);
  if (filter === "no_answer" && o !== "no_answer") return false;
  if (filter === "clarified" && o !== "clarified") return false;
  if (filter === "problems" && o !== "failed" && o !== "limited") return false;
  const t = text.trim().toLowerCase();
  if (t && !r.question.toLowerCase().includes(t) && !(r.member?.full_name ?? "").toLowerCase().includes(t)) return false;
  return true;
}
