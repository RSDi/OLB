"use client";
// The Help Center list: a search box, then the how-tos grouped by topic. Tap
// a question to open its steps, ▶ Show me how and Read more in the User
// Guide. A link to #howto-<id> opens that one.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HOW_TO_TOPICS, matchesHowTo, type HowTo } from "../../../lib/help/help-center";
import { useTour } from "../../components/GuidedTour";
import { Icons } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";

export interface HowToItem {
  id: string;
  question: string;
  topic: HowTo["topic"];
  sectionId: string;
  steps: string[];
  keywords: string[];
  tour: { tourId: string; step?: number } | null;
}

export function HelpCenterView({ items }: { items: HowToItem[] }) {
  const { start } = useTour();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // A link to #howto-<id> opens that one.
  useEffect(() => {
    const id = window.location.hash.replace(/^#howto-/, "");
    if (!id || !items.some(i => i.id === id)) return;
    const t = setTimeout(() => {
      setOpenId(id);
      document.getElementById(`howto-${id}`)?.scrollIntoView({ block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [items]);

  const shown = useMemo(() => items.filter(i => matchesHowTo(i, query)), [items, query]);
  const searching = query.trim().length > 0;

  return (
    <div style={{ maxWidth: 760, display: "grid", gap: 18 }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--rsd-display)",
            fontSize: "calc(26px * var(--rsd-display-scale))",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".02em",
            margin: "0 0 10px",
            color: "var(--gw-fg)",
          }}
        >
          Help Center
        </h1>
        <p style={{ fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.55, margin: 0 }}>
          Quick answers for the things people do most. Tap a question for the steps, and{" "}
          <strong>Show me how</strong> to be walked through it on the real page. Can&apos;t find it? Tap{" "}
          <strong>?</strong>, then <strong>Ask for help</strong>.
        </p>
      </div>

      <label style={{ position: "relative", display: "block" }}>
        <span style={{ position: "absolute", left: 12, top: 12, color: "var(--gw-fg-muted)", display: "flex" }}>
          <Icons.Search width={16} height={16} />
        </span>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search how-tos"
          aria-label="Search how-tos"
          style={{
            width: "100%",
            padding: "10px 14px 10px 36px",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            fontSize: 14,
            color: "var(--gw-fg)",
            background: "var(--gw-bg)",
          }}
        />
      </label>

      {shown.length === 0 && (
        <p style={{ fontSize: 14, color: "var(--gw-fg-muted)", margin: 0 }}>
          Nothing matches &ldquo;{query}&rdquo;. Try fewer words, look in the{" "}
          <Link href="/portal/guide" style={{ color: "var(--rsd-accent-text, var(--rsd-accent))", fontWeight: 700 }}>
            User Guide
          </Link>
          , or tap <strong>?</strong> → <strong>Ask for help</strong>.
        </p>
      )}

      {HOW_TO_TOPICS.map(topic => {
        const list = shown.filter(i => i.topic === topic);
        if (list.length === 0) return null;
        return (
          <section key={topic} style={{ display: "grid", gap: 8 }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--gw-fg-muted)",
                margin: "4px 0 0",
              }}
            >
              {topic}
            </h2>
            {list.map(item => {
              const open = searching ? openId === item.id || list.length === 1 : openId === item.id;
              return (
                <div
                  key={item.id}
                  id={`howto-${item.id}`}
                  style={{
                    border: `1px solid ${open ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                    borderRadius: 12,
                    background: "var(--gw-bg-elev)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 14px",
                      background: "none",
                      border: "none",
                      color: "var(--gw-fg)",
                      fontSize: 14.5,
                      fontWeight: 700,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ flex: 1 }}>{item.question}</span>
                    <span
                      aria-hidden
                      style={{ color: "var(--gw-fg-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
                    >
                      ›
                    </span>
                  </button>
                  {open && (
                    <div style={{ padding: "0 14px 14px", display: "grid", gap: 12 }}>
                      <ol className="rsd-markdown" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6, fontSize: 14, lineHeight: 1.55 }}>
                        {item.steps.map((s, i) => (
                          <li key={i}>
                            <MarkdownView>{s}</MarkdownView>
                          </li>
                        ))}
                      </ol>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {item.tour && (
                          <button
                            type="button"
                            className="gw-press"
                            onClick={() => item.tour && start(item.tour.tourId, { step: item.tour.step })}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 100,
                              border: "1px solid var(--rsd-accent)",
                              background: "var(--rsd-accent)",
                              color: "var(--rsd-accent-on)",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            ▶ Show me how
                          </button>
                        )}
                        <Link
                          href={`/portal/guide#help-${item.sectionId}`}
                          className="gw-press"
                          style={{
                            padding: "8px 14px",
                            borderRadius: 100,
                            border: "1px solid var(--gw-border)",
                            color: "var(--gw-fg)",
                            fontWeight: 700,
                            fontSize: 13,
                            textDecoration: "none",
                          }}
                        >
                          Read more in the User Guide
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
