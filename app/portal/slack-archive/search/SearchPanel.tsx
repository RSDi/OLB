"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as emoji from "node-emoji";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Input, Pill } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import { runArchiveAuthorsForQuery, runArchiveSearch } from "../../../../lib/slack-archive/search-actions";
import type { ArchiveAuthor, ArchiveSearchResult } from "../../../../lib/slack-archive/data";

export function SearchPanel({ authors }: { authors: ArchiveAuthor[] }) {
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Full author list until a text search actually runs; then narrowed to
  // just the authors who said the searched words, so picking a name that
  // never matched the query isn't offered as if it would.
  const [displayedAuthors, setDisplayedAuthors] = useState<ArchiveAuthor[]>(authors);
  const [narrowedQuery, setNarrowedQuery] = useState<string | null>(null);

  const canSearch = selectedAuthors.length > 0 || query.trim().length > 0;

  function toggleAuthor(name: string) {
    setSelectedAuthors((cur) => (cur.includes(name) ? cur.filter((a) => a !== name) : [...cur, name]));
  }

  function runSearch() {
    if (!canSearch) return;
    setError(null);
    const trimmedQuery = query.trim();
    startTransition(async () => {
      const [searchRes, authorsRes] = await Promise.all([
        runArchiveSearch(selectedAuthors, query),
        trimmedQuery ? runArchiveAuthorsForQuery(trimmedQuery) : Promise.resolve(null),
      ]);
      if (searchRes.error) {
        setError(searchRes.error);
        setResults(null);
      } else {
        setResults(searchRes.results);
      }

      if (authorsRes) {
        // Narrowing errors aren't fatal to the search itself — fall back to
        // the full author list rather than hiding the picker entirely.
        if (!authorsRes.error) {
          const matchingNames = new Set(authorsRes.authors.map((a) => a.name));
          setDisplayedAuthors(authorsRes.authors);
          setNarrowedQuery(trimmedQuery);
          setSelectedAuthors((cur) => cur.filter((a) => matchingNames.has(a)));
        }
      } else {
        setDisplayedAuthors(authors);
        setNarrowedQuery(null);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input
          label="Search text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'e.g. building shutdown, or "exact phrase"'}
        />

        {authors.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg-muted)", marginBottom: 6 }}>
              Filter by user{selectedAuthors.length > 0 ? ` (${selectedAuthors.length} selected)` : ""}
              {narrowedQuery && (
                <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>
                  {" "}— only showing users who said &ldquo;{narrowedQuery}&rdquo;
                </span>
              )}
            </div>
            {displayedAuthors.length === 0 && narrowedQuery ? (
              <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                No one said &ldquo;{narrowedQuery}&rdquo;.
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

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Pill variant="accent" size="sm" type="submit" disabled={!canSearch || pending}>
            {pending ? "Searching…" : "Search"}
          </Pill>
          {!canSearch && (
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
              Enter search text or select at least one user.
            </span>
          )}
        </div>
      </form>

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
                  <div style={{ fontSize: 13.5, color: "var(--gw-fg)", lineHeight: 1.5, marginTop: 4 }}>
                    <MarkdownView>{emoji.emojify(r.messageText)}</MarkdownView>
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
