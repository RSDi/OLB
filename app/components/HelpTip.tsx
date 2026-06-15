"use client";
// Inline field-level help: a small "i" the user can hover (desktop) or tap
// (mobile) to read a short explanation. For one- or two-sentence hints next to
// a form field or control. For whole-page docs use the top-bar info panel.
import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";

export function HelpTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        aria-label={label ?? "More info"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          padding: 0,
          borderRadius: 100,
          background: "transparent",
          border: "none",
          color: "var(--gw-fg-muted)",
          cursor: "pointer",
        }}
      >
        <Icons.Info width={14} height={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            width: "max-content",
            maxWidth: 240,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--gw-ink)",
            color: "#fff",
            border: "1px solid var(--gw-stroke-dark)",
            boxShadow: "var(--gw-shadow-3)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.5,
            textTransform: "none",
            letterSpacing: 0,
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
