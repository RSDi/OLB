"use client";
// Result panel shared by the search modal (`GlobalSearch`) and the inline
// topbar input (`TopbarSearch`). Owns the visual layout below the input:
// loading bar, recent-searches state, hint state, empty state, and the
// flat list of grouped hits.
//
// State (query, results, focused index, recents) is kept by the parent so
// each surface can wire its own keyboard model and dismiss behavior.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../icons";
import type { EntityType, SearchHit } from "../../../lib/search/useGlobalSearch";

const RECENT_KEY = "mcc-search-recent";
const RECENT_MAX = 5;

interface EntityMeta {
  groupLabel: string;
  icon: (props: { width?: number; height?: number }) => React.ReactElement;
}

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  member:      { groupLabel: "Members",       icon: Icons.Users },
  contact:     { groupLabel: "Contacts",      icon: Icons.Briefcase },
  maintenance: { groupLabel: "Maintenance",   icon: Icons.Wrench },
  pm_task:     { groupLabel: "PM tasks",      icon: Icons.Clock },
  pm_template: { groupLabel: "PM templates",  icon: Icons.Clock },
  asset:       { groupLabel: "Assets",        icon: Icons.Wrench },
  event:       { groupLabel: "Events",        icon: Icons.Calendar },
  playbook:    { groupLabel: "Playbooks",     icon: Icons.BookOpen },
};

interface PanelProps {
  query: string;
  loading: boolean;
  flat: SearchHit[];
  groupStarts: { hitIndex: number; type: EntityType }[];
  focused: number;
  onFocus: (i: number) => void;
  onSelect: () => void;
  recent: string[];
  onPickRecent: (q: string) => void;
  onClearRecent: () => void;
  listRef?: React.RefObject<HTMLDivElement | null>;
}

export function SearchPanel({
  query,
  loading,
  flat,
  groupStarts,
  focused,
  onFocus,
  onSelect,
  recent,
  onPickRecent,
  onClearRecent,
  listRef,
}: PanelProps) {
  const trimmed = query.trim();
  const showEmpty = !loading && trimmed.length >= 2 && flat.length === 0;
  const showHint = trimmed.length < 2;
  const showRecent = showHint && recent.length > 0;

  return (
    <>
      <LoadingBar visible={loading} />
      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: flat.length || showRecent ? "6px 0" : 0,
        }}
      >
        {showRecent && (
          <RecentList
            recent={recent}
            onPick={onPickRecent}
            onClear={onClearRecent}
          />
        )}
        {showHint && !showRecent && (
          <EmptyState
            primary="Type to search"
            secondary="Members, maintenance, events, PM, playbooks — at least 2 characters."
          />
        )}
        {showEmpty && (
          <EmptyState
            primary={`No results for "${trimmed}"`}
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
                query={trimmed}
                focused={i === focused}
                onMouseEnter={() => onFocus(i)}
                onSelect={onSelect}
                hitIndex={i}
              />
            </Fragment>
          );
        })}
      </div>
    </>
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
  query,
  focused,
  onMouseEnter,
  onSelect,
  hitIndex,
}: {
  hit: SearchHit;
  query: string;
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
          {highlight(hit.title || "Untitled", query)}
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
            {highlight(hit.subtitle, query)}
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

function EmptyState({ primary, secondary }: { primary: string; secondary: string }) {
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

function RecentList({
  recent,
  onPick,
  onClear,
}: {
  recent: string[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px 4px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--gw-fg-muted)",
          }}
        >
          Recent
        </div>
        <button
          onClick={onClear}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 2,
          }}
        >
          Clear
        </button>
      </div>
      {recent.map((q) => (
        <button
          key={q}
          onClick={() => onPick(q)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 18px",
            width: "100%",
            background: "transparent",
            border: "none",
            color: "var(--gw-fg)",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span style={{ color: "var(--gw-fg-muted)", display: "flex" }}>
            <Icons.Clock width={14} height={14} />
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {q}
          </span>
        </button>
      ))}
    </div>
  );
}

function LoadingBar({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        height: 2,
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms",
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, var(--rsd-accent) 50%, transparent 100%)",
          animation: visible ? "gw-search-loading 900ms linear infinite" : "none",
          transform: "translateX(-100%)",
        }}
      />
    </div>
  );
}

// Wrap each case-insensitive match of `query` in a <mark>. Falls through to
// plain text if no match (e.g. when trigram similarity caught the row but
// not a literal substring).
export function highlight(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle);
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark
        key={key++}
        style={{
          background: "color-mix(in srgb, var(--rsd-accent) 22%, transparent)",
          color: "inherit",
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    cursor = idx + needle.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
}

// localStorage-backed list of recent queries.
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecent(
            parsed
              .filter((x): x is string => typeof x === "string")
              .slice(0, RECENT_MAX)
          );
        }
      }
    } catch {
      // Ignore localStorage errors (private mode, quota, malformed JSON).
    }
  }, []);

  const pushRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [
        trimmed,
        ...prev.filter((x) => x.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Ignore.
    }
  }, []);

  return { recent, pushRecent, clearRecent };
}
