"use client";
// A popover that hangs off its trigger's left (or right) edge, or is centred
// under it, can run off the side of a phone when the trigger sits near an
// edge. Once it's open, slide it back to `margin` px from the edge.
//
// Uses the CSS `translate` property rather than `transform`, so it adds to
// whatever transform the popover already has (a translateX(-50%) centring, a
// pop-in animation) instead of replacing it.

import { useLayoutEffect, type RefObject } from "react";

export function useKeepInView(ref: RefObject<HTMLElement | null>, open: boolean, margin = 16) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    function fit() {
      if (!el) return;
      el.style.translate = "";
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      let dx = 0;
      if (r.right > vw - margin) dx = vw - margin - r.right;
      if (r.left + dx < margin) dx = margin - r.left;
      if (dx) el.style.translate = `${Math.round(dx)}px 0`;
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, open, margin]);
}
