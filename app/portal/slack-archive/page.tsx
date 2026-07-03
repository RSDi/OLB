// Slack Channel Archive — channel registry. Super-admin only (see
// lib/slack-archive/data.ts's loadArchiveViewer). A siloed feature: see
// supabase/migrations/0077_slack_archive.sql for the removal plan.

import { loadArchiveViewer, loadArchiveChannels } from "../../../lib/slack-archive/data";
import { ChannelsPanel } from "./ChannelsPanel";

export default async function SlackArchivePage() {
  await loadArchiveViewer();
  const channels = await loadArchiveChannels();

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", marginBottom: 4 }}>
        Slack Archive
      </h1>
      <p style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginBottom: 24 }}>
        Full-history archive of registered Slack channels, synced nightly. Visible to super admins only.
      </p>
      <ChannelsPanel channels={channels} />
    </div>
  );
}
