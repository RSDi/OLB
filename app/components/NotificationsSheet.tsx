"use client";
// The Notifications sheet (sidebar → Notifications): turns push
// notifications on or off for this browser or device, and sends a test.
// The service worker is public/sw.js; the server side is
// lib/notifications/push-actions.ts.

import { useEffect, useState } from "react";
import { SideSheet } from "./SideSheet";
import { Pill } from "./ui";
import { removePushSubscription, savePushSubscription, sendTestPush } from "../../lib/notifications/push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State =
  | "checking"
  | "not-set-up"   // the server has no VAPID key yet
  | "ios-install"  // iPhone/iPad in Safari: push only works from the Home Screen app
  | "unsupported"
  | "blocked"      // the person said no; only browser settings can undo it
  | "off"
  | "on";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// Signing out stops this device's notifications, so a shared phone or
// computer doesn't keep getting someone else's.
export async function turnOffPushOnThisDevice(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await removePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // Best effort.
  }
}

async function detectState(): Promise<State> {
  if (!VAPID_PUBLIC_KEY) return "not-set-up";
  if (!pushSupported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const sub = await currentSubscription().catch(() => null);
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    detectState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription(json, navigator.userAgent);
      if ("error" in res) {
        await sub.unsubscribe().catch(() => {});
        setMessage({ tone: "error", text: res.error });
        return;
      }
      setState("on");
      setMessage({ tone: "ok", text: "Notifications are on. Tap Send a test to try it." });
    } catch {
      setMessage({ tone: "error", text: "Couldn't turn on notifications in this browser. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    await turnOffPushOnThisDevice();
    setState("off");
    setMessage({ tone: "ok", text: "Notifications are off on this device." });
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    const res = await sendTestPush().catch(() => ({ error: "Couldn't send a test. Try again." }));
    setMessage("error" in res ? { tone: "error", text: res.error } : { tone: "ok", text: "Sent. It should appear in a few seconds." });
    setBusy(false);
  }

  const footer =
    state === "on" ? (
      <>
        <Pill variant="ghost" onClick={turnOff} disabled={busy}>Turn off</Pill>
        <Pill variant="dark" onClick={test} disabled={busy}>Send a test</Pill>
      </>
    ) : state === "off" ? (
      <Pill variant="dark" onClick={turnOn} disabled={busy}>Turn on notifications</Pill>
    ) : undefined;

  return (
    <SideSheet eyebrow="This device" title="Notifications" busy={busy} width={440} onClose={onClose} footer={footer} tour="notifications-sheet">
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--gw-fg-muted)" }}>
        Get a notification on this phone or computer when something needs you: an answer on your request, a new task for
        your team, new registrations if you handle them, and, for super-admins, new access requests and low supplies. You still get the emails too.
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, fontWeight: 700 }}>{statusText(state)}</p>
      {message && (
        <p
          role="status"
          style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: message.tone === "error" ? "var(--gw-error)" : "var(--gw-fg-muted)" }}
        >
          {message.text}
        </p>
      )}
    </SideSheet>
  );
}

function statusText(state: State): string {
  switch (state) {
    case "checking":
      return "Checking this device…";
    case "not-set-up":
      return "Notifications aren't set up for the portal yet.";
    case "ios-install":
      return "On an iPhone or iPad, add the portal to your Home Screen first (Share → Add to Home Screen), open it from there, then come back here.";
    case "unsupported":
      return "This browser can't show notifications. Try Chrome, Edge or Safari.";
    case "blocked":
      return "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back here.";
    case "off":
      return "Notifications are off on this device.";
    case "on":
      return "Notifications are on for this device.";
  }
}
