// Turns the <...> tokens in a Slack message's text into readable text for
// message_text: @-mentions, #-channel mentions, @here/@channel/@everyone,
// user-group mentions and links. Used by sync (lib/slack-archive/sync.ts),
// which supplies the lookups.
//
// Kept free of runtime imports so tests can load it straight from
// node --test.

import type { ChannelNameLookup } from "./slack-api";

export interface MentionLookups {
  resolveUserId(userId: string): Promise<{ author_name: string | null }>;
  resolveChannelName(channelId: string): Promise<ChannelNameLookup>;
}

// What a channel mention reads as when Slack sent it without the channel's
// name and looking it up failed. repairChannelNames in sync.ts looks for it
// to try again on a later sync, so it matches what sync always wrote for
// such a mention before it looked names up.
export const UNNAMED_CHANNEL = "#channel";
// A channel the bot can't see: a private one it isn't in, or one since
// deleted. Slack shows these as "private channel" too.
export const PRIVATE_CHANNEL = "#private-channel";

// Names get spliced into message_text, which SlackText renders with Slack's
// formatting rules (lib/slack-archive/mrkdwn.ts) — escape characters that
// would otherwise be misparsed (e.g. a literal underscore in "David_Orrick"
// reading as italics).
export function escapeMarkdown(s: string): string {
  return s.replace(/([_*`[\]])/g, "\\$1");
}

// Resolves each token to readable text (mentions via the caller's cached
// lookups — no extra API calls for anyone already seen this run) or a
// [label](url) link, so raw Slack wire syntax never leaks into the archive.
// Dedupes tokens first and resolves concurrently, then does one synchronous
// replace pass — String.replace has no async replacer, and a naive
// per-token replace in a loop would only touch the first occurrence of a
// mention repeated in the same message.
export async function resolveMentions(text: string, lookups: MentionLookups): Promise<string> {
  const tokens = [...new Set([...text.matchAll(/<([^<>]+)>/g)].map((m) => m[0]))];
  if (tokens.length === 0) return text;

  const entries = await Promise.all(
    tokens.map(async (full): Promise<[string, string]> => {
      const inner = full.slice(1, -1);
      const pipeIdx = inner.indexOf("|");
      const head = pipeIdx === -1 ? inner : inner.slice(0, pipeIdx);
      const label = pipeIdx === -1 ? undefined : inner.slice(pipeIdx + 1);

      if (head.startsWith("@")) {
        const info = await lookups.resolveUserId(head.slice(1));
        return [full, `@${escapeMarkdown(info.author_name ?? label ?? "someone")}`];
      }
      if (head.startsWith("#")) {
        // Slack often sends a channel mention with no name (<#C123> or
        // <#C123|>), so look it up. A name it does send is kept as sent.
        if (label) return [full, `#${escapeMarkdown(label)}`];
        const found = await lookups.resolveChannelName(head.slice(1));
        if ("name" in found) return [full, `#${escapeMarkdown(found.name)}`];
        return [full, "hidden" in found ? PRIVATE_CHANNEL : UNNAMED_CHANNEL];
      }
      if (head === "!here") return [full, "@here"];
      if (head === "!channel") return [full, "@channel"];
      if (head === "!everyone") return [full, "@everyone"];
      if (head.startsWith("!subteam^")) {
        // Slack's subteam label already includes the leading "@" (unlike
        // channel/user fallback labels, which don't) — avoid doubling it.
        const teamLabel = label ?? "@team";
        return [full, escapeMarkdown(teamLabel.startsWith("@") ? teamLabel : `@${teamLabel}`)];
      }
      if (head.startsWith("http://") || head.startsWith("https://")) {
        return [full, label ? `[${escapeMarkdown(label)}](${head})` : head];
      }
      return [full, label ?? head]; // unrecognized token — best-effort, strip the brackets
    }),
  );

  const replacements = new Map(entries);
  return text.replace(/<([^<>]+)>/g, (full) => replacements.get(full) ?? full);
}

// A channel mention Slack sent without the channel's name. The same pattern
// in Postgres regex syntax is what the repair's query filters on.
const UNNAMED_CHANNEL_MENTION = /<#[A-Z0-9]+\|?>/;
export const UNNAMED_CHANNEL_MENTION_SQL = "<#[A-Z0-9]+[|]?>";

// What an unnamed mention was saved as before names were looked up:
// "#channel" for <#C123>, and a bare "#" for <#C123|>.
const UNNAMED_CHANNEL_TEXT = /#channel(?![\p{L}\p{N}_-])|#(?![\p{L}\p{N}_\\-])/u;

// Whether a saved message may still show a channel mention without its
// name: its original text has one, and its saved text still reads the old
// way. Text that already shows the names needs no Slack call to rule out.
export function mayNeedChannelNames(rawText: string, messageText: string): boolean {
  return UNNAMED_CHANNEL_MENTION.test(rawText) && UNNAMED_CHANNEL_TEXT.test(messageText);
}
