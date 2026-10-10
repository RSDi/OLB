// Server-only. Sends push notifications to the browsers and installed apps
// where members turned notifications on (olb_push_subscriptions, 0128).
// Mirrors the Resend helpers in graceful degradation: no-ops unless the VAPID
// keys and the service role key are set, and never throws, so the action that
// triggered it carries on.
//
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  the VAPID key pair, made once with
//   VAPID_PRIVATE_KEY             `npx web-push generate-vapid-keys`.
//   VAPID_SUBJECT                 a mailto: or https: contact for the push
//                                 services. Defaults to the site's address.

import webpush from "web-push";
import { createAdminClient } from "../supabase/admin";
import { PERMISSIONS, type PermissionKey } from "../auth/access";

export interface PushMessage {
  title: string;
  body: string;
  // Portal path the notification opens, e.g. "/portal/tasks/123".
  url?: string;
  // Notifications with the same tag replace each other instead of stacking.
  tag?: string;
}

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let vapidSet = false;
function setVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || siteUrl(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidSet = true;
}

// To the members with these emails (approved, not deleted). Lets the email
// helpers push to the same people they email.
export async function sendPushToEmails(emails: (string | null | undefined)[], message: PushMessage) {
  if (!pushConfigured()) return;
  const wanted = Array.from(new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase())));
  if (wanted.length === 0) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("members")
      .select("user_id, email")
      .eq("status", "approved")
      .is("deleted_at", null)
      .not("user_id", "is", null);
    const userIds = (data ?? [])
      .filter((m) => m.email && wanted.includes(String(m.email).toLowerCase()))
      .map((m) => m.user_id as string);
    await sendPushToUsers(userIds, message);
  } catch (err) {
    console.error("[push] recipient lookup failed:", err);
  }
}

// To the super-admins and everyone who holds this permission (e.g.
// "registrations"), worked out like public.my_permissions() (0122): their
// access profile's permissions (the built-in one for their role when none is
// set) plus their extras. Before 0122, the permission's old member column.
export async function sendPushToPermission(permission: PermissionKey, message: PushMessage) {
  if (!pushConfigured()) return;
  try {
    const admin = createAdminClient();
    const approved = (columns: string) =>
      admin.from("members").select(columns).eq("status", "approved").is("deleted_at", null).not("user_id", "is", null);
    const userIds: string[] = [];

    const [{ data: members, error }, { data: profiles }] = await Promise.all([
      approved("user_id, role, access_profile_id, extra_permissions"),
      admin.from("access_profiles").select("id, base_role, is_builtin, permissions"),
    ]);
    if (!error && profiles) {
      type Profile = { id: string; base_role: string; is_builtin: boolean; permissions: string[] | null };
      const byId = new Map((profiles as Profile[]).map((p) => [p.id, p]));
      const builtin = new Map((profiles as Profile[]).filter((p) => p.is_builtin).map((p) => [p.base_role, p]));
      type Row = { user_id: string; role: string; access_profile_id: string | null; extra_permissions: string[] | null };
      for (const m of (members as unknown as Row[]) ?? []) {
        const profile = (m.access_profile_id && byId.get(m.access_profile_id)) || builtin.get(m.role);
        const holds = [...(m.extra_permissions ?? []), ...(profile?.permissions ?? [])].includes(permission);
        if (m.role === "super_admin" || holds) userIds.push(m.user_id);
      }
    } else {
      const column = PERMISSIONS.find((p) => p.key === permission)?.legacyColumn;
      const { data: legacy } = await approved(`user_id, role${column ? `, ${column}` : ""}`);
      for (const m of (legacy as unknown as Record<string, unknown>[]) ?? []) {
        if (m.role === "super_admin" || (column && m[column])) userIds.push(m.user_id as string);
      }
    }
    await sendPushToUsers(userIds, message);
  } catch (err) {
    console.error(`[push] ${permission} lookup failed:`, err);
  }
}

// To the super-admins, plus anyone in ADMIN_EMAILS: the people the board
// alerts (access requests, low stock) email.
export async function sendPushToSuperAdmins(message: PushMessage) {
  if (!pushConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("members")
      .select("email")
      .eq("role", "super_admin")
      .eq("status", "approved")
      .is("deleted_at", null);
    const envEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim());
    await sendPushToEmails([...(data ?? []).map((m) => m.email as string | null), ...envEmails], message);
  } catch (err) {
    console.error("[push] super-admin lookup failed:", err);
  }
}

// To every device these auth users turned notifications on in.
export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  try {
    setVapid();
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("olb_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", Array.from(new Set(userIds)));
    if (!subs?.length) return 0;

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url ?? "/portal",
      tag: message.tag,
    });
    const gone: string[] = [];
    const sent: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: "normal" },
          );
          sent.push(s.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser unsubscribed or the subscription expired.
          if (status === 404 || status === 410) gone.push(s.id);
          else console.error(`[push] send failed (${status ?? "?"}):`, (err as Error).message);
        }
      }),
    );
    if (gone.length) await admin.from("olb_push_subscriptions").delete().in("id", gone);
    if (sent.length) {
      await admin.from("olb_push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("id", sent);
    }
    return sent.length;
  } catch (err) {
    console.error("[push] send failed:", err);
    return 0;
  }
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://omahalightningbasketball.com")
  );
}
