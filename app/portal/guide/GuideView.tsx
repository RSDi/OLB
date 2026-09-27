"use client";
// Search box + table of contents + every guide section, in order. Search
// matches a section's title, keywords and text. "Take the tour" and each
// section's "Show me around" start a guided tour (lib/help/tours.ts).
import { useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { useTour } from "../../components/GuidedTour";
import { guideAnchor, type GuideSection } from "../../../lib/help/guide";
import { WELCOME_TOUR_ID } from "../../../lib/help/tours";

const tourButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 100,
  fontWeight: 700,
  cursor: "pointer",
  border: "1px solid",
};

export function GuideView({
  sections,
  tours,
  updated,
}: {
  sections: GuideSection[];
  // Section id → tour id, for sections with a guided tour.
  tours: Record<string, string>;
  updated: string;
}) {
  const { start } = useTour();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      q
        ? sections.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.keywords.some((k) => k.toLowerCase().includes(q)) ||
              s.body.toLowerCase().includes(q)
          )
        : sections,
    [sections, q]
  );

  return (
    <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", paddingBottom: 60 }}>
      <h1
        style={{
          fontFamily: "var(--rsd-display)",
          fontWeight: 800,
          fontSize: "calc(28px * var(--rsd-display-scale))",
          letterSpacing: ".01em",
          textTransform: "uppercase",
          lineHeight: 1,
          margin: "0 0 10px",
          color: "var(--gw-fg)",
        }}
      >
        User Guide
      </h1>
      <p style={{ fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.55, margin: "0 0 20px" }}>
        How to get around the OLB member portal and get things done. You&apos;ll only see the parts
        that apply to you. The <strong>ⓘ</strong> button in the top bar of any page opens the
        section for that page.
      </p>
      <button
        type="button"
        onClick={() => start(WELCOME_TOUR_ID)}
        className="gw-press"
        style={{
          ...tourButton,
          padding: "10px 18px",
          fontSize: 13,
          background: "var(--rsd-accent)",
          color: "var(--rsd-accent-on)",
          borderColor: "var(--rsd-accent)",
          margin: "0 0 20px",
        }}
      >
        Take the tour
        <Icons.ArrowRight width={14} height={14} />
      </button>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 42,
          padding: "0 14px",
          border: "1px solid var(--gw-border)",
          borderRadius: 100,
          background: "var(--gw-bg-elev)",
          marginBottom: 20,
          color: "var(--gw-fg-muted)",
        }}
      >
        <Icons.Search width={15} height={15} style={{ flexShrink: 0 }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide…"
          aria-label="Search the guide"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            background: "transparent",
            color: "var(--gw-fg)",
            fontSize: 14,
            fontWeight: 500,
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            style={{ display: "flex", padding: 2, border: 0, background: "none", color: "var(--gw-fg-muted)", cursor: "pointer" }}
          >
            <Icons.X width={13} height={13} />
          </button>
        )}
      </label>

      {shown.length > 0 ? (
        <nav
          aria-label="Contents"
          style={{
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            background: "var(--gw-bg-elev)",
            padding: "14px 18px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--gw-fg-muted)",
              marginBottom: 8,
            }}
          >
            Contents
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              columnGap: 24,
              rowGap: 4,
              fontSize: 14,
            }}
          >
            {shown.map((s) => (
              <li key={s.id}>
                <a href={`#${guideAnchor(s.id)}`} style={{ color: "var(--gw-fg)", fontWeight: 600 }}>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p style={{ fontSize: 14, color: "var(--gw-fg-muted)" }}>
          Nothing in the guide matches &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {shown.map((s) => (
        <section
          key={s.id}
          id={guideAnchor(s.id)}
          style={{ marginTop: 32, scrollMarginTop: 16 }}
        >
          <h2
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: "var(--gw-fg)",
              margin: "0 0 12px",
              paddingBottom: 8,
              borderBottom: "1px solid var(--gw-border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {s.title}
            {s.audience !== "everyone" && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 100,
                  background: "var(--gw-bg)",
                  border: "1px solid var(--gw-border)",
                  color: "var(--gw-fg-muted)",
                }}
              >
                {s.audience === "super_admin" ? "Super admins" : "Board"}
              </span>
            )}
            {tours[s.id] && (
              <button
                type="button"
                onClick={() => start(tours[s.id])}
                className="gw-press"
                style={{
                  ...tourButton,
                  marginLeft: "auto",
                  padding: "5px 12px",
                  fontSize: 12,
                  background: "transparent",
                  color: "var(--gw-fg)",
                  borderColor: "var(--gw-border)",
                }}
              >
                Show me around
              </button>
            )}
          </h2>
          <div className="rsd-markdown" style={{ fontSize: 14, lineHeight: 1.65 }}>
            <MarkdownView>{s.body}</MarkdownView>
          </div>
        </section>
      ))}

      <p style={{ marginTop: 40, fontSize: 12, fontStyle: "italic", color: "var(--gw-fg-muted)" }}>
        Last updated {updated}.
      </p>
    </div>
  );
}
