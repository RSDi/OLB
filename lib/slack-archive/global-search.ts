// Slack messages in the portal's global search: the "Slack" group under the
// search box (lib/search/useGlobalSearch.ts). Part of the siloed Slack
// archive: removing the archive means deleting this file, its one call in
// useGlobalSearch, and the archive_search_global function (migration 0092).
//
// Runs in the browser as the signed-in user, so RLS limits the messages to
// the channels that person can see (migration 0084).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchHit } from "../search/useGlobalSearch";
import { CHURCH_TZ } from "../dates/today";
import { messageSnippet } from "./text";

const RESULT_LIMIT = 5; // search_global also shows at most five per group

interface ArchiveSearchRow {
  id: string;
  channel_id: string;
  channel_label: string | null;
  ts: string;
  author_name: string | null;
  message_text: string;
  posted_at: string;
  rank: number;
}

const POSTED_ON = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: CHURCH_TZ,
});

// Never throws: if this fails (say, before migration 0092 is applied) the
// Slack group is just missing and the rest of the results still show.
export async function searchArchiveForGlobalSearch(
  supabase: SupabaseClient,
  query: string,
  signal: AbortSignal,
): Promise<SearchHit[]> {
  try {
    const { data, error } = await supabase
      .rpc("archive_search_global", { p_query: query, p_limit: RESULT_LIMIT })
      .abortSignal(signal);
    if (error) {
      if (!signal.aborted) console.error("[global-search] Slack archive search failed", error);
      return [];
    }
    return ((data ?? []) as ArchiveSearchRow[]).map((row) => ({
      entity_type: "slack",
      id: row.id,
      title: messageSnippet(row.message_text, query),
      subtitle: [row.channel_label ?? row.channel_id, row.author_name, POSTED_ON.format(new Date(row.posted_at))]
        .filter(Boolean)
        .join(" · "),
      // Same link as the archive's own search results.
      href: `/portal/slack-archive/${encodeURIComponent(row.channel_id)}#msg-${row.ts}`,
      rank: row.rank,
    }));
  } catch (err) {
    if (!signal.aborted) console.error("[global-search] Slack archive search failed", err);
    return [];
  }
}
