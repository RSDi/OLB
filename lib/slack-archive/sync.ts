// Core sync engine for the Slack Channel Archive.
//
// conversations.history returns messages newest-first, so a single sync
// pass pages ALL the way back to the channel's stored high-water mark
// (`sync_state.last_ts`) before persisting a new one. Advancing the
// watermark after only some pages would create a silent gap if the run
// were interrupted between them — Slack's ordering makes it unsafe to
// assume "newest page done" means "everything since the old watermark is
// captured." Individual message upserts along the way are cheap to repeat
// (onConflict), so a run that hits its time budget mid-walk just leaves the
// watermark untouched and redoes the same range next time.
//
// The watermark only catches messages POSTED after it — it says nothing
// about older threads getting new replies (a very normal way a committee
// channel keeps evolving). refreshKnownThreads() closes that gap by
// re-checking every thread this channel has ever seen, using each thread's
// own latest-known-reply ts as its cursor, so it stays cheap (Slack returns
// nothing new on an inactive thread) rather than re-walking full history.
// It deliberately does NOT attempt to catch edits/reactions added to old,
// non-thread messages after their sync — that would require periodically
// re-walking the entire channel, defeating the point of an incremental
// watermark. Accepted trade-off, same spirit as other documented
// known-limitations in this repo's migrations (e.g. 0031's orphaned files).
//
// Used by both the nightly cron (bounded deadlineMs, to fit Vercel's
// maxDuration) and the local one-time backfill script (effectively
// unbounded — a local process has no platform timeout).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import {
  fetchChannelIsPrivate,
  fetchChannelMemberIds,
  fetchConversationsHistory,
  fetchConversationsReplies,
  fetchSlackUserInfo,
  type SlackMessage,
  type SlackReaction,
} from "./slack-api";
import { downloadAndStoreSlackFile } from "./files";

export interface ChannelSyncSummary {
  channel: string;
  new_or_updated: number;
  threads_synced: number;
  files_stored: number;
  errors: string[];
  done: boolean;
  // Why the privacy/membership check failed, if it did. Kept apart from
  // `errors` on purpose: a failed access check leaves the last confirmed
  // access in place (fail closed) and doesn't make the message sync itself
  // a failure.
  access_error?: string;
}

export interface ArchiveSyncSummary {
  timestamp: string;
  channels: ChannelSyncSummary[];
}

interface AuthorInfo {
  author_slack_id: string | null;
  author_member_id: string | null;
  author_name: string | null;
}

// Cache Slack user lookups + member matches across an entire sync run
// (potentially many channels) to avoid repeat users.info calls for the same
// person. Caches the in-flight Promise (not just the resolved value) so
// concurrent resolve() calls for the same not-yet-seen user — expected now
// that messages within a page process in parallel — share one lookup
// instead of racing duplicate ones.
class AuthorResolver {
  private cache = new Map<string, Promise<AuthorInfo>>();
  constructor(
    private admin: SupabaseClient,
    private token: string,
  ) {}

  resolve(msg: SlackMessage): Promise<AuthorInfo> {
    if (msg.user) return this.resolveUserId(msg.user);
    if (msg.bot_id) {
      const botName = (msg as { username?: string }).username ?? "Bot";
      return Promise.resolve({ author_slack_id: null, author_member_id: null, author_name: botName });
    }
    return Promise.resolve({ author_slack_id: null, author_member_id: null, author_name: null });
  }

  // Exposed separately from resolve() so reaction users — raw Slack IDs with
  // no enclosing message — can share the same cache and users.info/member
  // lookup as message authors, instead of a second resolution path.
  resolveUserId(userId: string): Promise<AuthorInfo> {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    const promise = this.lookup(userId);
    this.cache.set(userId, promise);
    return promise;
  }

  private async lookup(userId: string): Promise<AuthorInfo> {
    const { email, name } = await fetchSlackUserInfo(userId, this.token);
    let memberId: string | null = null;
    if (email) {
      // ilike for case-insensitivity only: escape LIKE's wildcards so an
      // address like "j_smith@…" can't match "jxsmith@…". This match now
      // grants private-channel access (see refreshChannelAccess), not just
      // an author name.
      const { data, error } = await this.admin
        .from("members")
        .select("id")
        .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
        .is("deleted_at", null)
        .maybeSingle();
      if (error) console.error(`[slack-archive] member lookup failed for ${email}:`, error.message);
      memberId = (data as { id: string } | null)?.id ?? null;
    }
    return { author_slack_id: userId, author_member_id: memberId, author_name: name };
  }
}

