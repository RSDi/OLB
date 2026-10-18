"use client";

import { useEffect, useRef } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthJumpEntry {
  key: string; // "2025-09", matches the album section's anchor
  year: number;
  month: number; // 1–12
  count: number;
}

// Year-by-year month grid for jumping around a long album. Every month is
// shown so each year reads as a calendar; months with nothing in the
// current results are disabled. Open state is controlled by the album, like
// FilterDropdown, so opening this closes the channel/people pickers. Shares
// their popover panel class for positioning and the mobile bottom sheet.
export function MonthJump({
  entries,
  open,
  onOpenChange,
  onJump,
}: {
  entries: MonthJumpEntry[];
  open: boolean;
  onOpenChange: () => void;
  onJump: (key: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOpenChange is a stable setter-derived callback, same as FilterDropdown
  }, [open]);

  // Years in the album's current display order (newest-first or oldest-first).
  const years: { year: number; counts: Map<number, { key: string; count: number }> }[] = [];
  for (const e of entries) {
    let y = years.find((entry) => entry.year === e.year);
    if (!y) {
      y = { year: e.year, counts: new Map() };
      years.push(y);
    }
    y.counts.set(e.month, { key: e.key, count: e.count });
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Pill variant="ghost" size="sm" onClick={onOpenChange} disabled={entries.length === 0}>
        <Icons.Calendar width={14} height={14} /> Jump to month
      </Pill>

      {open && (
        <div className="rsd-card rsd-slack-popover-panel rsd-album-jump">
          {years.map((y) => (
            <div key={y.year} className="rsd-album-jump-year">
              <div className="rsd-album-jump-year-label">{y.year}</div>
              <div className="rsd-album-jump-months">
                {MONTH_ABBR.map((abbr, i) => {
                  const entry = y.counts.get(i + 1);
                  return (
                    <button
                      key={abbr}
                      type="button"
                      disabled={!entry}
                      onClick={() => entry && onJump(entry.key)}
                      title={entry ? `${entry.count} item${entry.count === 1 ? "" : "s"}` : undefined}
                      className="gw-press"
                    >
                      {abbr}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
