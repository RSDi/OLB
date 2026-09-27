"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";

const SHOW_AFTER_PX = 480;
// `.rsd-app main` is the app shell's real scrolling container (see
// app/globals.css's "Portal app shell" section) — `window`/`document`
// never scroll in this layout, so both the visibility check and the click
// handler target it directly rather than the usual window.scrollY.
const SCROLLER_SELECTOR = ".rsd-app main";

// Floating yellow "back to top" button, mounted once by the portal shell so
// every portal page gets it. It only appears once you've scrolled far enough
// for it to save a real scroll, so short pages never show it.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  // The scroller outlives client navigations, so re-check on each page
  // change instead of trusting the last page's scroll position.
  const pathname = usePathname();

  useEffect(() => {
    const scroller = document.querySelector(SCROLLER_SELECTOR);
    if (!scroller) return;
    const onScroll = () => setVisible(scroller.scrollTop > SHOW_AFTER_PX);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [pathname]);

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
