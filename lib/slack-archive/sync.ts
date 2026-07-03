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
import { downloadAndStoreSlackFile, type ArchivedFile } from "./files";

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
// person.
class AuthorResolver {
  private cache = new Map<string, AuthorInfo>();
  constructor(
    private admin: SupabaseClient,
    private token: string,
  ) {}

  async resolve(msg: SlackMessage): Promise<AuthorInfo> {
    if (msg.user) {
      const cached = this.cache.get(msg.user);
      if (cached) return cached;

      const { email, name } = await fetchSlackUserInfo(msg.user, this.token);
      let memberId: string | null = null;
      if (email) {
        const { data } = await this.admin
          .from("members")
          .select("id")
          .ilike("email", email)
          .is("deleted_at", null)
          .maybeSingle();
        memberId = (data as { id: string } | null)?.id ?? null;
      }
      const info: AuthorInfo = { author_slack_id: msg.user, author_member_id: memberId, author_name: name };
      this.cache.set(msg.user, info);
      return info;
    }
    if (msg.bot_id) {
      const botName = (msg as { username?: string }).username ?? "Bot";
      return { author_slack_id: null, author_member_id: null, author_name: botName };
    }
    return { author_slack_id: null, author_member_id: null, author_name: null };
  }
}

function tsToDate(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString();
}

async function upsertMessage(
  admin: SupabaseClient,
  channelId: string,
  msg: SlackMessage,
  author: AuthorInfo,
  files: ArchivedFile[],
): Promise<void> {
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
}

async function processMessage(
  admin: SupabaseClient,
  channelId: string,
  msg: SlackMessage,
  token: string,
  resolver: AuthorResolver,
  summary: ChannelSyncSummary,
): Promise<void> {
  const author = await resolver.resolve(msg);
  const files: ArchivedFile[] = [];
  for (const f of msg.files ?? []) {
    const stored = await downloadAndStoreSlackFile(admin, f, channelId, msg.ts, token);
    files.push(stored);
    if (stored.storage_path) summary.files_stored += 1;
  }
  await upsertMessage(admin, channelId, msg, author, files);
  summary.new_or_updated += 1;

  if ((msg.reply_count ?? 0) > 0 && msg.thread_ts === msg.ts) {
    let cursor: string | undefined;
    do {
      const page = await fetchConversationsReplies(channelId, msg.ts, token, cursor);
      for (const reply of page.messages) {
        const replyAuthor = await resolver.resolve(reply);
        const replyFiles: ArchivedFile[] = [];
        for (const f of reply.files ?? []) {
          const stored = await downloadAndStoreSlackFile(admin, f, channelId, reply.ts, token);
          replyFiles.push(stored);
          if (stored.storage_path) summary.files_stored += 1;
        }
        await upsertMessage(admin, channelId, reply, replyAuthor, replyFiles);
        summary.new_or_updated += 1;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    summary.threads_synced += 1;
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
      for (const msg of page.messages) {
        await processMessage(admin, channelId, msg, token, resolver, summary);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    summary.done = true;
    await admin.from("slack_archive_sync_state").upsert(
      {
        channel_id: channelId,
        last_ts: newWatermark ?? watermark ?? null,
        last_run_at: new Date().toISOString(),
        last_status: "ok",
        last_error: null,
      },
      { onConflict: "channel_id" },
    );
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
