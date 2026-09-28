// The page-view beacon's sink (app/components/ActivityBeacon.tsx), plus the
// sidebar's "Sign out" note. Who it was comes from the session cookie, never
// from the request body — the browser only sends paths and times. Always
// answers 204, so a failed write never shows up as an error in the portal.

import { getAuthUser } from "../../../lib/auth/viewer";
import { logActivity, memberLabel, type ActivityEvent } from "../../../lib/activity/log";
import { getPreview } from "../../../lib/activity/preview";

const MAX_EVENTS = 25;
const MAX_PATH = 500;
const MAX_AGE_MS = 60 * 60 * 1000;

const done = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return done();

  let body: { events?: unknown; logout?: unknown };
  try {
    body = await req.json();
  } catch {
    return done();
  }

  const now = Date.now();
  const views = (Array.isArray(body?.events) ? body.events : [])
    .slice(0, MAX_EVENTS)
    .flatMap((e: { path?: unknown; ts?: unknown }) => {
      const path = typeof e?.path === "string" ? e.path.slice(0, MAX_PATH) : "";
      if (!path.startsWith("/portal")) return [];
      const ts = Number(e?.ts);
      const at = Number.isFinite(ts) && ts <= now && ts > now - MAX_AGE_MS ? new Date(ts) : new Date(now);
      return [{ path, at }];
    });
  const logout = body?.logout === true;
  if (views.length === 0 && !logout) return done();

  const [who, preview] = await Promise.all([memberLabel(user.id), getPreview()]);
  const base = {
    sid: user.sessionId,
    userId: user.id,
    userName: who.name,
    role: who.role,
    impersonatorUserId: preview?.impersonatorUserId ?? null,
    impersonatorSid: preview?.impersonatorSid ?? null,
  };
  const rows: ActivityEvent[] = views.map((v) => ({ ...base, eventType: "page_view", path: v.path, createdAt: v.at }));
  // Sign-out during a preview goes through the exit route instead.
  if (logout && !preview) rows.push({ ...base, eventType: "logout" });
  await logActivity(rows);
  return done();
}
