"use client";
// Shared search hook used by both the modal (`GlobalSearch`) and the
// inline topbar input (`TopbarSearch`). Owns the debounce, the in-flight
// fetch, the result list, and the group/flatten step the keyboard
// navigation depends on.
//
// The recent-searches list is intentionally NOT in here — both call sites
// own their own `useRecentSearches()` instance because they may want
// different push semantics later.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../supabase/client";
import { searchArchiveForGlobalSearch } from "../slack-archive/global-search";

export type EntityType =
  | "member"
  | "contact"
  | "maintenance"
  | "pm_task"
  | "pm_template"
  | "asset"
  | "event"
  | "playbook"
  | "slack";

export interface SearchHit {
  entity_type: EntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  rank: number;
}

// Canonical group order. Members/Maintenance/Events/Playbooks sit on top
// because they're the most common targets; PM internals trail. Contacts
// sit right after members since they're the other "directory of people"
// the global search surfaces. Slack messages come last, as the broadest
// matches.
export const GROUP_ORDER: EntityType[] = [
  "member",
  "contact",
  "maintenance",
  "event",
  "playbook",
  "pm_task",
  "pm_template",
  "asset",
  "slack",
];

export interface UseGlobalSearchResult {
  results: SearchHit[];
  flat: SearchHit[];
  groupStarts: { hitIndex: number; type: EntityType }[];
  loading: boolean;
}

export function useGlobalSearch(query: string, enabled: boolean): UseGlobalSearchResult {
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
        // The Slack archive has its own search function (migration 0092), run
        // alongside; either one failing leaves the other's results showing.
        const [records, slack] = await Promise.all([
          supabase
            .rpc("search_global", { q: trimmed, max_total: 25 })
            .abortSignal(controller.signal),
          searchArchiveForGlobalSearch(supabase, trimmed, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (records.error) console.error("[useGlobalSearch] rpc error", records.error);
        setResults([...((records.data ?? []) as SearchHit[]), ...slack]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, enabled]);

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

  return { results, flat, groupStarts, loading };
}
