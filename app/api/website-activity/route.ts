// The public site's page-view beacon's sink (app/(site)/_components/
// WebsiteBeacon.tsx). The browser sends paths, times and, on a fresh page
// load, the referrer; the visitor ids live in cookies set here
// (lib/activity/website.ts). Always answers 204, so a failed write never
// shows up as an error on the site.

import { logWebsiteEvents, type WebsiteEvent } from "../../../lib/activity/website";
import { isSitePath, referrerHost, visitSource } from "../../../lib/activity/website-rules";

const MAX_EVENTS = 25;
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
  const views: WebsiteEvent[] = (Array.isArray(body?.events) ? body.events : [])
    .slice(0, MAX_EVENTS)
    .flatMap((e: { path?: unknown; ts?: unknown; ref?: unknown }) => {
      const path = typeof e?.path === "string" ? e.path.slice(0, MAX_PATH) : "";
      if (!isSitePath(path)) return [];
      const ts = Number(e?.ts);
      const at = Number.isFinite(ts) && ts <= now && ts > now - MAX_AGE_MS ? new Date(ts) : new Date(now);
      const host = referrerHost(typeof e?.ref === "string" ? e.ref : "", ownHost);
      return [{ eventType: "page_view" as const, path, referrer: host, source: visitSource(path, host), createdAt: at }];
    });
  if (views.length === 0) return done();
  await logWebsiteEvents(views, { setCookies: true });
  return done();
}
