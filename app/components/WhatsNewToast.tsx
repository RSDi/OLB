"use client";
// Bottom-right "What's new" card on every portal page: releases newer than
// this member's seen-marker. Opening Settings → Release Notes, or dismissing
// the card, marks them seen (members.releases_seen_version).

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";
import { loadReleasesSeen } from "../../lib/release-notes/actions";
import { RELEASES_SEEN_EVENT, unseenReleases, type Release } from "../../lib/release-notes/model";
import { RELEASES } from "../../lib/release-notes/releases";
import { markReleasesSeen } from "../../lib/release-notes/seen";

export function WhatsNewToast({ onOpen }: { onOpen: () => void }) {
  const pathname = usePathname();
  const [whatsNew, setWhatsNew] = useState<Release[]>([]);

  useEffect(() => {
    let alive = true;
    let cleared = false;
    const clear = () => {
      cleared = true;
      setWhatsNew([]);
    };
    window.addEventListener(RELEASES_SEEN_EVENT, clear);
    const onNotes =
      pathname === "/portal/settings" &&
      new URLSearchParams(window.location.search).get("tab") === "release_notes";
    if (!onNotes) {
      loadReleasesSeen()
        .then((seen) => {
          if (alive && !cleared) setWhatsNew(unseenReleases(RELEASES, seen));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
      window.removeEventListener(RELEASES_SEEN_EVENT, clear);
    };
  }, [pathname]);

  if (whatsNew.length === 0) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1250,
        width: 340,
        maxWidth: "calc(100vw - 40px)",
        background: "var(--gw-bg)",
        border: "1px solid var(--gw-border)",
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,.25)",
        padding: "14px 16px",
        animation: "rsd-pop-in 180ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".03em",
            padding: "2px 8px",
            borderRadius: 999,
            background: "color-mix(in srgb, var(--rsd-accent) 15%, transparent)",
            color: "var(--rsd-accent)",
          }}
        >
          {whatsNew[0].version}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--gw-fg-muted)",
          }}
        >
          What&apos;s new
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            void markReleasesSeen();
          }}
          style={{
            display: "flex",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--gw-fg-muted)",
            padding: 2,
          }}
        >
          <Icons.X width={14} height={14} />
        </button>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 700,
          color: "var(--gw-fg)",
          lineHeight: 1.4,
        }}
      >
        {whatsNew[0].title}
      </div>
      {whatsNew.length > 1 && (
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: "var(--gw-fg-muted)" }}>
          + {whatsNew.length - 1} earlier update{whatsNew.length > 2 ? "s" : ""}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="gw-press"
        style={{
          marginTop: 10,
          width: "100%",
          minHeight: 36,
          padding: "7px 0",
          border: "1px solid var(--gw-border)",
          borderRadius: 8,
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        See release notes
      </button>
    </div>
  );
}
