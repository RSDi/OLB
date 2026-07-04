"use client";

import { useEffect } from "react";
import { Icons } from "../../../components/icons";

// Plays a video attachment in an overlay above the current page instead of
// navigating to it in a new tab — closing it lands you right back where you
// were in the message thread, scroll position and all.
export function VideoModal({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video"
          className="gw-press"
          style={{
            position: "absolute", top: -40, right: 0,
            background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 6,
          }}
        >
          <Icons.X width={22} height={22} />
        </button>
        <video
          src={src}
          controls
          autoPlay
          style={{ display: "block", maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8, background: "#000" }}
        />
        <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12.5, marginTop: 8, textAlign: "center" }}>{title}</div>
      </div>
    </div>
  );
}
