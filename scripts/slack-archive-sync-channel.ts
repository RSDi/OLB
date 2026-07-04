/*
 * One-time full-history sync for a SINGLE Slack Channel Archive channel,
 * instead of looping every registered channel like
 * scripts/slack-archive-backfill.ts does.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/slack-archive-sync-channel.ts <slack-channel-id>
 *
 * Useful when one channel has fallen behind (e.g. the bot was locked out of
 * it — "not_in_channel" — until just now) and you don't want to wait for
 * every other registered channel to get its turn in the shared nightly
 * cron budget first. Reuses the same engine as the cron/backfill
 * (lib/slack-archive/sync.ts's syncOneChannel) — a local process has no
 * platform timeout, so with no deadline given it pages straight through to
 * `done: true` in one call, same as slack-archive-backfill.ts does per
 * channel.
 */

import { syncOneChannel } from "../lib/slack-archive/sync";

async function main() {
  const channelId = process.argv[2];
  if (!channelId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/slack-archive-sync-channel.ts <slack-channel-id>");
    process.exit(1);
  }

  console.log(`[slack-archive-sync-channel] syncing ${channelId}…`);
  const summary = await syncOneChannel(channelId);
  console.log(
    `[slack-archive-sync-channel] ${summary.new_or_updated} messages, ` +
      `${summary.threads_synced} threads, ${summary.files_stored} files stored, done=${summary.done}`,
  );
  if (summary.errors.length > 0) {
    console.error("[slack-archive-sync-channel] errors:", summary.errors);
    process.exit(1);
  }
  console.log("[slack-archive-sync-channel] complete.");
}

main().catch((err) => {
  console.error("[slack-archive-sync-channel] fatal:", err);
  process.exit(1);
});
