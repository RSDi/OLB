import type { CSSProperties } from "react";

/** Host theme via CSS variables. Fallbacks are neutral, not OLB yellow. */
export const t = {
  fg: "var(--inv-fg, var(--gw-fg, #121214))",
  muted: "var(--inv-muted, var(--gw-fg-muted, rgba(18,18,20,.62)))",
  bg: "var(--inv-bg, var(--gw-bg, #f3f3ef))",
  elev: "var(--inv-elev, var(--gw-bg-elev, #fff))",
  border: "var(--inv-border, var(--gw-border, #e4e4df))",
  hover: "var(--inv-hover, var(--gw-hover, #f7f7f4))",
  accent: "var(--inv-accent, var(--rsd-accent-fill, #f5d000))",
  accentOn: "var(--inv-accent-on, var(--rsd-accent-fill-on, #0b0b0c))",
  ink: "var(--inv-ink, var(--gw-ink, #121214))",
  error: "var(--inv-error, var(--gw-error, #c53030))",
  ok: "var(--inv-ok, #065f46)",
  font: "var(--inv-font, inherit)",
};

export const cap: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: t.muted,
};

export const card: CSSProperties = {
  background: t.elev,
  border: `1px solid ${t.border}`,
  borderRadius: 14,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
};

export function btnStyle(kind: "accent" | "ink" | "ghost" | "locked", sm = false): CSSProperties {
  const pad = sm ? "0 12px" : "0 16px";
  const base: CSSProperties = {
    minHeight: sm ? 36 : 44,
    padding: pad,
    borderRadius: 100,
    fontWeight: 700,
    fontSize: sm ? 13 : 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    whiteSpace: "nowrap",
    cursor: kind === "locked" ? "not-allowed" : "pointer",
    textDecoration: "none",
    fontFamily: "inherit",
    opacity: kind === "locked" ? 0.55 : 1,
    filter: kind === "locked" ? "grayscale(1)" : undefined,
  };
  if (kind === "accent") return { ...base, background: t.accent, border: `1px solid ${t.accent}`, color: t.accentOn };
  if (kind === "ink") return { ...base, background: t.ink, border: `1px solid ${t.ink}`, color: "#fff" };
  return { ...base, background: t.elev, border: `1px solid ${t.border}`, color: t.fg };
}

export function statusColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case "Paid":
      return { bg: "#d1fae5", fg: "#065f46" };
    case "Overdue":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "Partial":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "Viewed":
      return { bg: "#ede9fe", fg: "#5b21b6" };
    case "Sent":
      return { bg: "#dbeafe", fg: "#1e40af" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}
