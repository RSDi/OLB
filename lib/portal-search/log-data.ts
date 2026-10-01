// Reads the Search page's question log (search_log, migration 0112) for the
// Search log page. Runs with the member's own session: the table's policy
// lets super-admins read it and nobody else.

import { createClient } from "../supabase/server";
import type { LogRow } from "./log-stats";

// Questions from the last `days` days, newest first, with who asked.
export async function loadSearchLog(days: number): Promise<{ rows: LogRow[]; error: string | null }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("search_log")
    .select("id, created_at, question, follow_up, steps, cited, sources, clarified, answered, duration_ms, input_tokens, output_tokens, model, error, member:members(full_name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  return { rows: (data ?? []) as unknown as LogRow[], error: error?.message ?? null };
}
