"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";

// Shared searchable multi-select popover for the search page's channel/user
// filters and the channel page's author filter — the one component this
// feature shares rather than duplicates (everything else here is
// deliberately siloed per file), because the popover mechanics, chip
// rendering, and toggle logic are pixel-identical in all three places.
// Mirrors DateJumpCalendar.tsx's click-outside-to-close pattern exactly.
//
// Open/close state is a controlled prop rather than owned internally (unlike
// DateJumpCalendar, which only ever has one instance per page) — callers
// with more than one dropdown need a single source of truth so opening one
// closes the other.
export interface FilterDropdownItem {
  id: string;
  label: string;
  count?: number;
}

export function FilterDropdown({
  label,
  items,
  selected,
  onChange,
  open,
  onOpenChange,
  searchPlaceholder,
  hint,
  emptyMessage,
}: {
  label: string;
  items: FilterDropdownItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  open: boolean;
  onOpenChange: () => void;
  searchPlaceholder: string;
  hint?: React.ReactNode;
  emptyMessage?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset the search box on close, so reopening starts fresh — done as a
  // render-time adjustment (React's documented pattern for resetting state
  // when a value changes: https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than an effect, since that would fire an extra commit after the
  // one that already closed the panel.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open && searchTerm) setSearchTerm("");
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOpenChange is a stable setter-derived callback; re-subscribing on identity churn isn't needed
  }, [open]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const filtered = searchTerm.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : items;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Pill variant="ghost" size="sm" onClick={onOpenChange}>
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""}
        <Icons.ChevronDown width={14} height={14} />
      </Pill>

      {open && (
        <div
          className="rsd-card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 21,
            minWidth: 280, maxWidth: 340, padding: 14,
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          }}
        >
          {hint && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", marginBottom: 8 }}>
              {hint}
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              {emptyMessage ?? "No options available."}
            </div>
          ) : (
            <>
              <input
                autoFocus
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: "100%", height: 34, padding: "0 10px", marginBottom: 10,
                  border: "1px solid var(--gw-border)", borderRadius: 8, fontSize: 13,
                  color: "var(--gw-fg)", background: "var(--gw-bg)", outline: "none",
                }}
              />
              {filtered.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                  No matches for &ldquo;{searchTerm.trim()}&rdquo;.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                  {filtered.map((item) => {
                    const active = selected.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item.id)}
                        className="gw-press"
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 100,
                          background: active ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
                          color: active ? "var(--rsd-accent-on)" : "var(--gw-fg)",
                          border: `1px solid ${active ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                          cursor: "pointer",
                        }}
                      >
                        {item.label}
                        {item.count !== undefined && <span style={{ opacity: 0.7 }}> ({item.count})</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
