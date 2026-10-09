import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicRoadmap } from "../../../../lib/roadmap/data";
import { RoadmapView } from "../../../portal/roadmap/RoadmapView";
import logo from "../../../(site)/_images/logo-wordmark.png";

export const metadata: Metadata = {
  // No site layout here to add " — Omaha Lightning Basketball".
  title: { absolute: "Roadmap — Omaha Lightning Basketball" },
  description: "What's new in the Omaha Lightning app, and what's coming.",
  robots: { index: false, follow: false },
};

// Always the roadmap as it stands, never a copy from the last build.
export const dynamic = "force-dynamic";

// The read-only roadmap at /roadmap/<key>: no login, but only for someone
// with the link. Super-admins turn the link on (and retire it) from the
// roadmap's "Share link". A wrong key is a plain 404.
export default async function PublicRoadmapPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const data = await loadPublicRoadmap(key);
  if (!data) notFound();
  return (
    <div data-theme="lightning" style={{ minHeight: "100vh", background: "var(--gw-bg)", color: "var(--gw-fg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Link href="/" style={{ alignSelf: "flex-start", display: "block" }}>
            <Image
              src={logo}
              alt="Omaha Lightning Basketball home"
              sizes="(max-width: 466px) 60vw, 280px"
              loading="eager"
              fetchPriority="high"
              style={{ width: "min(280px, 60vw)", height: "auto", display: "block" }}
            />
          </Link>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-.01em" }}>Roadmap</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--gw-fg-muted)", maxWidth: 640 }}>
            What&apos;s new in the club&apos;s app, what we&apos;re building now, and what&apos;s coming.
          </p>
        </header>
        <RoadmapView items={data.items} mode="public" error={data.error} />
      </div>
    </div>
  );
}
