"use client";
// Modal command-palette search. Used on smaller viewports (mobile + medium
// desktop). Larger viewports use the inline `TopbarSearch` instead.
//
// Driven by Cmd/Ctrl-K (handled in PortalShell). Keyboard:
//   - Esc closes
//   - ↑/↓ moves the highlight
//   - Enter navigates to the highlighted hit
//
// Mobile (<768px) renders as a full-screen sheet; tablet/medium desktop
// renders as a centered card over a backdrop.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "./icons";
import { useGlobalSearch } from "../../lib/search/useGlobalSearch";
import { SearchPanel, useRecentSearches } from "./search/SearchPanel";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const { flat, groupStarts, loading } = useGlobalSearch(query, open);
  const { recent, pushRecent, clearRecent } = useRecentSearches();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Reset state when closing; autofocus when opening.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setFocused(0);
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Reset highlight when results change (and clamp on shrink).
  useEffect(() => {
    setFocused(i => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const handleSelect = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) pushRecent(trimmed);
    onClose();
  }, [query, pushRecent, onClose]);

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, flat, focused, router, onClose, handleSelect]);

  // Keep the highlighted row in view when arrow keys push it offscreen.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-hit-index="${focused}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  if (!open) return null;

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderBottom: "1px solid var(--gw-border)",
      }}
    >
      <span style={{ display: "flex", color: "var(--gw-fg-muted)", flexShrink: 0 }}>
        <Icons.Search width={18} height={18} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members, requests, events, playbooks…"
        autoComplete="off"
        spellCheck={false}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--gw-fg)",
          padding: 0,
          minWidth: 0,
        }}
      />
      <button
        onClick={onClose}
        aria-label="Close search"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 8,
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg-muted)",
          cursor: "pointer",
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {isMobile ? <Icons.X width={14} height={14} /> : "Esc"}
      </button>
    </div>
  );

  const panel = (
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
        requestAnimationFrame(() => inputRef.current?.focus());
      }}
      onClearRecent={clearRecent}
      listRef={listRef}
    />
  );

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1400,
          background: "var(--gw-bg)",
          display: "flex",
          flexDirection: "column",
          animation: "gw-fade-in 160ms ease",
        }}
      >
        {header}
        {panel}
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "10vh 20px 20px",
        animation: "gw-fade-in 160ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 640,
          maxHeight: "70vh",
          background: "var(--gw-bg)",
          border: "1px solid var(--gw-border)",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,.35)",
          overflow: "hidden",
        }}
      >
        {header}
        {panel}
      </div>
    </div>
  );
}
