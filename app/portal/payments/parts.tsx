"use client";
// Small pieces the Payments page's views and sheets share.
import type { ReactNode } from "react";
import { Icons } from "../../components/icons";
import { balanceLabel, balanceState, type Totals } from "../../../lib/finances/logic";

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const capStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

// "Owes $375.00" (red), "Paid up" (green), "Credit $50.00", "Nothing charged".
// The words carry the meaning; the color only backs them up.
export function BalanceChip({ totals }: { totals: Totals }) {
  const state = balanceState(totals);
  const cls =
    state === "owes" ? "rsd-chip-error" : state === "paid" ? "rsd-chip-accent" : "rsd-chip-mute";
  return (
    <span className={`rsd-chip ${cls}`} style={{ whiteSpace: "nowrap" }}>
      {state === "paid" && <Icons.CheckCircle width={12} height={12} />}
      {balanceLabel(totals)}
    </span>
  );
}

export function SegButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 8,
        border: "none",
        background: active ? "var(--gw-bg-elev)" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export function SegGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)", alignSelf: "flex-start" }}
    >
      {children}
    </div>
  );
}

// A right-hand sheet (full width on a phone), like the Directory's
// requirement sheet.
export function Sheet({
  eyebrow,
  title,
  busy,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — ${eyebrow}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(11,11,12,.38)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "min(480px, 100vw)",
          height: "100%",
          background: "var(--gw-bg-elev)",
          boxShadow: "-12px 0 40px rgba(0,0,0,.18)",
          padding: 24,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={capStyle}>{eyebrow}</span>
            <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{title}</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: "50%",
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icons.X width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--gw-error-bg)",
        color: "var(--gw-error)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}
