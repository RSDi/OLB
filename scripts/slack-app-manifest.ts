/*
 * Prints the Slack app manifest for this site (see lib/slack/app-manifest.ts),
 * ready to paste into api.slack.com/apps → Create New App → From a manifest.
 *
 * Usage:
 *   npm run slack-app-manifest -- --name Sparky --site-url https://portal.example.org
 *
 * --site-url defaults to NEXT_PUBLIC_SITE_URL and --supabase-url to
 * NEXT_PUBLIC_SUPABASE_URL, both from .env.local. Pass the production site
 * URL when .env.local points at localhost: Slack has to reach it.
 */

import { parseArgs } from "node:util";
import { buildSlackAppManifest } from "../lib/slack/app-manifest";

const USAGE =
  "Usage: npm run slack-app-manifest -- --name <App name> [--site-url https://…] [--supabase-url https://….supabase.co]";

function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      "site-url": { type: "string" },
      "supabase-url": { type: "string" },
    },
  });

  const name = values.name;
  const siteUrl = values["site-url"] ?? process.env.NEXT_PUBLIC_SITE_URL;
  const supabaseUrl = values["supabase-url"] ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const missing = [
    !name && "--name",
    !siteUrl && "--site-url (or NEXT_PUBLIC_SITE_URL)",
    !supabaseUrl && "--supabase-url (or NEXT_PUBLIC_SUPABASE_URL)",
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(`[slack-app-manifest] missing ${missing.join(", ")}.\n${USAGE}`);
    process.exit(1);
  }

  const manifest = buildSlackAppManifest({ name: name!, siteUrl: siteUrl!, supabaseUrl: supabaseUrl! });
  console.log(JSON.stringify(manifest, null, 2));
  console.error(
    [
      "",
      "[slack-app-manifest] Next:",
      "  1. api.slack.com/apps → Create New App → From a manifest → pick the workspace → paste the JSON above.",
      "  2. Basic Information → Display Information: upload the app icon (square, 512–2000px).",
      "  3. Basic Information → App Credentials: Signing Secret → SLACK_SIGNING_SECRET; Client ID + Secret →",
      "     Supabase → Authentication → Providers → Slack (OIDC), and SLACK_CLIENT_ID + SLACK_CLIENT_SECRET (Slack DMs).",
      "  4. Redeploy, then verify the Events Request URL (App Manifest or Event Subscriptions page).",
      "  5. Install to Workspace → Bot User OAuth Token → SLACK_BOT_TOKEN. Invite the bot to each channel it posts in or archives.",
    ].join("\n"),
  );
}

try {
  main();
} catch (err) {
  console.error(`[slack-app-manifest] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