function tsToDate(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString();
}

// Inverse of tsToDate — Slack ts format is seconds (with microsecond
// precision) as a string, e.g. "1712345678.123456".
function dateToTs(ms: number): string {
  return (ms / 1000).toFixed(6);
}

export interface StoredReactionUser {
  slack_id: string;
  name: string | null;
}

export interface StoredReaction {
  name: string;
  count: number;
  users: StoredReactionUser[];
}

// Slack hands back reactions as raw user IDs; resolve each to a display name
// via the same cached AuthorResolver used for message authors, so this adds
// no extra API calls for anyone who's already posted in the channel.
async function resolveReactions(
  reactions: SlackReaction[] | undefined,
  resolver: AuthorResolver,
): Promise<StoredReaction[]> {
  if (!reactions?.length) return [];
  return Promise.all(
    reactions.map(async (r) => ({
      name: r.name,
      count: r.count,
      users: await Promise.all(
        r.users.map(async (id) => {
          const info = await resolver.resolveUserId(id);
          return { slack_id: id, name: info.author_name };
        }),
      ),
    })),
  );
}

// Names get spliced into message_text, which MarkdownView renders as
// Markdown — escape characters that would otherwise be misparsed (e.g. a
// literal underscore in "David_Orrick" reading as italics).
function escapeMarkdown(s: string): string {
  return s.replace(/([_*`[\]])/g, "\\$1");
}

// Slack's mrkdwn encodes @-mentions, #-channel mentions, @here/@channel/
// @everyone, user-group mentions, and links as <...> tokens. Resolves each
// to readable text (mentions via the same cached AuthorResolver used for
// authors/reactions — no extra API calls for anyone already seen this run)
// or real Markdown (links), so raw Slack wire syntax never leaks into the
// archive. Dedupes tokens first and resolves concurrently, then does one
// synchronous replace pass — String.replace has no async replacer, and a
// naive per-token replace in a loop would only touch the first occurrence
// of a mention repeated in the same message.
async function resolveMentions(text: string, resolver: AuthorResolver): Promise<string> {
  const tokens = [...new Set([...text.matchAll(/<([^<>]+)>/g)].map((m) => m[0]))];
  if (tokens.length === 0) return text;

  const entries = await Promise.all(
    tokens.map(async (full): Promise<[string, string]> => {
      const inner = full.slice(1, -1);
      const pipeIdx = inner.indexOf("|");
      const head = pipeIdx === -1 ? inner : inner.slice(0, pipeIdx);
      const label = pipeIdx === -1 ? undefined : inner.slice(pipeIdx + 1);

      if (head.startsWith("@")) {
        const info = await resolver.resolveUserId(head.slice(1));
        return [full, `@${escapeMarkdown(info.author_name ?? label ?? "someone")}`];
      }
      if (head.startsWith("#")) return [full, `#${escapeMarkdown(label ?? "channel")}`];
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

// Resolves the author, downloads any file attachments (concurrently — each
// is an independent Slack fetch + Storage upload), and upserts the row.
// Shared by top-level messages, thread replies, and thread-refresh replies
// so a future change to any of that logic only needs to happen once.
async function persistMessage(
  admin: SupabaseClient,
  channelId: string,
  msg: SlackMessage,
  token: string,
  resolver: AuthorResolver,
  summary: ChannelSyncSummary,
): Promise<void> {
  const [author, files, reactions, messageText] = await Promise.all([
    resolver.resolve(msg),
    Promise.all((msg.files ?? []).map((f) => downloadAndStoreSlackFile(admin, f, channelId, msg.ts, token))),
    resolveReactions(msg.reactions, resolver),
    resolveMentions(msg.text ?? "", resolver),
  ]);
  summary.files_stored += files.filter((f) => f.storage_path).length;

  const { error } = await admin.from("slack_archive_messages").upsert(
    {
      channel_id: channelId,
      ts: msg.ts,
      thread_ts: msg.thread_ts ?? null,
      author_slack_id: author.author_slack_id,
      author_member_id: author.author_member_id,
      author_name: author.author_name,
      message_text: messageText,
      reactions,
      files,
      raw: msg,
      edited: Boolean(msg.edited),
      posted_at: tsToDate(msg.ts),
    },
    { onConflict: "channel_id,ts" },
  );
  if (error) throw new Error(`upsert failed for ts=${msg.ts}: ${error.message}`);
  summary.new_or_updated += 1;
}

async function fetchAllReplies(
  channelId: string,
  threadTs: string,
  token: string,
  oldest: string | undefined,
): Promise<SlackMessage[]> {
  const all: SlackMessage[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchConversationsReplies(channelId, threadTs, token, cursor, oldest);
    all.push(...page.messages);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

async function processMessage(
  admin: SupabaseClient,
  channelId: string,
  msg: SlackMessage,
  token: string,
  resolver: AuthorResolver,
  summary: ChannelSyncSummary,
): Promise<void> {
  await persistMessage(admin, channelId, msg, token, resolver, summary);

  if ((msg.reply_count ?? 0) > 0 && msg.thread_ts === msg.ts) {
    const replies = await fetchAllReplies(channelId, msg.ts, token, undefined);
    await Promise.all(replies.map((reply) => persistMessage(admin, channelId, reply, token, resolver, summary)));
    summary.threads_synced += 1;
  }
}

// Threads whose latest known activity is older than this are skipped by the
// refresh below. Checking every thread a channel has ever had — one Slack
// call each, against a ~50/min rate limit — is what starved the nightly
// cron: building-comittee alone has 150+ threads, more than the whole 50s
// budget could get through, so no channel after it ever got a turn. A
// months-quiet thread essentially never gets a new reply; one that does
// revive is still caught by the next "Sync now" (a full re-walk refetches
// every thread's replies).
const THREAD_REFRESH_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// Re-checks this channel's recently-active threads for replies newer than
// the newest one already stored, using each thread's own cursor — so a
// thread with no new activity costs one cheap Slack call, not a full re-walk.
async function refreshKnownThreads(
  admin: SupabaseClient,
  channelId: string,
  token: string,
  resolver: AuthorResolver,
  summary: ChannelSyncSummary,
  deadlineAt: number,
): Promise<void> {
  const { data, error } = await admin
    .from("slack_archive_messages")
    .select("ts, thread_ts")
    .eq("channel_id", channelId)
    .not("thread_ts", "is", null);
  if (error) {
    summary.errors.push(`thread refresh lookup failed: ${error.message}`);
    return;
  }

  const rows = (data ?? []) as { ts: string; thread_ts: string }[];
  const latestKnownByParent = new Map<string, string>();
  for (const r of rows) {
    if (r.thread_ts === r.ts) {
      if (!latestKnownByParent.has(r.ts)) latestKnownByParent.set(r.ts, r.ts);
    } else {
      const current = latestKnownByParent.get(r.thread_ts);
      if (!current || r.ts > current) latestKnownByParent.set(r.thread_ts, r.ts);
    }
  }

  const cutoffTs = (Date.now() - THREAD_REFRESH_LOOKBACK_MS) / 1000;
  for (const [parentTs, latestTs] of latestKnownByParent) {
    if (parseFloat(latestTs) < cutoffTs) continue;
    if (Date.now() >= deadlineAt) return; // rest picked up on a later run
    try {
      const newReplies = await fetchAllReplies(channelId, parentTs, token, latestTs);
      if (newReplies.length > 0) {
        await Promise.all(newReplies.map((r) => persistMessage(admin, channelId, r, token, resolver, summary)));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`thread refresh failed for ${parentTs}: ${message}`);
    }
  }
}

// Mirrors one channel's Slack privacy and (for private channels) Slack
// membership into slack_archive_channels / slack_archive_channel_members —
// what migration 0084's RLS reads to decide who can see the channel's
// messages and photos. Runs at the start of every sync (cron, "Sync now",
// backfill) and from the "Refresh access" button.
//
// Fail closed at every step. Nothing is written unless Slack answered, so a
// failed check (most likely missing_scope: public channels need
// channels:read, private ones groups:read) keeps the last confirmed state —
// and a never-confirmed channel stays hidden from everyone but super admins.
// Slack members whose email doesn't match a portal member (or who are bots)
// simply get no access. Returns the failure message, or null on success.
async function refreshChannelAccess(
  admin: SupabaseClient,
  channelId: string,
  token: string,
  resolver: AuthorResolver,
): Promise<string | null> {
  const recordError = async (message: string) => {
    console.warn(`[slack-archive] access check failed for ${channelId}: ${message}`);
    await admin
      .from("slack_archive_channels")
      .update({ access_error: message, access_checked_at: new Date().toISOString() })
      .eq("slack_channel_id", channelId);
    return message;
  };

  try {
    const isPrivate = await fetchChannelIsPrivate(channelId, token);

    let memberIds: string[] = [];
    if (isPrivate) {
      const slackUserIds = await fetchChannelMemberIds(channelId, token);
      const resolved = await Promise.all(slackUserIds.map((id) => resolver.resolveUserId(id)));
      memberIds = [...new Set(resolved.flatMap((r) => (r.author_member_id ? [r.author_member_id] : [])))];
    }

    // Order matters for failing closed: when a channel turns private, flip
    // the flag first (briefly hiding it from everyone) and then grant its
    // members; never the other way round, which would briefly expose it.
    const { error: flagErr } = await admin
      .from("slack_archive_channels")
      .update({ is_private: isPrivate, access_checked_at: new Date().toISOString(), access_error: null })
      .eq("slack_channel_id", channelId);
    if (flagErr) return await recordError(`saving privacy failed: ${flagErr.message}`);

    // Revoke first, then grant, so a failure part-way through errs on the
    // side of too little access rather than too much.
    let revoke = admin.from("slack_archive_channel_members").delete().eq("channel_id", channelId);
    if (memberIds.length > 0) revoke = revoke.not("member_id", "in", `(${memberIds.join(",")})`);
    const { error: revokeErr } = await revoke;
    if (revokeErr) return await recordError(`removing old members failed: ${revokeErr.message}`);

    if (memberIds.length > 0) {
      const { error: grantErr } = await admin
        .from("slack_archive_channel_members")
        .upsert(
          memberIds.map((memberId) => ({ channel_id: channelId, member_id: memberId })),
          { onConflict: "channel_id,member_id", ignoreDuplicates: true },
        );
      if (grantErr) return await recordError(`saving members failed: ${grantErr.message}`);
    }
    return null;
  } catch (err) {
    return await recordError(err instanceof Error ? err.message : String(err));
  }
}

export async function syncArchiveChannel(
  admin: SupabaseClient,
  channelId: string,
  token: string,
  resolver: AuthorResolver,
  deadlineAt: number,
  // Omitted (default): read the stored high-water mark, same as ever — what
  // the one-time backfill scripts want (full history the first time, then
  // incremental). `null`: ignore the stored watermark and walk full history
  // regardless — what the "Sync now" button forces, so a super admin always
  // has a "re-fetch and overwrite everything for this channel" escape hatch
  // rather than trusting the watermark math. A string: use it as a fixed
  // cutoff instead of the stored watermark — what the nightly cron passes
  // (a rolling 24h window) so a corrupted/stuck watermark can never leave
  // the archive silently frozen the way it did here.
  //
  // `refreshThreads: false` skips the thread-reply refresh after the walk —
  // the cron does that as its own separate pass across every channel (see
  // syncAllActiveChannels) rather than letting one channel's refresh eat
  // the budget before the next channel's new messages are even fetched.
  opts: { oldest?: string | null; refreshThreads?: boolean } = {},
): Promise<ChannelSyncSummary> {
  const summary: ChannelSyncSummary = {
    channel: channelId,
    new_or_updated: 0,
    threads_synced: 0,
    files_stored: 0,
    errors: [],
    done: false,
  };

  // Access first: it's a few cheap calls, and a membership change (someone
  // leaving #building-committee) should take effect even on a run whose
  // message walk later runs out of time.
  const accessError = await refreshChannelAccess(admin, channelId, token, resolver);
  if (accessError) summary.access_error = accessError;

  let watermark: string | undefined;
  if ("oldest" in opts) {
    watermark = opts.oldest ?? undefined;
  } else {
    const { data: stateRow } = await admin
      .from("slack_archive_sync_state")
      .select("last_ts")
      .eq("channel_id", channelId)
      .maybeSingle();
    watermark = (stateRow as { last_ts: string | null } | null)?.last_ts ?? undefined;
  }

  let newWatermark: string | null = null;
  let cursor: string | undefined;

  try {
    do {
      if (Date.now() >= deadlineAt) {
        // Out of time mid-walk — leave the watermark untouched so the next
        // run repeats this range rather than risking a gap.
        summary.done = false;
        return summary;
      }

      const page = await fetchConversationsHistory(channelId, token, { oldest: watermark, cursor });
      if (newWatermark === null && page.messages.length > 0) {
        newWatermark = page.messages[0].ts; // newest-first: first page's first message is the new high-water mark
      }
      await Promise.all(page.messages.map((msg) => processMessage(admin, channelId, msg, token, resolver, summary)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    summary.done = true;

    // New messages take priority; spend any remaining budget catching up
    // replies on threads that predate this run's watermark. Best-effort —
    // failures here don't downgrade the otherwise-successful sync below.
    // Pointless after a full-history walk (watermark undefined): every
    // thread's replies were just refetched by processMessage anyway.
    if (opts.refreshThreads !== false && watermark !== undefined) {
      await refreshKnownThreads(admin, channelId, token, resolver, summary, deadlineAt);
    }

    const { error: stateErr } = await admin.from("slack_archive_sync_state").upsert(
      {
        channel_id: channelId,
        last_ts: newWatermark ?? watermark ?? null,
        last_run_at: new Date().toISOString(),
        last_status: "ok",
        last_error: null,
      },
      { onConflict: "channel_id" },
    );
    if (stateErr) summary.errors.push(`sync_state update failed: ${stateErr.message}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push(message);
    await admin.from("slack_archive_sync_state").upsert(
      {
        channel_id: channelId,
        last_run_at: new Date().toISOString(),
        last_status: "error",
        last_error: message,
      },
      { onConflict: "channel_id" },
    );
  }

  return summary;
}

// Syncs exactly one channel, regardless of its `active` flag or position in
// the registry — what the per-channel "Sync now" button and the single-
// channel backfill script call, so a channel that's competing with 20
// others for one shared nightly time budget can be caught up on demand
// without waiting on every other channel's turn first (see
// syncAllActiveChannels below, which shares one deadline across ALL
// channels and always processes them in the same order — a channel late in
// that order can go starved indefinitely if the ones ahead of it are slow).
export async function syncOneChannel(
  channelId: string,
  opts: { deadlineMs?: number; force?: boolean } = {},
): Promise<ChannelSyncSummary> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { channel: channelId, new_or_updated: 0, threads_synced: 0, files_stored: 0, errors: ["SLACK_BOT_TOKEN not set"], done: false };
  }
  const admin = createAdminClient();
  const deadlineAt = Date.now() + (opts.deadlineMs ?? Number.MAX_SAFE_INTEGER);
  const resolver = new AuthorResolver(admin, token);
  return syncArchiveChannel(admin, channelId, token, resolver, deadlineAt, opts.force ? { oldest: null } : {});
}

export interface AccessRefreshResult {
  channel: string;
  error: string | null; // null = refreshed; "skipped: out of time" when the deadline hit first
}

// Re-checks privacy + membership for every registered channel — including
// deactivated ones, whose history is still browsable — without syncing any
// messages. What the channel list's "Refresh access" button and
// scripts/slack-archive-refresh-access.ts call, so a membership change in
// Slack can take effect right away instead of at the next nightly sync.
export async function refreshAllChannelAccess(opts: { deadlineMs?: number } = {}): Promise<AccessRefreshResult[]> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return [{ channel: "(none)", error: "SLACK_BOT_TOKEN not set" }];
  const admin = createAdminClient();
  const deadlineAt = Date.now() + (opts.deadlineMs ?? Number.MAX_SAFE_INTEGER);

  const { data, error } = await admin
    .from("slack_archive_channels")
    .select("slack_channel_id")
    .order("created_at", { ascending: true });
  if (error) return [{ channel: "(none)", error: `channel lookup failed: ${error.message}` }];

  const resolver = new AuthorResolver(admin, token);
  const results: AccessRefreshResult[] = [];
  for (const { slack_channel_id: channel } of (data ?? []) as { slack_channel_id: string }[]) {
    if (Date.now() >= deadlineAt) {
      results.push({ channel, error: "skipped: out of time" });
      continue;
    }
    results.push({ channel, error: await refreshChannelAccess(admin, channel, token, resolver) });
  }
  return results;
}

function skippedSummary(channelId: string): ChannelSyncSummary {
  return { channel: channelId, new_or_updated: 0, threads_synced: 0, files_stored: 0, errors: [], done: false };
}

// Loops every active registered channel, sharing one deadline and one author
// cache across all of them. What both the cron and the backfill script call.
//
// Cron mode (`windowMs` given — a fixed rolling lookback, ignoring each
// channel's stored watermark so a corrupted/stuck one can never leave a
// channel silently frozen) runs in two passes so one slow channel can't
// starve the rest, which is exactly what used to happen: one shared 50s
// budget, channels always in registration order, and the first channel's
// thread refresh alone (150+ Slack calls against a ~50/min rate limit) ate
// nearly all of it, so channels 3–10 were skipped every single night.
//   1. New messages for EVERY channel first — cheap (a 24h window is a page
//      or two each) and the part that actually matters nightly.
//   2. Thread-reply refresh with whatever budget is left, best-effort.
// Both passes start from a position that rotates daily, so even a pass
// that can't finish gives a different channel first dibs each night
// instead of the same tail channels always losing out.
//
// Backfill mode (`windowMs` omitted) is unchanged: each channel does its
// normal from-the-watermark-or-full-history pull, thread refresh included,
// in registry order — a local process has no time budget to ration.
export async function syncAllActiveChannels(opts: { deadlineMs?: number; windowMs?: number } = {}): Promise<ArchiveSyncSummary> {
  const token = process.env.SLACK_BOT_TOKEN;
  const admin = createAdminClient();
  const deadlineAt = Date.now() + (opts.deadlineMs ?? Number.MAX_SAFE_INTEGER);

  const summary: ArchiveSyncSummary = { timestamp: new Date().toISOString(), channels: [] };
  if (!token) {
    summary.channels.push({ ...skippedSummary("(none)"), errors: ["SLACK_BOT_TOKEN not set"] });
    return summary;
  }

  const { data: channelRows } = await admin
    .from("slack_archive_channels")
    .select("slack_channel_id")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const registered = ((channelRows as { slack_channel_id: string }[] | null) ?? []).map((c) => c.slack_channel_id);
  const resolver = new AuthorResolver(admin, token);

  if (opts.windowMs === undefined) {
    for (const channelId of registered) {
      if (Date.now() >= deadlineAt) {
        summary.channels.push(skippedSummary(channelId));
        continue;
      }
      summary.channels.push(await syncArchiveChannel(admin, channelId, token, resolver, deadlineAt));
    }
    return summary;
  }

  // Stateless daily rotation: the cron fires once a night, so the day
  // number advances the start position by one each run without needing to
  // persist a cursor anywhere.
  const startIdx = registered.length > 0 ? Math.floor(Date.now() / 86_400_000) % registered.length : 0;
  const channels = [...registered.slice(startIdx), ...registered.slice(0, startIdx)];
  const oldest = dateToTs(Date.now() - opts.windowMs);

  const byChannel = new Map<string, ChannelSyncSummary>();
  for (const channelId of channels) {
    const result =
      Date.now() >= deadlineAt
        ? skippedSummary(channelId)
        : await syncArchiveChannel(admin, channelId, token, resolver, deadlineAt, { oldest, refreshThreads: false });
    byChannel.set(channelId, result);
  }

  for (const channelId of channels) {
    if (Date.now() >= deadlineAt) break;
    const s = byChannel.get(channelId)!;
    // A channel whose own sync failed (e.g. bot not in channel) would just
    // fail once more per thread here — skip it rather than flood its errors.
    if (!s.done || s.errors.length > 0) continue;
    await refreshKnownThreads(admin, channelId, token, resolver, s, deadlineAt);
  }

  // Report in registry order regardless of tonight's rotation, so the cron
  // response reads the same way as the channel list page.
  for (const channelId of registered) summary.channels.push(byChannel.get(channelId)!);
  return summary;
}
