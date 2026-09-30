// Writes the Search page's question log (search_log, migration 0112).
// Server-only: it uses the service-role client, since members can't write
// the table themselves. Never throws: a failed write goes to the server log
// and the answer the member already has is unaffected. Before 0112 is
// applied every write fails that way, and search works as normal.

import { createAdminClient } from "../supabase/admin";

export interface SearchLogEntry {
  memberId: string;
  question: string;
  followUp: boolean;
  steps: Array<{ tool: string; input: unknown }>;
  cited: Array<{ type: string; id: string; title: string }>;
  sources: number;
  clarified: boolean;
  answered: boolean;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  error?: string;
}

export async function logSearch(e: SearchLogEntry): Promise<void> {
  try {
    const { error } = await createAdminClient().from("search_log").insert({
      member_id: e.memberId,
      question: e.question.slice(0, 500),
      follow_up: e.followUp,
      steps: e.steps,
      cited: e.cited,
      sources: e.sources,
      clarified: e.clarified,
      answered: e.answered,
      duration_ms: Math.round(e.durationMs),
      input_tokens: e.inputTokens ?? null,
      output_tokens: e.outputTokens ?? null,
      model: e.model ?? null,
      error: e.error?.slice(0, 500) ?? null,
    });
    if (error) console.error("[portal-search] writing search_log failed", error);
  } catch (err) {
    console.error("[portal-search] writing search_log failed", err);
  }
}
