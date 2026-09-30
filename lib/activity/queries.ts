// Reads for the Activity page (app/portal/activity). The tables and views
// are super-admin-only under RLS (migration 0099), so these use the caller's
// own client; the page checks the role first as well.

import { createClient } from "../supabase/server";
import { memberDisplayName } from "../members/display";

export interface RosterMember {
  memberId: string;
  // null: invited (approved, with an email) but not signed up yet.
  userId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  revoked: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastSeenPath: string | null;
  sessions30d: number;
  pageViews30d: number;
}

export interface PreviewRecord {
  id: string;
  impersonatorName: string;
  targetName: string;
  targetUserId: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  sessionId: string | null;
}

export interface ActivityOverview {
  kpis: { logins7d: number; active24h: number; active7d: number; previews30d: number };
  members: RosterMember[];
  topPages: { page: string; views: number; people: number }[];
  daily: { day: string; people: number; views: number }[];
  previews: PreviewRecord[];
  // When this was read (epoch ms): the page's "now", so rendering stays pure.
  asOf: number;
  error: string | null;
}

type MemberRow = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  access_revoked_at: string | null;
};

async function namesByUserId(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("members").select("user_id, full_name, nickname, email").in("user_id", ids);
  for (const m of (data as { user_id: string; full_name: string | null; nickname: string | null; email: string | null }[]) ?? []) {
    out.set(m.user_id, memberDisplayName(m));
  }
  return out;
}

export async function loadActivityOverview(): Promise<ActivityOverview> {
  const supabase = await createClient();
  const now = Date.now();
  const d7 = new Date(now - 7 * 86400_000).toISOString();
  const d30 = new Date(now - 30 * 86400_000).toISOString();

  const [membersRes, summaryRes, lastViewRes, logins7dRes, previews30dRes, topRes, dailyRes, previewsRes] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, user_id, full_name, nickname, email, avatar_url, role, status, access_revoked_at")
        .or("user_id.not.is.null,and(status.eq.approved,email.not.is.null,access_revoked_at.is.null)")
        .is("deleted_at", null),
      supabase.from("activity_user_summary").select("user_id, last_login_at, last_seen_at, sessions_30d, page_views_30d"),
      supabase.from("activity_user_last_view").select("user_id, last_seen_path"),
      supabase.from("activity_events").select("id", { count: "exact", head: true }).eq("event_type", "login").gte("created_at", d7),
      supabase.from("activity_events").select("id", { count: "exact", head: true }).eq("event_type", "preview_start").gte("created_at", d30),
      supabase.from("activity_top_pages_30d").select("page, views, people").order("views", { ascending: false }).limit(10),
      supabase.from("activity_daily_30d").select("day, people, views").order("day", { ascending: true }),
      supabase
        .from("member_previews")
        .select("id, impersonator_user_id, target_user_id, target_session_id, started_at, expires_at, ended_at, end_reason")
        .or("end_reason.is.null,end_reason.neq.failed")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

  // The summary views arrive with migration 0099; before it's applied, show
  // the members with no activity rather than an error page.
  // Missing relation (42P01) or not in PostgREST's schema cache (PGRST205):
  // 0099 isn't applied. Anything else, show what the database said.
  const failed = [summaryRes, lastViewRes, topRes, dailyRes, previewsRes].find((r) => r.error)?.error;
  const error = !failed
    ? null
    : failed.code === "42P01" || failed.code === "PGRST205"
    ? "The activity trail isn't set up yet — migration 0099 hasn't been applied to this database."
    : `Couldn't load activity: ${failed.message}${failed.code ? ` (${failed.code})` : ""}`;

  const summary = new Map<string, { last_login_at: string | null; last_seen_at: string | null; sessions_30d: number; page_views_30d: number }>();
  for (const r of (summaryRes.data as { user_id: string; last_login_at: string | null; last_seen_at: string | null; sessions_30d: number; page_views_30d: number }[]) ?? []) {
    summary.set(r.user_id, r);
  }
  const lastView = new Map<string, string>();
  for (const r of (lastViewRes.data as { user_id: string; last_seen_path: string }[]) ?? []) {
    lastView.set(r.user_id, r.last_seen_path);
  }

  // Everyone with a login, plus approved members who were invited (an email)
  // but haven't signed up: "Preview as" sets up their login.
  const rosterRows = ((membersRes.data as MemberRow[]) ?? []).filter((m) => m.user_id || m.email?.trim());
  const members: RosterMember[] = rosterRows.map((m) => {
    const s = m.user_id ? summary.get(m.user_id) : undefined;
    return {
      memberId: m.id,
      userId: m.user_id,
      name: memberDisplayName(m),
      email: m.email,
      avatarUrl: m.avatar_url,
      role: m.role,
      status: m.status,
      revoked: !!m.access_revoked_at,
      lastLoginAt: s?.last_login_at ?? null,
      lastSeenAt: s?.last_seen_at ?? null,
      lastSeenPath: m.user_id ? lastView.get(m.user_id) ?? null : null,
      sessions30d: Number(s?.sessions_30d ?? 0),
      pageViews30d: Number(s?.page_views_30d ?? 0),
    };
  });

  const seenWithin = (ms: number) =>
    members.filter((m) => m.lastSeenAt && now - Date.parse(m.lastSeenAt) < ms).length;

  const previewRows =
    (previewsRes.data as {
      id: string;
      impersonator_user_id: string;
      target_user_id: string;
      target_session_id: string | null;
      started_at: string;
      expires_at: string;
      ended_at: string | null;
      end_reason: string | null;
    }[]) ?? [];
  const names = await namesByUserId(previewRows.flatMap((p) => [p.impersonator_user_id, p.target_user_id]));

  return {
    kpis: {
      logins7d: logins7dRes.count ?? 0,
      active24h: seenWithin(86400_000),
      active7d: seenWithin(7 * 86400_000),
      previews30d: previews30dRes.count ?? 0,
    },
    members,
    topPages: ((topRes.data as { page: string; views: number; people: number }[]) ?? []).map((r) => ({
      page: r.page,
      views: Number(r.views),
      people: Number(r.people),
    })),
    daily: ((dailyRes.data as { day: string; people: number; views: number }[]) ?? []).map((r) => ({
      day: r.day,
      people: Number(r.people),
      views: Number(r.views),
    })),
    previews: previewRows.map((p) => ({
      id: p.id,
      impersonatorName: names.get(p.impersonator_user_id) ?? "Unknown",
      targetName: names.get(p.target_user_id) ?? "Unknown",
      targetUserId: p.target_user_id,
      startedAt: p.started_at,
      expiresAt: p.expires_at,
      endedAt: p.ended_at,
      endReason: p.end_reason,
      sessionId: p.target_session_id,
    })),
    asOf: now,
    error,
  };
}

