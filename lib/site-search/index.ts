// The /search page's index of the public site: each page below, fetched as a
// visitor sees it and reduced to passages (lib/site-search/text.ts). Built on
// the first search and kept for a few minutes, so edits to the site show up
// without a rebuild of anything.
import { extractPage, type SitePage } from "./text";

// The public pages people can search. Sign-in pages and forms with nothing to
// read are left out.
export const SEARCHABLE_PATHS = [
  "/",
  "/programs",
  "/summer",
  "/meeting-times",
  "/coaches",
  "/philosophy",
  "/history",
  "/sponsors",
  "/player-registration",
  "/contact",
];

const TTL_MS = 10 * 60 * 1000;

let cached: { origin: string; at: number; pages: SitePage[] } | null = null;
let building: Promise<SitePage[]> | null = null;

async function fetchPage(origin: string, path: string, headers: HeadersInit): Promise<SitePage | null> {
  try {
    const res = await fetch(new URL(path, origin), {
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return extractPage(path, await res.text());
  } catch {
    return null;
  }
}

// `origin` is the site the request came in on. `vercelJwt` passes a
// preview deployment's protection cookie through, so the index can read its
// own pages there too.
export async function getSiteIndex(origin: string, vercelJwt?: string): Promise<SitePage[]> {
  if (cached && cached.origin === origin && Date.now() - cached.at < TTL_MS) return cached.pages;
  if (building) return building;

  const headers: Record<string, string> = { "user-agent": "OmahaLightningSiteSearch/1.0" };
  if (vercelJwt) headers.cookie = `_vercel_jwt=${vercelJwt}`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  building = Promise.all(SEARCHABLE_PATHS.map((path) => fetchPage(origin, path, headers)))
    .then((results) => {
      const pages = results.filter((p): p is SitePage => !!p && p.passages.length > 0);
      // Don't hold on to an empty index (the site was briefly unreachable).
      if (pages.length) cached = { origin, at: Date.now(), pages };
      return pages;
    })
    .finally(() => {
      building = null;
    });
  return building;
}
