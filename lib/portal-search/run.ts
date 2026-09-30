// The search assistant's loop: the model looks things up with the tools
// (lib/portal-search/assistant.ts) for up to MAX_STEPS steps, then answers.
// What happens along the way goes to `send` for the page to show: each
// lookup, the sources found so far, the answer as it's written, and a
// clarifying question when the model asks one. Separate from the route so it
// can run against a mock model.

import { stepCountIs, streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
// Explicit extension so node --test can load this file.
import { stepLabel, type SourceRegistry } from "./query.ts";

export const MAX_STEPS = 6;

export interface AssistantRun {
  answer: string;
  clarified: boolean;
  steps: Array<{ tool: string; input: unknown }>;
  usage: { inputTokens?: number; outputTokens?: number };
}

export async function runAssistant({
  model,
  system,
  messages,
  tools,
  registry,
  send,
  signal,
}: {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  registry: SourceRegistry;
  send: (msg: unknown) => void;
  signal?: AbortSignal;
}): Promise<AssistantRun> {
  const run: AssistantRun = { answer: "", clarified: false, steps: [], usage: {} };
  const result = streamText({
    model,
    // Cached: the instructions are the same for every question.
    system: { role: "system", content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
    messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    // The last step must answer with what it has, not look up more.
    prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : {}),
    maxOutputTokens: 1500,
    abortSignal: signal,
  });

  let stepText = "";
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "start-step":
        stepText = "";
        break;
      case "text-delta":
        stepText += part.text;
        send({ type: "text", delta: part.text });
        break;
      case "tool-call":
        if (part.toolName === "ask_user") {
          const input = part.input as { question?: unknown; options?: unknown };
          run.clarified = true;
          send({
            type: "clarify",
            question: String(input.question ?? ""),
            options: (Array.isArray(input.options) ? input.options : []).map(String).slice(0, 5),
          });
        } else {
          run.steps.push({ tool: part.toolName, input: part.input });
          send({ type: "step", label: stepLabel(part.toolName, part.input) });
        }
        break;
      case "tool-result":
        send({ type: "sources", sources: registry.sources() });
        break;
      case "tool-error":
        console.error("[portal-search] tool failed", part.toolName, part.error);
        break;
      case "finish-step":
        // Text written before more lookups was a preamble, not the answer.
        if (part.finishReason === "tool-calls") {
          if (stepText.trim()) send({ type: "retract" });
        } else {
          run.answer = stepText;
        }
        break;
      case "finish":
        run.usage = { inputTokens: part.totalUsage.inputTokens, outputTokens: part.totalUsage.outputTokens };
        break;
      case "error":
        throw part.error;
    }
  }
  return run;
}