export interface SessionSummary {
  sid: string;
  startedAt: string;
  lastEventAt: string;
  pageViews: number;
  isPreview: boolean;
  previewedBy: string | null;
  device: string | null;
}

export async function loadUserSessions(
  userId: string
): Promise<{ name: string; sessions: SessionSummary[]; asOf: number; error: string | null }> {
  const supabase = await createClient();
  const [nameMap, sessionsRes, startsRes] = await Promise.all([
    namesByUserId([userId]),
    supabase
      .from("activity_session_summary")
      .select("sid, started_at, last_event_at, page_views, is_preview, impersonator_user_id")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("activity_events")
      .select("sid, meta")
      .eq("user_id", userId)
      .in("event_type", ["login", "preview_start"])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const firstMeta = new Map<string, Record<string, unknown>>();
  for (const e of (startsRes.data as { sid: string | null; meta: Record<string, unknown> }[]) ?? []) {
    if (e.sid) firstMeta.set(e.sid, e.meta ?? {});
  }
  const rows =
    (sessionsRes.data as {
      sid: string;
      started_at: string;
      last_event_at: string;
      page_views: number;
      is_preview: boolean;
      impersonator_user_id: string | null;
    }[]) ?? [];
  const impersonators = await namesByUserId(rows.map((r) => r.impersonator_user_id ?? ""));

  return {
    name: nameMap.get(userId) ?? "Unknown member",
    sessions: rows.map((r) => {
      const meta = firstMeta.get(r.sid) ?? {};
      const ua = typeof meta.user_agent === "string" ? meta.user_agent : null;
      const byName = typeof meta.impersonator_name === "string" ? meta.impersonator_name : null;
      return {
        sid: r.sid,
        startedAt: r.started_at,
        lastEventAt: r.last_event_at,
        pageViews: Number(r.page_views),
        isPreview: r.is_preview || !!r.impersonator_user_id,
        previewedBy: r.impersonator_user_id ? impersonators.get(r.impersonator_user_id) ?? byName ?? "a super-admin" : null,
        device: ua,
      };
    }),
    asOf: Date.now(),
    error: sessionsRes.error ? sessionsRes.error.message : null,
  };
}

export interface TrailEvent {
  id: string;
  at: string;
  type: "login" | "logout" | "page_view" | "preview_start" | "preview_stop";
  path: string;
  meta: Record<string, unknown>;
  impersonatorUserId: string | null;
}

export const SESSION_EVENT_LIMIT = 500;

export async function loadSessionEvents(
  userId: string,
  sid: string
): Promise<{ events: TrailEvent[]; total: number; error: string | null }> {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("activity_events")
    .select("id, event_type, path, meta, created_at, impersonator_user_id", { count: "exact" })
    .eq("sid", sid)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(SESSION_EVENT_LIMIT);
  return {
    events: ((data as { id: string; event_type: TrailEvent["type"]; path: string; meta: Record<string, unknown>; created_at: string; impersonator_user_id: string | null }[]) ?? []).map((e) => ({
      id: e.id,
      at: e.created_at,
      type: e.event_type,
      path: e.path,
      meta: e.meta ?? {},
      impersonatorUserId: e.impersonator_user_id,
    })),
    total: count ?? 0,
    error: error ? error.message : null,
  };
}
