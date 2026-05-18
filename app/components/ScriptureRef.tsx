"use client";
import { useState, useCallback } from "react";

const cache: Record<string, string> = {};

function normalizeRef(ref: string) {
  // bible-api.com uses "1 John" not "1st John"
  return ref.replace(/^(\d+)(st|nd|rd)\s/, "$1 ");
}

interface Tip { text: string; loading: boolean; x: number; y: number }

export function ScriptureRef({ children }: { children: string }) {
  const [tip, setTip] = useState<Tip | null>(null);

  const show = useCallback(async (e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 10;

    if (cache[children]) {
      setTip({ text: cache[children], loading: false, x, y });
      return;
    }

    setTip({ text: "", loading: true, x, y });

    try {
      const res = await fetch(
        `https://bible-api.com/${encodeURIComponent(normalizeRef(children))}?translation=kjv`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      let text = (data.text || "").trim();
      if (text.length > 500) text = text.slice(0, 500).trimEnd() + "…";
      cache[children] = text || "Passage not found.";
      setTip(t => t ? { ...t, text: cache[children], loading: false } : null);
    } catch {
      setTip(t => t ? { ...t, text: "Could not load passage.", loading: false } : null);
    }
  }, [children]);

  return (
    <>
      <span
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        style={{
          fontSize: 12, fontWeight: 600,
          color: "var(--rsd-accent)", lineHeight: 1.4,
          cursor: "help",
          borderBottom: "1px dotted var(--rsd-accent)",
          display: "inline-block",
        }}
      >
        {children}
      </span>

      {tip && (
        <div style={{
          position: "fixed",
          left: Math.min(tip.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 348),
          top: tip.y,
          zIndex: 9999,
          width: 320,
          background: "#fff",
          border: "1px solid rgba(108,140,89,.25)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)",
          padding: "14px 18px",
          pointerEvents: "none",
          animation: "gw-fade-in 120ms ease",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: ".07em",
            textTransform: "uppercase", color: "var(--rsd-accent)",
            marginBottom: 8,
          }}>
            {children} · KJV
          </div>
          {tip.loading ? (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              Loading…
            </div>
          ) : (
            <div style={{
              fontSize: 13, lineHeight: 1.75,
              color: "var(--gw-fg)", fontStyle: "italic",
              fontWeight: 500,
            }}>
              {tip.text}
            </div>
          )}
        </div>
      )}
    </>
  );
}
