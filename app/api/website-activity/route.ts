// The public site's page-view beacon's sink (app/(site)/_components/
// WebsiteBeacon.tsx). The browser sends paths, times and, on a fresh page
// load, the referrer; the visitor ids live in cookies set here
// (lib/activity/website.ts). Always answers 204, so a failed write never
// shows up as an error on the site.

import { logWebsiteEvents, type WebsiteEvent } from "../../../lib/activity/website";
import { isSitePath, knownPageLabel, newPageSlug, referrerHost, teamFilmLabel, visitSource } from "../../../lib/activity/website-rules";
import { getWatchTeam, watchPlayLabel } from "../../../lib/film/watch-data";
import { getSitePage } from "../../../lib/website/queries";

// Only real pages count: the website's own, or one added in Settings →
// Website → New pages. A mistyped address or a bot trying /cart gets the
// "page not found" screen and isn't recorded.
async function isRealPage(path: string): Promise<boolean> {
  // A team film page counts only while that team's page is on.
  if (teamFilmLabel(path)) {
    const slug = path.split("?")[0].split("/")[2] ?? "";
    try {
      return !!(await getWatchTeam(slug));
    } catch {
      return false;
    }
  }
  if (knownPageLabel(path)) return true;
  const slug = newPageSlug(path);
  if (!slug) return false;
  try {
    return !!(await getSitePage(slug));
  } catch {
    return false;
  }
}

const MAX_EVENTS = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PATH = 500;
const MAX_AGE_MS = 60 * 60 * 1000;

const done = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  let body: { events?: unknown };
  try {
    body = await req.json();
  } catch {
    return done();
  }

  const ownHost = req.headers.get("host");
  const now = Date.now();
  type Incoming = { path?: unknown; ts?: unknown; ref?: unknown; kind?: unknown; upload?: unknown };
  const incoming: Incoming[] = (Array.isArray(body?.events) ? body.events : []).slice(0, MAX_EVENTS);
  const checked = await Promise.all(
    incoming.map(async (e): Promise<WebsiteEvent | null> => {
      const path = typeof e?.path === "string" ? e.path.slice(0, MAX_PATH) : "";
      if (!isSitePath(path)) return null;
      const ts = Number(e?.ts);
      const at = Number.isFinite(ts) && ts <= now && ts > now - MAX_AGE_MS ? new Date(ts) : new Date(now);
      // A game started playing on a team film page: the page and the game
      // must both check out, and the label comes from the database.
      if (e?.kind === "film_play") {
        const upload = typeof e.upload === "string" ? e.upload : "";
        if (!UUID.test(upload) || !teamFilmLabel(path)) return null;
        const pageKey = path.split("?")[0].split("/")[2] ?? "";
        const label = await watchPlayLabel(pageKey, upload).catch(() => null);
        if (!label) return null;
        return { eventType: "film_play", path, label, meta: { upload_id: upload }, createdAt: at };
      }
      if (!(await isRealPage(path))) return null;
      const host = referrerHost(typeof e?.ref === "string" ? e.ref : "", ownHost);
      return { eventType: "page_view", path, referrer: host, source: visitSource(path, host), createdAt: at };
    })
  );
  const kept = checked.filter((e): e is WebsiteEvent => e !== null);
  if (kept.length === 0) return done();
  await logWebsiteEvents(kept, { setCookies: true });
  return done();
}
