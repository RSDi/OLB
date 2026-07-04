"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";

export interface ChannelSwitcherItem {
  slackChannelId: string;
  label: string;
  active: boolean;
}

// Lets a super admin jump straight to another registered channel instead of
// backing out to "All channels" first. Owns its own open state (unlike
// FilterDropdown, which needs a controlled prop so only one of several
// dropdowns in the same sticky bar is open at a time) — only one of these
// ever exists per page, same as DateJumpCalendar, so self-contained state is
// enough. Shares the filter dropdowns' popover panel styling (position,
// mobile bottom-sheet override) via the same `rsd-slack-popover-panel` class.
export function ChannelSwitcher({
  channels,
  currentChannelId,
}: {
  channels: ChannelSwitcherItem[];
  currentChannelId: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = channels.find((c) => c.slackChannelId === currentChannelId);

  function go(slackChannelId: string) {
    setOpen(false);
    if (slackChannelId !== currentChannelId) {
      router.push(`/portal/slack-archive/${encodeURIComponent(slackChannelId)}`);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="gw-press"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: "var(--gw-fg-muted)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", margin: 0 }}>
          {current?.label ?? currentChannelId}
        </h1>
        <Icons.ChevronDown width={18} height={18} />
      </button>

      {open && (
        <div className="rsd-card rsd-slack-popover-panel" style={{ padding: 6, minWidth: 220 }}>
          {channels.map((c) => {
            const isCurrent = c.slackChannelId === currentChannelId;
            return (
              <button
                key={c.slackChannelId}
                type="button"
                onClick={() => go(c.slackChannelId)}
                className="gw-press"
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "9px 10px", borderRadius: 8, border: "none",
                  background: isCurrent ? "var(--gw-bg-elev)" : "transparent",
                  cursor: "pointer", fontSize: 13.5, fontWeight: isCurrent ? 700 : 600,
                  color: c.active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                }}
              >
                {c.label}
                {!c.active && <span style={{ fontWeight: 500 }}> (inactive)</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
