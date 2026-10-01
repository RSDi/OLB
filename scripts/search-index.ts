/*
 * Builds or catches up the Search page's search-by-meaning index in one go.
 *
 * Usage:
 *   npm run search-index
 *
 * Run it once after applying migration 0113 (which queues every existing
 * record). After that the index keeps itself current: searches and the
 * nightly cron work through whatever changed. Needs SUPABASE_SERVICE_ROLE_KEY
 * and AI_GATEWAY_API_KEY in .env.local (on Vercel the gateway signs in by
 * itself). Same engine as the cron (lib/portal-search/indexer.ts), without
 * its time limit. Safe to stop and run again.
 */

import { processIndexQueue } from "../lib/portal-search/indexer";

async function main() {
  let total = { processed: 0, removed: 0, embedded: 0 };
  for (;;) {
    const run = await processIndexQueue({ deadlineMs: 60_000 });
    total = {
      processed: total.processed + run.processed,
      removed: total.removed + run.removed,
      embedded: total.embedded + run.embedded,
    };
    console.log(
      `[search-index] ${total.processed} records indexed (${total.embedded} chunks embedded, ${total.removed} removed)`,
    );
    if (run.errors.length) {
      console.error("[search-index] stopped:", run.errors.join("; "));
      process.exit(1);
    }
    if (!run.more) break;
  }
  console.log("[search-index] up to date.");
}

main().catch((err) => {
  console.error("[search-index] fatal:", err);
  process.exit(1);
});
