// Slack Channel Archive — search across every registered channel by author
// and/or message text. Super-admin only, same as the rest of this feature.

import Link from "next/link";
import { loadArchiveViewer, loadArchiveAuthors, loadArchiveChannels } from "../../../../lib/slack-archive/data";
import { SearchPanel } from "./SearchPanel";

export default async function SlackArchiveSearchPage() {
  await loadArchiveViewer();
  const [{ authors, error: authorsError }, channels] = await Promise.all([
    loadArchiveAuthors(),
    loadArchiveChannels(),
  ]);

  return (
    <div style={{ maxWidth: 920 }}>
      <Link
        href="/portal/slack-archive"
        style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        ← All channels
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "4px 0 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", margin: 0 }}>
          Search Archive
        </h1>
      </div>
      {authorsError && (
        <div
          style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 10,
            background: "var(--gw-error-bg)", border: "1px solid rgba(229,62,62,.25)",
            color: "var(--gw-error)", fontSize: 12.5, fontWeight: 600,
          }}
        >
          Couldn&rsquo;t load the user list: {authorsError}. If migration 0079 hasn&rsquo;t been applied
          to Supabase yet, that&rsquo;s almost certainly why — text search below still works either way.
        </div>
      )}
      <SearchPanel
        authors={authors}
        channels={channels.map((c) => ({ id: c.slack_channel_id, label: c.label }))}
      />
    </div>
  );
}
