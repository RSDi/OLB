"use client";
// Inline topbar search input for large viewports. Replaces the click-to-open
// pill on ≥1024px with a real `<input>` element. Results render as a
// dropdown anchored beneath the input.
//
// Shares the same data layer + visual primitives as the modal — both
// surfaces use `useGlobalSearch()` and `<SearchPanel>`.
//
// Cmd/Ctrl-K (handled in PortalShell) focuses this input. Esc clears the
// query and blurs.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icons } from "./icons";
import { useGlobalSearch } from "../../lib/search/useGlobalSearch";
import { SearchPanel, useRecentSearches } from "./search/SearchPanel";

export interface TopbarSearchHandle {
  focus: () => void;
}

export const TopbarSearch = forwardRef<TopbarSearchHandle>(function TopbarSearch(
  _props,
  ref
) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(0);
  const [open, setOpen] = useState(false);
  const { flat, groupStarts, loading } = useGlobalSearch(query, open);
  const { recent, pushRecent, clearRecent } = useRecentSearches();

  // PortalShell uses this to focus on Cmd+K.
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  // Open the dropdown whenever the input is focused; close it when focus
  // leaves the wrapper entirely (allowing a result link click to land
  // before close fires).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reset highlight on result changes.
  useEffect(() => {
    setFocused(i => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const handleSelect = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) pushRecent(trimmed);
    setOpen(false);
    inputRef.current?.blur();
  }, [query, pushRecent]);

  // Keyboard navigation, scoped to the input.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocused(i => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocused(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = flat[focused];
      if (!hit) return;
      e.preventDefault();
      router.push(hit.href);
      handleSelect();
    }
  };

  // Scroll-into-view for arrow-key navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-hit-index="${focused}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        flex: 1,
        maxWidth: 480,
        minWidth: 0,
      }}
    >
      {/* Input shell — looks like the existing pill but is a real input.
          Sits on the black top bar, so it uses the frame tokens; the focus
          ring and placeholder color are .rsd-topbar-search in globals.css. */}
      <div
        className="rsd-topbar-search"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 36,
          padding: "0 10px 0 12px",
          borderRadius: 100,
          background: "var(--rsd-frame-2)",
          border: "1px solid var(--rsd-frame-line)",
          color: "var(--rsd-frame-fg-3)",
        }}
      >
        <Icons.Search width={14} height={14} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search members, requests, events, playbooks"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--rsd-frame-fg)",
            padding: 0,
            minWidth: 0,
          }}
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: 100,
              border: "none",
              background: "transparent",
              color: "var(--rsd-frame-fg-3)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Icons.X width={12} height={12} />
          </button>
        ) : (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 28,
              height: 22,
              padding: "0 6px",
              borderRadius: 6,
              border: "1px solid var(--rsd-frame-line)",
              background: "var(--rsd-frame)",
              color: "var(--rsd-frame-fg-3)",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            <PlatformHint />
          </span>
        )}
      </div>

      {/* Floating dropdown — only when input is focused/active. */}
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            maxHeight: "60vh",
            background: "var(--gw-bg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            boxShadow: "0 16px 48px rgba(0,0,0,.25)",
            overflow: "hidden",
            zIndex: 1300,
          }}
        >
          <SearchPanel
            query={query}
            loading={loading}
            flat={flat}
            groupStarts={groupStarts}
            focused={focused}
            onFocus={setFocused}
            onSelect={handleSelect}
            recent={recent}
            onPickRecent={(q) => {
              setQuery(q);
              inputRef.current?.focus();
            }}
            onClearRecent={clearRecent}
            listRef={listRef}
          />
        </div>
      )}
    </div>
  );
});

function PlatformHint() {
  const [hint, setHint] = useState<string>("⌘K");
  useEffect(() => {
    const ua = navigator.userAgent || navigator.platform || "";
    setHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "⌘K" : "Ctrl K");
  }, []);
  return <>{hint}</>;
}
