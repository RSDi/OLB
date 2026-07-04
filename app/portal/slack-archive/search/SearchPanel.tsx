"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Input } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import {
  runArchiveAuthorCounts,
  runArchiveChannelCounts,
  runArchiveSearch,
} from "../../../../lib/slack-archive/search-actions";
import { emojify } from "../../../../lib/slack-archive/emoji";
import type { ArchiveAuthor, ArchiveSearchResult } from "../../../../lib/slack-archive/data";

// Debounce for the live search — long enough that a fast typist doesn't
// fire a request per keystroke, short enough to still feel instant once
// they pause.
const SEARCH_DEBOUNCE_MS = 350;

export function SearchPanel({
  authors,
  channels,
}: {
  authors: ArchiveAuthor[];
  channels: { id: string; label: string }[];
}) {
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Each picker is narrowed by the OTHER active filters (the other picker's
  // selection, plus any text query) — never by its own selection, so
  // picking one option doesn't shrink the list out from under the rest.
  // null = unfiltered (show the full prop list); narrowingActive tracks
  // whether the *other* filters are non-empty, for the "narrowed by..." hint.
  const [displayedAuthors, setDisplayedAuthors] = useState<ArchiveAuthor[]>(authors);
  const [displayedChannelIds, setDisplayedChannelIds] = useState<Set<string> | null>(null);

  const canSearch = selectedAuthors.length > 0 || selectedChannels.length > 0 || query.trim().length > 0;
  const authorsNarrowedByOthers = selectedChannels.length > 0 || query.trim().length > 0;
  const channelsNarrowedByOthers = selectedAuthors.length > 0 || query.trim().length > 0;
  const displayedChannels = displayedChannelIds === null ? channels : channels.filter((c) => displayedChannelIds.has(c.id));
  // Guards against an earlier, slower request overwriting a later one's
  // results — only the most recently *started* request is allowed to apply
  // what it finds.
  const requestIdRef = useRef(0);

  function toggleAuthor(name: string) {
    setSelectedAuthors((cur) => (cur.includes(name) ? cur.filter((a) => a !== name) : [...cur, name]));
  }

  function toggleChannel(id: string) {
    setSelectedChannels((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  }

  useEffect(() => {
    if (!canSearch) {
      requestIdRef.current += 1;
      setResults(null);
      setError(null);
      setSearching(false);
      setDisplayedAuthors(authors);
      setDisplayedChannelIds(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const [searchRes, authorsRes, channelsRes] = await Promise.all([
        runArchiveSearch(selectedAuthors, query, selectedChannels),
        runArchiveAuthorCounts(query, selectedChannels),
        runArchiveChannelCounts(query, selectedAuthors),
      ]);
      if (requestIdRef.current !== requestId) return; // a newer search superseded this one

      if (searchRes.error) {
        setError(searchRes.error);
        setResults(null);
      } else {
        setError(null);
        setResults(searchRes.results);
      }

      // Narrowing errors aren't fatal to the search itself — fall back to
      // the full picker list rather than hiding it entirely.
      if (!authorsRes.error) {
        const matchingNames = new Set(authorsRes.authors.map((a) => a.name));
        setDisplayedAuthors(authorsRes.authors);
        setSelectedAuthors((cur) => cur.filter((a) => matchingNames.has(a)));
      }
      if (!channelsRes.error) {
        const matchingIds = new Set(channelsRes.channels.map((c) => c.channelId));
        setDisplayedChannelIds(matchingIds);
        setSelectedChannels((cur) => cur.filter((c) => matchingIds.has(c)));
      }
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `authors` is a stable prop, not a dependency of when to re-search
  }, [query, selectedAuthors, selectedChannels, canSearch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input
          label="Search text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'e.g. building shutdown, or "exact phrase"'}
        />

        {channels.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg-muted)", marginBottom: 6 }}>
              Filter by channel{selectedChannels.length > 0 ? ` (${selectedChannels.length} selected)` : ""}
              {channelsNarrowedByOthers && (
                <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>
                  {" "}— narrowed by your other filters
                </span>
              )}
            </div>
            {displayedChannels.length === 0 && channelsNarrowedByOthers ? (
              <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                No channels match your other filters.
              </div>
            ) : (
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto",
                padding: 10, borderRadius: 10, border: "1px solid var(--gw-border)", background: "var(--gw-bg)",
              }}
            >
              {displayedChannels.map((c) => {
                const active = selectedChannels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChannel(c.id)}
                    className="gw-press"
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 100,
                      background: active ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
                      color: active ? "var(--rsd-accent-on)" : "var(--gw-fg)",
                      border: `1px solid ${active ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {authors.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg-muted)", marginBottom: 6 }}>
              Filter by user{selectedAuthors.length > 0 ? ` (${selectedAuthors.length} selected)` : ""}
              {authorsNarrowedByOthers && (
                <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>
                  {" "}— narrowed by your other filters
                </span>
              )}
            </div>
            {displayedAuthors.length === 0 && authorsNarrowedByOthers ? (
              <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                No one matches your other filters.
              </div>
            ) : (
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto",
                padding: 10, borderRadius: 10, border: "1px solid var(--gw-border)", background: "var(--gw-bg)",
              }}
            >
              {displayedAuthors.map((a) => {
                const active = selectedAuthors.includes(a.name);
                return (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => toggleAuthor(a.name)}
                    className="gw-press"
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 100,
                      background: active ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
                      color: active ? "var(--rsd-accent-on)" : "var(--gw-fg)",
                      border: `1px solid ${active ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                      cursor: "pointer",
                    }}
                  >
                    {a.name} <span style={{ opacity: 0.7 }}>({a.count})</span>
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, minHeight: 16 }}>
          {searching
            ? "Searching…"
            : !canSearch
              ? "Enter search text, or select at least one user or channel."
              : null}
        </div>
      </div>

      {error && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--gw-error-bg)", border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10, padding: "12px 16px", fontSize: 13,
            color: "var(--gw-error)", fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      {results !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
            {results.length === 0
              ? "No messages found."
              : `${results.length} message${results.length === 1 ? "" : "s"}${results.length === 200 ? " (showing the 200 most recent matches)" : ""}`}
          </div>
          {results.map((r) => {
            const time = new Date(r.postedAt).toLocaleString(undefined, {
              year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
            });
            const href = `/portal/slack-archive/${encodeURIComponent(r.channelId)}#msg-${r.messageTs}`;
            return (
              <div key={r.messageId} className="rsd-card" style={{ padding: "12px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".02em" }}>
                  {r.channelLabel}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                  <span style={{ fontWeight: 700, color: "var(--gw-fg)" }}>{r.authorName ?? "Unknown"}</span>
                  <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{time}</span>
                </div>
                {r.messageText && (
                  <div className="rsd-slack-msg-text" style={{ fontSize: 13.5, color: "var(--gw-fg)", lineHeight: 1.5, marginTop: 4 }}>
                    <MarkdownView>{emojify(r.messageText)}</MarkdownView>
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  <Link href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
                    Jump to message ↗
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
