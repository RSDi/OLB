// Reads for Settings → Website Activity (website_events, migration 0161). The
// table and views are limited to can_see_activity() under RLS, so these use
// the caller's own client; the tab's server action checks the account first
// as well.

import { createClient } from "../supabase/server";
import { memberDisplayName } from "../members/display";

export interface WebsiteVisit {
  visitId: string;
  visitorId: string;
  startedAt: string;
  lastAt: string;
  pageViews: number;
  source: string;
  device: string;
  place: string;
  // Signed in to the portal at the time: their name.
  memberName: string | null;
  startedRegistration: boolean;
  registered: boolean;
  // The pages, in order.
  pages: string[];
  // Which visit this is for the browser (1 = its first), and who it
  // registered (on any visit), when it did.
  visitNumber: number;
  registeredAs: string | null;
}

export interface WebsiteRegistration {
  at: string;
  players: string;
  visitorId: string;
  visits: number;
  firstSeenAt: string | null;
  firstSource: string;
}

export interface WebsiteActivity {
  kpis: { visitors30d: number; visits30d: number; views30d: number; registrations30d: number };
  daily: { day: string; visitors: number; visits: number; views: number }[];
  topPages: { page: string; views: number; visitors: number }[];
  sources: { source: string; visits: number; visitors: number }[];
  funnel: { visitors: number; opened: number; started: number; submitted: number };
  visits: WebsiteVisit[];
  registrations: WebsiteRegistration[];
  // When this was read (epoch ms): the tab's "now", so rendering stays pure.
  asOf: number;
  error: string | null;
}

type VisitRow = {
  visit_id: string;
  visitor_id: string;
  started_at: string;
  last_at: string;
  page_views: number;
  source: string;
  device: string;
  city: string;
  region: string;
  user_id: string | null;
  started_registration: boolean;
  registered: boolean;
};

const RECENT_VISITS = 40;

function placeOf(r: { city: string; region: string }): string {
  return [r.city, r.region].filter(Boolean).join(", ");
}

