// Writes to website activity (website_events, migration 0161): page views on
// the public site and the steps of player registration. Server-only — it
// uses the service role, and reads and sets the visitor cookies, so call it
// from a route handler or a server action.
//
// The browser holds two random ids in httpOnly cookies: the visitor (kept a
// year) and the visit (ends after 30 minutes with nothing new). Nothing else
// identifies them until they sign in or register.
//
// logWebsiteEvents never throws: a failed write goes to the server log and
// the page or form carries on. Read side: lib/activity/website-queries.ts.

import { cookies, headers } from "next/headers";
import { createAdminClient } from "../supabase/admin";
import { getAuthUser } from "../auth/viewer";
import { deviceOf, isBot } from "./website-rules";

const VISITOR_COOKIE = "olb_vid";
const VISIT_COOKIE = "olb_visit";
const VISITOR_MAX_AGE = 365 * 86400;
const VISIT_MAX_AGE = 30 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WebsiteEventType = "page_view" | "reg_started" | "reg_submitted";

export interface WebsiteEvent {
  eventType: WebsiteEventType;
  path?: string;
  source?: string;
  referrer?: string;
  label?: string;
  meta?: Record<string, unknown>;
  createdAt?: Date; // omit → the database's now()
}

// This browser's visitor and visit ids, made when missing. With `keep`, the
// cookies are (re)set, keeping the visit open another 30 minutes. Only the
// beacon's route sets them: setting a cookie from a server action refreshes
// the page it was called from.
async function visitorIds(keep: boolean): Promise<{ visitorId: string; visitId: string }> {
  const jar = await cookies();
  const read = (name: string) => {
    const v = jar.get(name)?.value;
    return v && UUID.test(v) ? v : null;
  };
  const visitorId = read(VISITOR_COOKIE) ?? crypto.randomUUID();
  const visitId = read(VISIT_COOKIE) ?? crypto.randomUUID();
  if (!keep) return { visitorId, visitId };
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(VISITOR_COOKIE, visitorId, { ...base, maxAge: VISITOR_MAX_AGE });
  jar.set(VISIT_COOKIE, visitId, { ...base, maxAge: VISIT_MAX_AGE });
  return { visitorId, visitId };
}

// Vercel's guess at where the request came from; blank off Vercel.
function place(h: Headers): { city: string; region: string; country: string } {
  const read = (name: string) => {
    const v = h.get(name) ?? "";
    try {
      return decodeURIComponent(v).slice(0, 80);
    } catch {
      return v.slice(0, 80);
    }
  };
  return { city: read("x-vercel-ip-city"), region: read("x-vercel-ip-country-region"), country: read("x-vercel-ip-country") };
}

// `setCookies`: true from the beacon's route handler, which starts and
// extends visits; the registration steps only read them.
export async function logWebsiteEvents(
  events: WebsiteEvent | WebsiteEvent[],
  { setCookies = false }: { setCookies?: boolean } = {}
): Promise<void> {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  try {
    const h = await headers();
    const ua = h.get("user-agent");
    if (isBot(ua)) return;
    const [{ visitorId, visitId }, user] = await Promise.all([visitorIds(setCookies), getAuthUser().catch(() => null)]);
    const where = place(h);
    const device = deviceOf(ua);
    const rows = list.map((e) => ({
      visitor_id: visitorId,
      visit_id: visitId,
      event_type: e.eventType,
      path: e.path ?? "",
      source: e.source ?? "",
      referrer: e.referrer ?? "",
      device,
      ...where,
      user_id: user?.id ?? null,
      label: e.label ?? "",
      meta: e.meta ?? {},
      ...(e.createdAt ? { created_at: e.createdAt.toISOString() } : {}),
    }));
    const { error } = await createAdminClient().from("website_events").insert(rows);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[website activity] log failed:", err);
  }
}
