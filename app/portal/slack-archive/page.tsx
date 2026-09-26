// Slack Channel Archive — channel registry. Super-admin only (see
// lib/slack-archive/data.ts's loadArchiveViewer). A siloed feature: see
// supabase/migrations/0077_slack_archive.sql for the removal plan.

import Link from "next/link";
import { loadArchiveViewer, loadArchiveChannels } from "../../../lib/slack-archive/data";
import { AlbumCard } from "./AlbumCard";
import { ChannelsPanel } from "./ChannelsPanel";

export default async function SlackArchivePage() {
  await loadArchiveViewer();
  const channels = await loadArchiveChannels();

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", marginBottom: 4 }}>
          Slack Archive
        </h1>
        <div style={{ display: "flex", gap: 16 }}>
          <Link
            href="/portal/slack-archive/search"
            style={{ fontSize: 12.5, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
          >
            Search archive →
          </Link>
          <Link
            href="/portal/slack-archive/exceptions"
            style={{ fontSize: 12.5, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
          >
            View all exceptions →
          </Link>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginBottom: 24 }}>
        Full-history archive of registered Slack channels, synced nightly. Visible to super admins only.
      </p>
      <AlbumCard />
      <ChannelsPanel channels={channels} />
    </div>
  );
}
