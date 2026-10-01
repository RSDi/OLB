// The search assistant's loop (lib/portal-search/run.ts) against a mock
// model: lookups become progress lines, text written before more lookups is
// retracted, a clarifying question ends the turn, and the last step can't
// look anything more up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tool } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";
import { SourceRegistry } from "../../lib/portal-search/query.ts";
import { MAX_STEPS, runAssistant } from "../../lib/portal-search/run.ts";

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const finish = (unified: "stop" | "tool-calls") => ({ type: "finish" as const, finishReason: { unified, raw: unified }, usage });
const text = (id: string, s: string) => [
  { type: "text-start" as const, id },
  { type: "text-delta" as const, id, delta: s },
  { type: "text-end" as const, id },
];
const call = (toolName: string, input: unknown, id = "c1") => ({
  type: "tool-call" as const,
  toolCallId: id,
  toolName,
  input: JSON.stringify(input),
});

// A model that plays back one scripted step per call, and records what each
// call was allowed to do.
function scripted(steps: unknown[][]) {
  const toolChoices: unknown[] = [];
  let i = 0;
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      toolChoices.push(options.toolChoice);
      const chunks = steps[Math.min(i++, steps.length - 1)];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
  return { model, toolChoices, calls: () => i };
}

function tools(registry: SourceRegistry) {
  return {
    search_portal: tool({
      description: "search",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const n = registry.add({ entity_type: "playbook", id: "p1", title: `Playbook about ${query}`, href: "/portal/docs/p1", text: "Arrive at 8am." });
        return [{ source: n, text: "Arrive at 8am." }];
      },
    }),
    ask_user: tool({
      description: "ask",
      inputSchema: z.object({ question: z.string(), options: z.array(z.string()) }),
    }),
  };
}

test("a lookup, then an answer that cites it", async () => {
  const registry = new SourceRegistry();
  const sent: Array<Record<string, unknown>> = [];
  const { model } = scripted([
    [...text("t0", "Let me check."), call("search_portal", { query: "game day" }), finish("tool-calls")],
    [...text("t1", "Arrive at 8am [1]."), finish("stop")],
  ]);
  const run = await runAssistant({
    model,
    system: "sys",
    messages: [{ role: "user", content: "When do we arrive?" }],
    tools: tools(registry),
    registry,
    send: (m) => sent.push(m as Record<string, unknown>),
  });
  assert.equal(run.answer, "Arrive at 8am [1].");
  assert.equal(run.clarified, false);
  assert.deepEqual(run.steps, [{ tool: "search_portal", input: { query: "game day" } }]);
  const types = sent.map((m) => m.type);
  // The preamble streams, then is taken back when its step ends in a lookup.
  assert.deepEqual(types, ["text", "step", "sources", "retract", "text"]);
  assert.equal(sent[1].label, "Searching for “game day”");
  assert.equal((sent[2].sources as unknown[]).length, 1);
  assert.equal(registry.cited(run.answer)[0].id, "p1");
  assert.equal(run.usage.inputTokens, 200);
});

test("a clarifying question ends the turn without an answer", async () => {
  const registry = new SourceRegistry();
  const sent: Array<Record<string, unknown>> = [];
  const { model, calls } = scripted([
    [call("ask_user", { question: "Which team?", options: ["10U", "12U"] }), finish("tool-calls")],
    [...text("t1", "should never run"), finish("stop")],
  ]);
  const run = await runAssistant({
    model,
    system: "sys",
    messages: [{ role: "user", content: "When is practice?" }],
    tools: tools(registry),
    registry,
    send: (m) => sent.push(m as Record<string, unknown>),
  });
  assert.equal(calls(), 1);
  assert.equal(run.clarified, true);
  assert.equal(run.answer, "");
  assert.deepEqual(sent, [{ type: "clarify", question: "Which team?", options: ["10U", "12U"] }]);
});

test("the last step isn't allowed to look anything more up", async () => {
  const registry = new SourceRegistry();
  const { model, toolChoices } = scripted([
    ...Array.from({ length: MAX_STEPS - 1 }, (_, i) => [call("search_portal", { query: `try ${i}` }, `c${i}`), finish("tool-calls")]),
    [...text("t", "Couldn't find it."), finish("stop")],
  ]);
  const run = await runAssistant({
    model,
    system: "sys",
    messages: [{ role: "user", content: "?" }],
    tools: tools(registry),
    registry,
    send: () => {},
  });
  assert.equal(toolChoices.length, MAX_STEPS);
  assert.deepEqual(toolChoices[MAX_STEPS - 1], { type: "none" });
  assert.notDeepEqual(toolChoices[0], { type: "none" });
  assert.equal(run.answer, "Couldn't find it.");
  assert.equal(run.steps.length, MAX_STEPS - 1);
});
