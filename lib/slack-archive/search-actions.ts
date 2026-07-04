"use server";

// Server action wrapping searchArchiveMessages for the interactive search
// page's client component. Super-admin gate mirrors channel-actions.ts —
// RLS on slack_archive_messages (migration 0077) already scopes reads to
// is_super_admin(), this is the defense-in-depth check for the action call
// itself.

import { getViewer } from "../auth/viewer";
import {
  loadArchiveAuthorCounts,
  loadArchiveChannelCounts,
  loadArchiveChannels,
  searchArchiveMessages,
  type ArchiveAuthor,
  type ArchiveChannelCount,
  type ArchiveSearchResult,
} from "./data";

export interface ArchiveSearchActionResult {
  results: ArchiveSearchResult[];
  error?: string;
}

export async function runArchiveSearch(
  authors: string[],
  query: string,
  channelIds: string[] = [],
): Promise<ArchiveSearchActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { results: [], error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { results: [], error: "Super-admin access required." };

  const channels = await loadArchiveChannels();
  const { results, error } = await searchArchiveMessages(channels, { authors, query, channelIds });
  if (error) return { results: [], error };
  return { results };
}

export interface ArchiveAuthorsActionResult {
  authors: ArchiveAuthor[];
  error?: string;
}

// Narrows "Filter by user" by whatever's currently selected in the OTHER
// facets (channels, text query) — never by the user's own selection.
export async function runArchiveAuthorCounts(
  query: string,
  channelIds: string[] = [],
): Promise<ArchiveAuthorsActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { authors: [], error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { authors: [], error: "Super-admin access required." };

  const { authors, error } = await loadArchiveAuthorCounts({ query, channelIds });
  if (error) return { authors: [], error };
  return { authors };
}

export interface ArchiveChannelCountsActionResult {
  channels: ArchiveChannelCount[];
  error?: string;
}

// Narrows "Filter by channel" by whatever's currently selected in the OTHER
// facets (authors, text query) — never by the channel's own selection.
export async function runArchiveChannelCounts(
  query: string,
  authors: string[] = [],
): Promise<ArchiveChannelCountsActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { channels: [], error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { channels: [], error: "Super-admin access required." };

  const { channels, error } = await loadArchiveChannelCounts({ query, authors });
  if (error) return { channels: [], error };
  return { channels };
}