export async function loadWebsiteActivity(): Promise<WebsiteActivity> {
  const supabase = await createClient();
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400_000).toISOString();

  const [dailyRes, topRes, sourcesRes, funnelRes, visitsRes, regsRes] = await Promise.all([
    supabase.from("website_daily_30d").select("day, visitors, visits, views").order("day", { ascending: true }),
    supabase.from("website_top_pages_30d").select("page, views, visitors").order("views", { ascending: false }).limit(15),
    supabase.from("website_sources_30d").select("source, visits, visitors").order("visits", { ascending: false }).limit(12),
    supabase.from("website_funnel_30d").select("visitors, opened, started, submitted").maybeSingle(),
    supabase
      .from("website_visits")
      .select("visit_id, visitor_id, started_at, last_at, page_views, source, device, city, region, user_id, started_registration, registered")
      .order("started_at", { ascending: false })
      .limit(RECENT_VISITS),
    supabase
      .from("website_events")
      .select("visitor_id, label, created_at")
      .eq("event_type", "reg_submitted")
      .gte("created_at", d30)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Missing relation (42P01) or not in PostgREST's schema cache (PGRST205):
  // 0161 isn't applied. Anything else, show what the database said.
  const failed = [dailyRes, topRes, sourcesRes, funnelRes, visitsRes, regsRes].find((r) => r.error)?.error;
  const error = !failed
    ? null
    : failed.code === "42P01" || failed.code === "PGRST205"
    ? "Website activity isn't set up yet — migration 0161 hasn't been applied to this database."
    : `Couldn't load website activity: ${failed.message}${failed.code ? ` (${failed.code})` : ""}`;

  const visitRows = (visitsRes.data as VisitRow[] | null) ?? [];
  const regRows = (regsRes.data as { visitor_id: string; label: string; created_at: string }[] | null) ?? [];
  const visitorIds = [...new Set([...visitRows.map((v) => v.visitor_id), ...regRows.map((r) => r.visitor_id)])];
  const userIds = [...new Set(visitRows.map((v) => v.user_id).filter((id): id is string => !!id))];

  const [pagesRes, historyRes, labelsRes, namesRes] = await Promise.all([
    visitRows.length
      ? supabase
          .from("website_events")
          .select("visit_id, path, created_at")
          .eq("event_type", "page_view")
          .in("visit_id", visitRows.map((v) => v.visit_id))
          .order("created_at", { ascending: true })
          .limit(1000)
      : Promise.resolve({ data: [] }),
    visitorIds.length
      ? supabase
          .from("website_visits")
          .select("visitor_id, started_at, source")
          .in("visitor_id", visitorIds)
          .order("started_at", { ascending: true })
          .limit(2000)
      : Promise.resolve({ data: [] }),
    visitorIds.length
      ? supabase
          .from("website_events")
          .select("visitor_id, label, created_at")
          .eq("event_type", "reg_submitted")
          .in("visitor_id", visitorIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("members").select("user_id, full_name, nickname, email").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pagesByVisit = new Map<string, string[]>();
  for (const e of (pagesRes.data as { visit_id: string; path: string }[] | null) ?? []) {
    const list = pagesByVisit.get(e.visit_id) ?? [];
    // A reload of the same page isn't a move.
    if (list[list.length - 1] !== e.path) list.push(e.path);
    pagesByVisit.set(e.visit_id, list);
  }
  const history = new Map<string, { started_at: string; source: string }[]>();
  for (const h of (historyRes.data as { visitor_id: string; started_at: string; source: string }[] | null) ?? []) {
    const list = history.get(h.visitor_id) ?? [];
    list.push(h);
    history.set(h.visitor_id, list);
  }
  const registeredAs = new Map<string, string>();
  for (const l of (labelsRes.data as { visitor_id: string; label: string }[] | null) ?? []) {
    if (!registeredAs.has(l.visitor_id) && l.label) registeredAs.set(l.visitor_id, l.label);
  }
  const names = new Map<string, string>();
  for (const m of (namesRes.data as { user_id: string; full_name: string | null; nickname: string | null; email: string | null }[] | null) ?? []) {
    names.set(m.user_id, memberDisplayName(m));
  }

  const visits: WebsiteVisit[] = visitRows.map((v) => ({
    visitId: v.visit_id,
    visitorId: v.visitor_id,
    startedAt: v.started_at,
    lastAt: v.last_at,
    pageViews: Number(v.page_views ?? 0),
    source: v.source,
    device: v.device,
    place: placeOf(v),
    memberName: v.user_id ? names.get(v.user_id) ?? "A member" : null,
    startedRegistration: !!v.started_registration,
    registered: !!v.registered,
    pages: pagesByVisit.get(v.visit_id) ?? [],
    visitNumber: Math.max(1, (history.get(v.visitor_id) ?? []).filter((h) => h.started_at <= v.started_at).length),
    registeredAs: registeredAs.get(v.visitor_id) ?? null,
  }));

  const registrations: WebsiteRegistration[] = regRows.map((r) => {
    // Their visits up to and including the one they registered on.
    const before = (history.get(r.visitor_id) ?? []).filter((h) => h.started_at <= r.created_at);
    return {
      at: r.created_at,
      players: r.label,
      visitorId: r.visitor_id,
      visits: Math.max(1, before.length),
      firstSeenAt: before[0]?.started_at ?? null,
      firstSource: before.find((h) => h.source)?.source ?? "",
    };
  });

  const daily = ((dailyRes.data as { day: string; visitors: number; visits: number; views: number }[] | null) ?? []).map((d) => ({
    day: d.day,
    visitors: Number(d.visitors),
    visits: Number(d.visits),
    views: Number(d.views),
  }));
  const f = funnelRes.data as { visitors: number; opened: number; started: number; submitted: number } | null;
  const funnel = {
    visitors: Number(f?.visitors ?? 0),
    opened: Number(f?.opened ?? 0),
    started: Number(f?.started ?? 0),
    submitted: Number(f?.submitted ?? 0),
  };

  return {
    kpis: {
      visitors30d: funnel.visitors,
      visits30d: daily.reduce((n, d) => n + d.visits, 0),
      views30d: daily.reduce((n, d) => n + d.views, 0),
      registrations30d: regRows.length,
    },
    daily,
    topPages: ((topRes.data as { page: string; views: number; visitors: number }[] | null) ?? []).map((p) => ({
      page: p.page,
      views: Number(p.views),
      visitors: Number(p.visitors),
    })),
    sources: ((sourcesRes.data as { source: string; visits: number; visitors: number }[] | null) ?? []).map((s) => ({
      source: s.source,
      visits: Number(s.visits),
      visitors: Number(s.visitors),
    })),
    funnel,
    visits,
    registrations,
    asOf: now,
    error,
  };
}
