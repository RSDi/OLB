// Slack Channel Archive — search across every registered channel by author
// and/or message text. Super-admin only, same as the rest of this feature.

import Link from "next/link";
import { loadArchiveViewer, loadArchiveAuthors } from "../../../../lib/slack-archive/data";
import { SearchPanel } from "./SearchPanel";

export default async function SlackArchiveSearchPage() {
  await loadArchiveViewer();
  const authors = await loadArchiveAuthors();

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/portal/slack-archive"
        style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        ← All channels
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", margin: "4px 0 24px" }}>
        Search Archive
      </h1>
      <SearchPanel authors={authors} />
    </div>
  );
}
