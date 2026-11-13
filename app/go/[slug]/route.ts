// /go/<sponsor>?from=live|site (0169): count a click on a sponsor's logo,
// then send the visitor on to the sponsor's site. Bots and link previews
// aren't counted, nor a repeat tap from the same browser within 10 minutes.
// Counting never holds up the redirect.

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { deviceOf, isBot } from "../../../lib/activity/website-rules";
import { sponsorBySlug } from "../../../lib/sponsors/links";

const VISITOR_COOKIE = "olb_vid"; // shared with website activity (0161)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPEAT_MINUTES = 10;
const WAIT_MS = 1500;

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sponsor = sponsorBySlug(slug);
  if (!sponsor) return NextResponse.redirect(new URL("/sponsors", req.url), 302);

  const from = new URL(req.url).searchParams.get("from");
  const source = from === "live" || from === "site" ? from : "";
  const jar = await cookies();
  const had = jar.get(VISITOR_COOKIE)?.value;
  const visitorId = had && UUID.test(had) ? had : crypto.randomUUID();

  // Count it, but never keep the visitor waiting more than a moment.
  const count = async () => {
    const ua = (await headers()).get("user-agent");
    if (isBot(ua)) return;
    const db = createAdminClient();
    const since = new Date(Date.now() - REPEAT_MINUTES * 60_000).toISOString();
    const { count: recent } = await db
      .from("sponsor_clicks")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", visitorId)
      .eq("sponsor", sponsor.slug)
      .gte("created_at", since);
    if (recent) return;
    const { error } = await db.from("sponsor_clicks").insert({ sponsor: sponsor.slug, source, visitor_id: visitorId, device: deviceOf(ua) });
    if (error) throw new Error(error.message);
  };
  try {
    await Promise.race([count(), new Promise<void>((_, no) => setTimeout(() => no(new Error("timed out")), WAIT_MS))]);
  } catch (err) {
    console.error("[sponsor clicks] log failed:", err);
  }

  const res = NextResponse.redirect(sponsor.url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (!had || !UUID.test(had)) {
    res.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  return res;
}
