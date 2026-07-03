/*
 * One-time full-history backfill for a Slack Channel Archive channel.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/slack-archive-backfill.ts
 *
 * Register the channel first via the /portal/slack-archive UI (super-admin
 * only), then run this to pull its entire history in one go. Reuses the
 * exact same engine as the nightly cron (lib/slack-archive/sync.ts) — the
 * only difference is this has no time budget, since a local process has no
 * platform timeout, so it runs a single sync pass straight to completion
 * instead of the cron's bounded, resumable-across-invocations style.
 */

import { syncAllActiveChannels } from "../lib/slack-archive/sync";

async function main() {
  console.log("[slack-archive-backfill] starting full sync of all active channels…");
  const summary = await syncAllActiveChannels({});
  for (const c of summary.channels) {
    console.log(
      `[slack-archive-backfill] ${c.channel}: ${c.new_or_updated} messages, ` +
        `${c.threads_synced} threads, ${c.files_stored} files stored, done=${c.done}`,
    );
    if (c.errors.length > 0) {
      console.error(`[slack-archive-backfill] ${c.channel} errors:`, c.errors);
    }
  }
  console.log("[slack-archive-backfill] complete.");
}

main().catch((err) => {
  console.error("[slack-archive-backfill] fatal:", err);
  process.exit(1);
});
