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
// A private channel, to anyone who may not be in it; Slack shows those
// people "private channel" too. Also a channel the bot can't see at all
// (a private one it isn't in, or one since deleted).
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
// `inChannel` is the channel the message was posted in.
// Dedupes tokens first and resolves concurrently, then does one synchronous
// replace pass — String.replace has no async replacer, and a naive
// per-token replace in a loop would only touch the first occurrence of a
// mention repeated in the same message.
export async function resolveMentions(text: string, lookups: MentionLookups, inChannel: string): Promise<string> {
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
        // Named the way Slack shows it: by the channel's current name (Slack
        // often sends no name at all, <#C123> or <#C123|>), except that a
        // private channel reads "private channel" to anyone not in it. The
        // archive can't tell who's reading, so a private channel is named
        // only in its own messages, which only its members can open. The
        // name Slack sent, if any, is the fallback when the lookup fails.
        const channelId = head.slice(1);
        const found = await lookups.resolveChannelName(channelId);
        if ("name" in found) {
          return [full, found.isPrivate && channelId !== inChannel ? PRIVATE_CHANNEL : `#${escapeMarkdown(found.name)}`];
        }
        if ("hidden" in found) return [full, PRIVATE_CHANNEL];
        return [full, label ? `#${escapeMarkdown(label)}` : UNNAMED_CHANNEL];
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
      if (head.startsWith("mailto:")) {
        return [full, `[${escapeMarkdown(label ?? head.slice("mailto:".length))}](${head})`];
      }
      return [full, label ?? head]; // unrecognized token — best-effort, strip the brackets
    }),
  );

  const replacements = new Map(entries);
  return text.replace(/<([^<>]+)>/g, (full) => replacements.get(full) ?? full);
}

// A channel mention Slack sent without the channel's name, in Postgres
// regex syntax: what the repair's query filters on.
export const UNNAMED_CHANNEL_MENTION_SQL = "<#[A-Z0-9]+[|]?>";

// Before names were looked up, <#C123> was saved as "#channel" and <#C123|>
// as a bare "#".
const NO_NAME = /<#[A-Z0-9]+>/;
const EMPTY_NAME = /<#[A-Z0-9]+\|>/;
const SAVED_AS_CHANNEL = /#channel(?![\p{L}\p{N}_-])/u;
const SAVED_AS_BARE = /#(?![\p{L}\p{N}_\\-])/u;

const SOMEONE = /@someone(?![\p{L}\p{N}_])/gu;
const countSomeone = (t: string) => t.match(SOMEONE)?.length ?? 0;

// The saved text a message should have now that channel names are looked
// up, re-read from its original text; null to leave it as it is. Never
// makes a message read worse: null when one of its channel lookups failed
// (it would read "#channel" again, to be tried on a later sync) or when a
// person's name came back missing (it would read "@someone" where the saved
// text has their name), and when nothing changed.
export async function repairedMessageText(
  rawText: string,
  savedText: string,
  lookups: MentionLookups,
  inChannel: string,
): Promise<string | null> {
  let lookupFailed = false;
  const text = await resolveMentions(
    rawText,
    {
      resolveUserId: (id) => lookups.resolveUserId(id),
      resolveChannelName: async (id) => {
        const found = await lookups.resolveChannelName(id);
        if ("failed" in found) lookupFailed = true;
        return found;
      },
    },
    inChannel,
  );
  if (lookupFailed || text === savedText || countSomeone(text) > countSomeone(savedText)) return null;
  return text;
}

// Whether a saved message may still show a channel mention without its
// name: its original text has one, and its saved text still reads the way
// that kind was saved. Text that already shows the names needs no Slack
// call to rule out.
export function mayNeedChannelNames(rawText: string, messageText: string): boolean {
  return (
    (NO_NAME.test(rawText) && SAVED_AS_CHANNEL.test(messageText)) ||
    (EMPTY_NAME.test(rawText) && SAVED_AS_BARE.test(messageText))
  );
}
