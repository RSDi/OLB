"use client";
// What every TV screen needs: the 1920×1080 stage scaled to the screen, and
// the screen kept awake where the browser allows it.

import { useEffect, useRef, useState } from "react";

const W = 1920;
const H = 1080;

// Returns the ref to put on the stage.
export function useFitStage() {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (!el) return;
      const k = Math.min(window.innerWidth / W, window.innerHeight / H);
      el.style.transform = `translate(-50%, -50%) scale(${k})`;
      el.style.opacity = "1";
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return stage;
}

export function useWakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    let lock: Lock | null = null;
    const ask = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      lock?.release().catch(() => {});
    };
  }, []);
}

// Full screen with no browser bars. Browsers only allow it after a press, so
// any key (OK on a Fire TV remote) or click asks for it. Returns whether to
// show the "press OK" hint: until it's full screen, or the browser can't.
export function useFullscreenOnPress(): boolean {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (!root.requestFullscreen) return;
    const sync = () => setHint(!document.fullscreenElement);
    const go = () => {
      if (!document.fullscreenElement) root.requestFullscreen().catch(() => {});
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", go);
    window.addEventListener("pointerdown", go);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
    };
  }, []);
  return hint;
}
