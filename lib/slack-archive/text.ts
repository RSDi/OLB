// Slack HTML-escapes &, <, and > in message text on the wire (`&amp;`,
// `&lt;`, `&gt;`) so its own <...> control tokens stay unambiguous. Sync
// resolves those tokens away (lib/slack-archive/sync.ts) but stores the
// entity escapes as-is, so decoding happens once, at render — which also
// covers every message archived before this existed. `&amp;` goes last so
// a literal "&lt;" typed by a user (wire form "&amp;lt;") round-trips back
// to "&lt;" instead of over-decoding to "<".
export function decodeSlackEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
