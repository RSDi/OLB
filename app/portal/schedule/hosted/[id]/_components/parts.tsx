"use client";
// Pieces the tournament planning page's tabs share: section cards, labels,
// the busy/error/notice plumbing (Finances' useAct: it refreshes the page
// after each change) and the money format.

import type { CSSProperties, ReactNode } from "react";
import { formatAmount } from "../../../../../../lib/finances/logic";

export { useAct } from "../../../../payments/club-parts";
export { Sheet, ErrorNote } from "../../../../payments/parts";

// "−$520.00" for a loss, not "$-520.00".
export const money = (cents: number) => (cents < 0 ? `−${formatAmount(-cents)}` : formatAmount(cents));

export const cap: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

export const sub: CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

export const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 };

export const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--gw-fg)",
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "underline",
  cursor: "pointer",
};

export const iconBtn: CSSProperties = {
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

// Super-admin checklist reorder: smaller than the pencil so the row
// barely grows when Edit order is on.
export const moveIconBtn: CSSProperties = {
  ...iconBtn,
  width: 22,
  height: 22,
  borderRadius: 6,
};

// A card with a heading, a line under it and buttons at the right.
export function Section({
  title,
  subtitle,
  action,
  children,
  tour,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tour?: string;
}) {
  return (
    <section className="rsd-card" data-tour={tour} style={{ padding: 18, gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
          {subtitle && <p style={sub}>{subtitle}</p>}
        </div>
        {action && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

// What the last change said ("Placed 32 games."), or why it didn't work.
export function Said({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
        {error}
      </div>
    );
  }
  if (notice) {
    return (
      <div role="status" style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>
        {notice}
      </div>
    );
  }
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", padding: "6px 0" }}>{children}</div>;
}
