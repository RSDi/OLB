"use client";
// Records page views on the public site for Settings → Website Activity.
// Sends only the path (pathname + query), the time and, for the first page of
// a page load, the referrer; the server keeps the anonymous visitor ids in
// cookies (app/api/website-activity/route.ts).
//
// Batched like the portal's ActivityBeacon: flushed 300ms after the last
// view, at 25, and whenever the tab is hidden or closed.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ENDPOINT = "/api/website-activity";
const FLUSH_MS = 300;
const MAX_QUEUE = 25;

type QueuedView = { path: string; ts: number; ref?: string };

let queue: QueuedView[] = [];
let lastPath = "";
// The referrer only means something for the page the browser loaded; after
// that, moving around is on this site.
let firstView = true;
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
  if (path === lastPath) return;
  lastPath = path;
  queue.push(firstView && document.referrer ? { path, ts: Date.now(), ref: document.referrer } : { path, ts: Date.now() });
  firstView = false;
  if (queue.length >= MAX_QUEUE) flush();
  else {
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_MS);
  }
}

export function WebsiteBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("popstate", record);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("popstate", record);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  // The first page load and every move between pages. Query-only changes
  // aren't pages of their own here.
  useEffect(() => {
    record();
  }, [pathname]);

  return null;
}
