"use client";
// Command-palette search.
//
// Driven by Cmd/Ctrl-K (handled in PortalShell) — calls the Postgres
// `search_global` RPC directly from the browser client. RLS gates the
// rows each viewer can see, so no extra permission wiring is needed here.
//
// Keyboard model:
//   - Esc closes
//   - ↑/↓ moves the highlight
//   - Enter navigates to the highlighted hit
//
// Mobile (<768px) renders as a full-screen sheet; desktop as a centered
// card over a backdrop. The two share the same internal layout.

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "./icons";
import { createClient } from "../../lib/supabase/client";

type EntityType =
  | "member"
  | "maintenance"
  | "pm_task"
  | "pm_template"
  | "asset"
  | "event"
  | "playbook";

interface SearchHit {
  entity_type: EntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  rank: number;
}

interface EntityMeta {
  groupLabel: string;
  icon: (props: { width?: number; height?: number }) => React.ReactElement;
}

const ENTITY_META: Record<EntityType, EntityMeta> = {
  member:      { groupLabel: "Members",       icon: Icons.Users },
  maintenance: { groupLabel: "Maintenance",   icon: Icons.Wrench },
  pm_task:     { groupLabel: "PM tasks",      icon: Icons.Clock },
  pm_template: { groupLabel: "PM templates",  icon: Icons.Clock },
  asset:       { groupLabel: "Assets",        icon: Icons.Wrench },
  event:       { groupLabel: "Events",        icon: Icons.Calendar },
  playbook:    { groupLabel: "Playbooks",     icon: Icons.BookOpen },
};

// Order groups display in the result list. Members + Maintenance + Events
// + Playbooks sit on top because they're the most common targets; PM
// internals trail.
const GROUP_ORDER: EntityType[] = [
  "member",
  "maintenance",
  "event",
  "playbook",
  "pm_task",
  "pm_template",
  "asset",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Track mobile breakpoint so we can render the full-screen sheet variant.
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
      setResults([]);
      setFocused(0);
      setLoading(false);
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Debounced search. Each keystroke schedules a fetch 250ms later; a newer
  // keystroke cancels the prior timer and aborts the in-flight request.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .rpc("search_global", { q: trimmed, max_total: 25 })
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) {
          console.error("[GlobalSearch] rpc error", error);
          setResults([]);
        } else {
          setResults(((data ?? []) as SearchHit[]));
          setFocused(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  // Group results by entity type using the canonical order, and produce a
  // flat list of hits the keyboard navigation can index into.
  const { flat, groupStarts } = useMemo(() => {
    const byType = new Map<EntityType, SearchHit[]>();
    for (const hit of results) {
      const list = byType.get(hit.entity_type) ?? [];
      list.push(hit);
      byType.set(hit.entity_type, list);
    }
    const flat: SearchHit[] = [];
    const groupStarts: { hitIndex: number; type: EntityType }[] = [];
    for (const type of GROUP_ORDER) {
      const items = byType.get(type);
      if (!items?.length) continue;
      groupStarts.push({ hitIndex: flat.length, type });
      flat.push(...items);
    }
    return { flat, groupStarts };
  }, [results]);

  // Clamp focus when the result list shrinks.
  useEffect(() => {
    setFocused(i => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  // Keyboard navigation. Attached to the document so Esc works even if the
  // input lost focus somehow.
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
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, flat, focused, router, onClose]);

  // Keep the highlighted row in view when arrow keys push it offscreen.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-hit-index="${focused}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  if (!open) return null;

  const showEmpty =
    !loading && query.trim().length >= 2 && flat.length === 0;
  const showHint = query.trim().length < 2;

  // Shared inner layout.
  const inner = (
    <>
      {/* Search input */}
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

      {/* Result list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: flat.length ? "6px 0" : 0,
        }}
      >
        {showHint && (
          <EmptyState
            primary="Type to search"
            secondary="Members, maintenance, events, PM, playbooks — at least 2 characters."
          />
        )}
        {showEmpty && (
          <EmptyState
            primary={`No results for "${query.trim()}"`}
            secondary="Try a different spelling or fewer words."
          />
        )}
        {flat.map((hit, i) => {
          const group = groupStarts.find((g) => g.hitIndex === i);
          return (
            <Fragment key={`${hit.entity_type}-${hit.id}`}>
              {group && <GroupHeader label={ENTITY_META[group.type].groupLabel} />}
              <ResultRow
                hit={hit}
                focused={i === focused}
                onMouseEnter={() => setFocused(i)}
                onSelect={onClose}
                hitIndex={i}
              />
            </Fragment>
          );
        })}
      </div>
    </>
  );

  // Mobile: full-screen sheet, no backdrop.
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
        {inner}
      </div>
    );
  }

  // Desktop: centered card on translucent backdrop.
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
        {inner}
      </div>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px 18px 4px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--gw-fg-muted)",
      }}
    >
      {label}
    </div>
  );
}

function ResultRow({
  hit,
  focused,
  onMouseEnter,
  onSelect,
  hitIndex,
}: {
  hit: SearchHit;
  focused: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
  hitIndex: number;
}) {
  const Icon = ENTITY_META[hit.entity_type].icon;
  return (
    <Link
      href={hit.href}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      data-hit-index={hitIndex}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        textDecoration: "none",
        color: "var(--gw-fg)",
        background: focused ? "var(--gw-bg-elev)" : "transparent",
        borderLeft: focused
          ? "3px solid var(--rsd-accent)"
          : "3px solid transparent",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg-muted)",
          flexShrink: 0,
        }}
      >
        <Icon width={14} height={14} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.3,
          }}
        >
          {hit.title || "Untitled"}
        </div>
        {hit.subtitle && (
          <div
            style={{
              fontSize: 11,
              color: "var(--gw-fg-muted)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {hit.subtitle}
          </div>
        )}
      </div>
      <span
        style={{
          color: "var(--gw-fg-muted)",
          display: "flex",
          flexShrink: 0,
          opacity: focused ? 1 : 0,
          transition: "opacity 120ms",
        }}
      >
        <Icons.ChevronRight width={14} height={14} />
      </span>
    </Link>
  );
}

function EmptyState({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--gw-fg-muted)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
        {primary}
      </div>
      <div style={{ fontSize: 12, marginTop: 6, fontWeight: 500 }}>
        {secondary}
      </div>
    </div>
  );
}
