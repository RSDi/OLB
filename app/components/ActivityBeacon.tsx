"use client";
// Records portal page views for the activity trail (Activity page, super-
// admins only). Sends only the path (pathname + query) and the time; the
// server works out who from the session cookie (app/api/activity/route.ts).
//
// Views are batched: flushed 300ms after the last one, at 25, and whenever
// the tab is hidden or closed. navigator.sendBeacon survives the page going
// away; fetch with keepalive is the fallback.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ENDPOINT = "/api/activity";
const FLUSH_MS = 300;
const MAX_QUEUE = 25;

type QueuedView = { path: string; ts: number };

let queue: QueuedView[] = [];
let lastPath = "";
let timer: ReturnType<typeof setTimeout> | undefined;

function send(body: unknown) {
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, headers: { "content-type": "application/json" } }).catch(
    () => {}
  );
}

function flush() {
  clearTimeout(timer);
  timer = undefined;
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  send({ events });
}

function record() {
  const path = window.location.pathname + window.location.search;
  if (path === lastPath || !path.startsWith("/portal")) return;
  lastPath = path;
  queue.push({ path, ts: Date.now() });
  if (queue.length >= MAX_QUEUE) flush();
  else {
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_MS);
  }
}

// Tells the trail this browser is signing out, before the session goes.
export async function recordSignOut(): Promise<void> {
  flush();
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ logout: true }),
      headers: { "content-type": "application/json" },
    });
  } catch {
    // never block signing out
  }
}

export function ActivityBeacon() {
  const pathname = usePathname();

  // Next's soft navigations (and query-only changes like ?u=…) go through
  // history.pushState/replaceState, which fire no event — so wrap them.
  useEffect(() => {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const patchedPush: typeof history.pushState = function (this: History, ...args) {
      origPush.apply(this, args);
      record();
    };
    const patchedReplace: typeof history.replaceState = function (this: History, ...args) {
      origReplace.apply(this, args);
      record();
    };
    history.pushState = patchedPush;
    history.replaceState = patchedReplace;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("popstate", record);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (history.pushState === patchedPush) history.pushState = origPush;
      if (history.replaceState === patchedReplace) history.replaceState = origReplace;
      window.removeEventListener("popstate", record);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  // Backup for navigations the patch misses, and the first page load.
  useEffect(() => {
    record();
  }, [pathname]);

  return null;
}
