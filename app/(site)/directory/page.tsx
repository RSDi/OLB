import type { Metadata } from "next";
import { loadPublicDirectory } from "../../../lib/teams/public-directory";
import { PublicDirectoryList } from "./PublicDirectoryList";

export const metadata: Metadata = {
  title: "Directory",
  description: "This season's Omaha Lightning players and their families.",
  // Families' phone numbers and addresses: open to anyone with the link,
  // but kept out of search engines.
  robots: { index: false, follow: false },
};

// Always this season's roster as it stands, never a copy from the last build.
export const dynamic = "force-dynamic";

// The public, read-only Directory: no login, nothing to change, no links into
// the portal. Only families who said yes to the directory are listed, and no
// fee or payment details are loaded (see lib/teams/public-directory.ts).
export default async function PublicDirectoryPage() {
  const { season, teams, players } = await loadPublicDirectory();
  return (
    <div data-theme="lightning" style={{ background: "var(--gw-bg)", color: "var(--gw-fg)" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 16px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-.01em" }}>Directory</h1>
        <PublicDirectoryList season={season} teams={teams} players={players} />
      </div>
    </div>
  );
}
