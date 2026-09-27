"use client";

import { useEffect, useState } from "react";
import { Icons } from "../../../components/icons";

const SHOW_AFTER_PX = 480;
// `.rsd-app main` is the app shell's real scrolling container (see
// app/globals.css's "Portal app shell" section) — `window`/`document`
// never scroll in this layout, so both the visibility check and the click
// handler target it directly rather than the usual window.scrollY.
const SCROLLER_SELECTOR = ".rsd-app main";

// Floating "back to top" button for this feature's long list pages (a
// channel's full message history, search results, the exceptions list) —
// appears once you've scrolled far enough for it to actually save a real
// scroll. Shared across those pages since the behavior is identical, unlike
// the rest of this feature's deliberately-duplicated-per-page convention.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scroller = document.querySelector(SCROLLER_SELECTOR);
    if (!scroller) return;
    const onScroll = () => setVisible(scroller.scrollTop > SHOW_AFTER_PX);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => document.querySelector(SCROLLER_SELECTOR)?.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      className="gw-press"
      style={{
        position: "fixed",
        right: "calc(20px + env(safe-area-inset-right, 0px))",
        bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        zIndex: 10,
        width: 42, height: 42, borderRadius: "50%",
        background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)",
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,.25)",
      }}
    >
      <Icons.ChevronUp width={20} height={20} />
    </button>
  );
}
