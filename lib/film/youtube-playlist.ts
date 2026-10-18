// YouTube Data API playlist list + playlistItems.insert. Needs the `youtube`
// OAuth scope (youtube.upload cannot insert into a playlist).

import type { YoutubeChannelPlaylist } from "./youtube-meta.ts";

const PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";
const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

export async function listYoutubeChannelPlaylists(accessToken: string): Promise<YoutubeChannelPlaylist[]> {
  const out: YoutubeChannelPlaylist[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 4; i++) {
    const url = new URL(PLAYLISTS_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = (await res.json().catch(() => ({}))) as {
      items?: { id?: string; snippet?: { title?: string } }[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message || "Couldn't list YouTube playlists. Connect YouTube again after adding the YouTube scope.");
    }
    for (const item of json.items ?? []) {
      if (item.id) out.push({ id: item.id, title: item.snippet?.title?.trim() || item.id });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export async function insertYoutubePlaylistItem(
  accessToken: string,
  playlistId: string,
  videoId: string
): Promise<{ itemId: string | null; already: boolean }> {
  const res = await fetch(`${PLAYLIST_ITEMS_URL}?part=snippet,id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; errors?: { reason?: string }[] };
  };
  if (res.ok) return { itemId: json.id ?? null, already: false };
  const reason = json.error?.errors?.[0]?.reason ?? "";
  if (reason === "playlistItemDuplicate" || /already exists|duplicate/i.test(json.error?.message ?? "")) {
    return { itemId: null, already: true };
  }
  if (res.status === 401 || reason === "youtubeSignupRequired") {
    throw new Error("YouTube login expired or is missing the playlist permission. Disconnect and Connect YouTube again.");
  }
  if (res.status === 403 && /insufficient|scope/i.test(json.error?.message ?? "")) {
    throw new Error("YouTube refused the playlist add. Add the YouTube scope on the consent screen, then Connect again.");
  }
  throw new Error(json.error?.message || `YouTube playlist returned ${res.status}.`);
}
