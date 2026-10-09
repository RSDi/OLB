"use server";

// Turning push notifications on and off for this browser or device, and the
// test notification (the Notifications sheet in the portal sidebar). Saves
// with the service role so a device that someone else turned on moves to
// whoever turns it on now (endpoint is unique, 0128).

import { getViewer } from "../auth/viewer";
import { createAdminClient } from "../supabase/admin";
import { pushConfigured, sendPushToUsers } from "./push";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

type Result = { success: true } | { error: string };

function validSubscription(sub: PushSubscriptionInput): boolean {
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return false;
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    sub.endpoint.length <= 2000 &&
    typeof sub.keys.p256dh === "string" && sub.keys.p256dh.length > 0 && sub.keys.p256dh.length <= 200 &&
    typeof sub.keys.auth === "string" && sub.keys.auth.length > 0 && sub.keys.auth.length <= 100
  );
}

export async function savePushSubscription(sub: PushSubscriptionInput, userAgent?: string): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer || viewer.status !== "approved") return { error: "Sign in to turn on notifications." };
  if (!pushConfigured()) return { error: "Notifications aren't set up on the server yet." };
  if (!validSubscription(sub)) return { error: "This browser sent a subscription we can't use." };

  const admin = createAdminClient();
  const { error } = await admin.from("olb_push_subscriptions").upsert(
    {
      user_id: viewer.userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent?.slice(0, 500) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("[push] save failed:", error.message);
    return { error: "Couldn't turn on notifications. Try again." };
  }
  return { success: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return { success: true };
  if (!pushConfigured()) return { success: true };
  const admin = createAdminClient();
  await admin.from("olb_push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", viewer.userId);
  return { success: true };
}

export async function sendTestPush(): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer || viewer.status !== "approved") return { error: "Sign in to send a test." };
  if (!pushConfigured()) return { error: "Notifications aren't set up on the server yet." };
  const sent = await sendPushToUsers([viewer.userId], {
    title: "OLB - Portal",
    body: "Notifications are working on this device.",
    url: "/portal",
    tag: "test",
  });
  return sent > 0 ? { success: true } : { error: "Couldn't reach this device. Turn notifications off and on again." };
}
