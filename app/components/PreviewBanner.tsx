"use client";
// The amber bar across the top of every portal page during a "Preview as"
// (lib/activity/preview.ts). Plain link to the exit route: a full page load,
// so every cookie and server component is read afresh on the way out.

import { PREVIEW_EXIT_PATH } from "../../lib/activity/preview-cookie";

export interface PreviewInfo {
  targetName: string;
  impersonatorName: string;
  expiresAt: string;
}

function EyeIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PreviewBanner({ preview }: { preview: PreviewInfo }) {
  const until = new Date(preview.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div
      role="status"
      className="rsd-preview-banner"
      style={{
        height: "var(--rsd-preview-h)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        background: "#F59E0B",
        color: "#1A1305",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <EyeIcon />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Previewing as {preview.targetName} — you&apos;re seeing exactly what they see
        {/* Server and browser clocks format in different time zones. */}
        <span className="rsd-preview-until" style={{ fontWeight: 600 }} suppressHydrationWarning> · ends by itself at {until}</span>
      </span>
      <a
        href={PREVIEW_EXIT_PATH}
        style={{
          flexShrink: 0,
          background: "#1A1305",
          color: "#fff",
          borderRadius: 8,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Exit preview
      </a>
    </div>
  );
}
