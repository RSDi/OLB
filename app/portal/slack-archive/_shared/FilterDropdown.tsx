"use client";

import { useEffect, useRef } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";

// Shared popover shell for the search page's channel/user filters and the
// channel page's author filter — the one component this feature shares
// rather than duplicates (everything else here is deliberately siloed per
// file), because the popover mechanics are pixel-identical in both places.
// Mirrors DateJumpCalendar.tsx's click-outside-to-close pattern exactly.
//
// Open/close state is a controlled prop rather than owned internally (unlike
// DateJumpCalendar, which only ever has one instance per page) — callers
// with more than one dropdown need a single source of truth so opening one
// closes the other.
export function FilterDropdown({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onToggle is a stable setter-derived callback; re-subscribing on identity churn isn't needed
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Pill variant="ghost" size="sm" onClick={onToggle}>
        {label}
        {count > 0 ? ` (${count})` : ""}
        <Icons.ChevronDown width={14} height={14} />
      </Pill>

      {open && (
        <div
          className="rsd-card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 21,
            minWidth: 260, maxWidth: 320, padding: 14,
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
