import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicDirectory, loadPublicDirectoryKey } from "../../../../lib/teams/public-directory";
import { keyOpens } from "../../../../lib/teams/public-directory-key";
import { PublicDirectoryList } from "../PublicDirectoryList";

export const metadata: Metadata = {
  // No site layout here to add " — Omaha Lightning Basketball".
  title: { absolute: "Directory — Omaha Lightning Basketball" },
  description: "This season's Omaha Lightning players and their families.",
  // Families' phone numbers and emails: open to anyone with the link,
  // but kept out of search engines (and the link is hard to guess).
  robots: { index: false, follow: false },
};

// Always this season's roster as it stands, never a copy from the last build.
export const dynamic = "force-dynamic";

// The public, read-only Directory at /directory/<key>: no login, but only for
// someone with the link. Nothing to change, no links into the portal. Only
// families who said yes to the directory are listed, and no birthdays, street
// addresses, fees or payment details are sent (see
// lib/teams/public-directory.ts). A wrong key is a plain 404, so the page's
// existence isn't given away.
export default async function PublicDirectoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  // Super-admins set the key in Settings → Public Directory; none set means
  // the page is off. Changing it retires old links.
  if (!keyOpens(key, await loadPublicDirectoryKey())) notFound();
  const { season, teams, players } = await loadPublicDirectory();
  return (
    <div data-theme="lightning" style={{ minHeight: "100vh", background: "var(--gw-bg)", color: "var(--gw-fg)" }}>
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
        <header style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
            Omaha Lightning Basketball
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-.01em" }}>Directory</h1>
        </header>
        <PublicDirectoryList season={season} teams={teams} players={players} />
      </div>
    </div>
  );
}
