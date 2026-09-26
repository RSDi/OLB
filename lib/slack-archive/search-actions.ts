"use server";

// Server action wrapping searchArchiveMessages for the interactive search
// page's client component. Open to any approved member: RLS on
// slack_archive_messages (migration 0084) limits every query here to the
// channels the viewer may see, so a private channel's messages, authors,
// and counts never reach someone outside it. The gate below is the
// defense-in-depth check for the action call itself.

import { getViewer } from "../auth/viewer";
import {
  canViewArchive,
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
  if (!canViewArchive(viewer)) return { results: [], error: "Your account isn\'t approved to view the archive." };

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
  if (!canViewArchive(viewer)) return { authors: [], error: "Your account isn\'t approved to view the archive." };

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
  if (!canViewArchive(viewer)) return { channels: [], error: "Your account isn\'t approved to view the archive." };

  const { channels, error } = await loadArchiveChannelCounts({ query, authors });
  if (error) return { channels: [], error };
  return { channels };
}
