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
  fetchConversationsHistory,
  fetchConversationsReplies,
  fetchSlackUserInfo,
  type SlackMessage,
} from "./slack-api";
import { downloadAndStoreSlackFile } from "./files";

export interface ChannelSyncSummary {
  channel: string;
  new_or_updated: number;
  threads_synced: number;
  files_stored: number;
  errors: string[];
  done: boolean;
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
    if (msg.user) {
      const cached = this.cache.get(msg.user);
      if (cached) return cached;
      const promise = this.lookup(msg.user);
      this.cache.set(msg.user, promise);
      return promise;
    }
    if (msg.bot_id) {
      const botName = (msg as { username?: string }).username ?? "Bot";
      return Promise.resolve({ author_slack_id: null, author_member_id: null, author_name: botName });
    }
    return Promise.resolve({ author_slack_id: null, author_member_id: null, author_name: null });
  }

  private async lookup(userId: string): Promise<AuthorInfo> {
    const { email, name } = await fetchSlackUserInfo(userId, this.token);
    let memberId: string | null = null;
    if (email) {
      const { data, error } = await this.admin
        .from("members")
        .select("id")
        .ilike("email", email)
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
  const [author, files] = await Promise.all([
    resolver.resolve(msg),
    Promise.all((msg.files ?? []).map((f) => downloadAndStoreSlackFile(admin, f, channelId, msg.ts, token))),
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
      message_text: msg.text ?? "",
      reactions: msg.reactions ?? [],
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

// Re-checks every thread this channel has ever archived for replies newer
// than the newest one already stored, using each thread's own cursor — so a
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

  for (const [parentTs, latestTs] of latestKnownByParent) {
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

export async function syncArchiveChannel(
  admin: SupabaseClient,
  channelId: string,
  token: string,
  resolver: AuthorResolver,
  deadlineAt: number,
): Promise<ChannelSyncSummary> {
  const summary: ChannelSyncSummary = {
    channel: channelId,
    new_or_updated: 0,
    threads_synced: 0,
    files_stored: 0,
    errors: [],
    done: false,
  };

  const { data: stateRow } = await admin
    .from("slack_archive_sync_state")
    .select("last_ts")
    .eq("channel_id", channelId)
    .maybeSingle();
  const watermark = (stateRow as { last_ts: string | null } | null)?.last_ts ?? undefined;

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
    await refreshKnownThreads(admin, channelId, token, resolver, summary, deadlineAt);

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

// Loops every active registered channel, sharing one deadline and one author
// cache across all of them. What both the cron and the backfill script call.
export async function syncAllActiveChannels(opts: { deadlineMs?: number } = {}): Promise<ArchiveSyncSummary> {
  const token = process.env.SLACK_BOT_TOKEN;
  const admin = createAdminClient();
  const deadlineAt = Date.now() + (opts.deadlineMs ?? Number.MAX_SAFE_INTEGER);

  const summary: ArchiveSyncSummary = { timestamp: new Date().toISOString(), channels: [] };
  if (!token) {
    summary.channels.push({
      channel: "(none)",
      new_or_updated: 0,
      threads_synced: 0,
      files_stored: 0,
      errors: ["SLACK_BOT_TOKEN not set"],
      done: false,
    });
    return summary;
  }

  const { data: channelRows } = await admin
    .from("slack_archive_channels")
    .select("slack_channel_id")
    .eq("active", true);
  const channels = ((channelRows as { slack_channel_id: string }[] | null) ?? []).map((c) => c.slack_channel_id);

  const resolver = new AuthorResolver(admin, token);
  for (const channelId of channels) {
    if (Date.now() >= deadlineAt) {
      summary.channels.push({
        channel: channelId,
        new_or_updated: 0,
        threads_synced: 0,
        files_stored: 0,
        errors: [],
        done: false,
      });
      continue;
    }
    const result = await syncArchiveChannel(admin, channelId, token, resolver, deadlineAt);
    summary.channels.push(result);
  }

  return summary;
}
