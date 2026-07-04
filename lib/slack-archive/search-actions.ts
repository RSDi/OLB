"use server";

// Server action wrapping searchArchiveMessages for the interactive search
// page's client component. Super-admin gate mirrors channel-actions.ts —
// RLS on slack_archive_messages (migration 0077) already scopes reads to
// is_super_admin(), this is the defense-in-depth check for the action call
// itself.

import { getViewer } from "../auth/viewer";
import { loadArchiveChannels, searchArchiveMessages, type ArchiveSearchResult } from "./data";

export interface ArchiveSearchActionResult {
  results: ArchiveSearchResult[];
  error?: string;
}

export async function runArchiveSearch(
  authors: string[],
  query: string,
): Promise<ArchiveSearchActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { results: [], error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { results: [], error: "Super-admin access required." };

  const channels = await loadArchiveChannels();
  const { results, error } = await searchArchiveMessages(channels, { authors, query });
  if (error) return { results: [], error };
  return { results };
}
