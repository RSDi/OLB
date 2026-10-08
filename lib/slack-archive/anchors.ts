// Links to one archived message: the channel page plus "#msg-<ts>", which
// MessageList scrolls to and highlights. Used by the channel page's "copy
// link", the photo album's "View in conversation", and search results.
//
// Free of imports so tests can load it straight from node --test.

export function messageAnchorId(ts: string): string {
  return `msg-${ts}`;
}

export function messageHref(channelId: string, ts: string): string {
  return `/portal/slack-archive/${encodeURIComponent(channelId)}#${messageAnchorId(ts)}`;
}

// The message a URL hash points at ("#msg-1695321234.123456"), or null.
// Reads the last "#msg-" in it: after a page opened at one message link,
// Next's router appends the next same-page link's hash to the old one
// ("#msg-A#msg-B").
export function messageTsFromHash(hash: string): string | null {
  const match = /(?:^|#)msg-(\d+\.\d+)$/.exec(hash);
  return match ? match[1] : null;
}
