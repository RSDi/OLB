import type { Metadata } from "next";
import { SearchApp } from "./SearchApp";

// A temporary search page for the public site, laid out after America.gov:
// one big question box, an AI answer written from the site's own pages with
// numbered sources, and the matching pages under it. Reached only by typing
// /search: nothing in the site's menus links here, and search engines are
// asked not to index it.

export const metadata: Metadata = {
  title: "Search — Omaha Lightning Basketball",
  description: "Ask a question and get answers from the Omaha Lightning Basketball website.",
  robots: { index: false, follow: false },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const initial = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 200) ?? "";
  return <SearchApp initialQuery={initial} />;
}
