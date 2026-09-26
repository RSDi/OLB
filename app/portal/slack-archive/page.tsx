// Slack Channel Archive — channel list. Any approved member can open it and
// sees only the channels they may read (public ones, plus private ones
// they're in on Slack — migration 0084); super admins see every channel
// plus the controls for managing the archive. A siloed feature: see
// supabase/migrations/0077_slack_archive.sql for the removal plan.

import Link from "next/link";
import { loadArchiveViewer, loadArchiveChannels } from "../../../lib/slack-archive/data";
import { AlbumCard } from "./AlbumCard";
import { ChannelsPanel } from "./ChannelsPanel";

// Server Actions inherit their page's maxDuration — the Refresh access button
// checks every channel with Slack, which can take longer than the platform
// default (see refreshArchiveAccessNow's deadline).
export const maxDuration = 60;

export default async function SlackArchivePage() {
  const viewer = await loadArchiveViewer();
  const channels = await loadArchiveChannels();
  const isAdmin = viewer.isSuperAdmin;

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
          {isAdmin && (
            <Link
              href="/portal/slack-archive/exceptions"
              style={{ fontSize: 12.5, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
            >
              View all exceptions →
            </Link>
          )}
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginBottom: 24 }}>
        Full-history archive of our Slack channels, synced nightly. Private channels are visible
        only to their members in Slack.
      </p>
      <AlbumCard />
      <ChannelsPanel channels={channels} isAdmin={isAdmin} />
    </div>
  );
}
