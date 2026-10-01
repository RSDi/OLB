import type { Metadata } from "next";
import { getViewer } from "../../../lib/auth/viewer";
import { PortalSearch } from "./PortalSearch";

// Search the portal, laid out after America.gov: one big question box, an AI
// answer written only from records the member can open (with numbered
// sources), and the matching records under it. Reached by typing
// /portal/search (or the old public /search, which redirects here); nothing
// in the sidebar links to it.

export const metadata: Metadata = { title: "Search — Omaha Lightning Basketball" };

export default async function PortalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const viewer = await getViewer();
  if (viewer?.status !== "approved") {
    return (
      <p style={{ margin: "40px auto", maxWidth: 520, textAlign: "center", color: "var(--gw-fg-muted)" }}>
        Search opens up once your account is approved.
      </p>
    );
  }
  const { q } = await searchParams;
  const initial = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 200) ?? "";
  return <PortalSearch initialQuery={initial} showLog={viewer.isSuperAdmin} />;
}
