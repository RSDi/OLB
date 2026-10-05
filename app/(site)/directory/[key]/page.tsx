import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicDirectory } from "../../../../lib/teams/public-directory";
import { PublicDirectoryList } from "../PublicDirectoryList";

export const metadata: Metadata = {
  title: "Directory",
  description: "This season's Omaha Lightning players and their families.",
  // Families' phone numbers and addresses: open to anyone with the link,
  // but kept out of search engines (and the link is hard to guess).
  robots: { index: false, follow: false },
};

// Always this season's roster as it stands, never a copy from the last build.
export const dynamic = "force-dynamic";

// Whether the link's key is PUBLIC_DIRECTORY_KEY. Unset (or too short to be
// hard to guess) means the page is off. Changing the key retires old links.
function keyMatches(key: string): boolean {
  const want = process.env.PUBLIC_DIRECTORY_KEY?.trim();
  if (!want || want.length < 16) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The public, read-only Directory at /directory/<key>: no login, but only for
// someone with the link. Nothing to change, no links into the portal. Only
// families who said yes to the directory are listed, and no birthdays, fees
// or payment details are sent (see lib/teams/public-directory.ts). A wrong
// key is a plain 404, so the page's existence isn't given away.
export default async function PublicDirectoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!keyMatches(key)) notFound();
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
