/*
 * Re-checks every archived channel's Slack privacy and membership, without
 * syncing any messages — the same thing the "Refresh access" button on
 * /portal/slack-archive does, minus its time limit.
 *
 * Usage:
 *   npm run slack-archive-refresh-access
 *
 * Run once after adding the channels:read and groups:read bot scopes (see
 * migration 0084): until a channel's privacy has been confirmed with Slack,
 * only super admins can see it. After that the nightly sync keeps access
 * current on its own.
 */

import { refreshAllChannelAccess } from "../lib/slack-archive/sync";

async function main() {
  console.log("[slack-archive-refresh-access] checking every channel's privacy and membership…");
  const results = await refreshAllChannelAccess();
  let failed = 0;
  for (const r of results) {
    if (r.error) {
      failed += 1;
      console.error(`[slack-archive-refresh-access] ${r.channel}: FAILED — ${r.error}`);
    } else {
      console.log(`[slack-archive-refresh-access] ${r.channel}: ok`);
    }
  }
  console.log(`[slack-archive-refresh-access] done: ${results.length - failed} ok, ${failed} failed.`);
  if (failed > 0) {
    console.error(
      "[slack-archive-refresh-access] channels that failed stay visible to super admins only. " +
        "\"missing_scope\" means the Slack bot needs channels:read and groups:read (then reinstall the app).",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[slack-archive-refresh-access] fatal:", err);
  process.exit(1);
});
