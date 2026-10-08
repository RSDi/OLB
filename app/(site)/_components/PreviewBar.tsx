"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Shown while an editor previews unpublished changes from Settings → Website
// (draft mode). Fixed to the bottom, so the page lays out as it will live.
export function PreviewBar({ changes }: { changes: number }) {
  const pathname = usePathname();
  const exit = `/api/website/preview/exit?path=${encodeURIComponent(pathname)}`;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1000,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px 16px",
        padding: "10px 16px",
        borderRadius: 12,
        background: "#111",
        color: "#fff",
        fontSize: 14,
        lineHeight: 1.4,
        boxShadow: "0 6px 24px rgba(0,0,0,.3)",
      }}
    >
      <span>
        <strong style={{ color: "#fbcb43" }}>Preview.</strong>{" "}
        {changes === 0
          ? "No unpublished changes: this is the live site."
          : `Showing ${changes} unpublished change${changes === 1 ? "" : "s"}. Visitors don't see ${changes === 1 ? "it" : "them"} yet.`}
      </span>
      <span style={{ display: "flex", gap: 14 }}>
        <Link href="/portal/settings?tab=website" style={{ color: "#fbcb43", fontWeight: 700 }}>
          Publish in Settings
        </Link>
        {/* A full request, so the route handler can clear the preview cookie. */}
        <a href={exit} style={{ color: "#fff", fontWeight: 700 }}>
          Exit preview
        </a>
      </span>
    </div>
  );
}
