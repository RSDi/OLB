"use client";

import type { CSSProperties, ReactNode } from "react";
import { btnStyle, cap, card, statusColors, t } from "./theme";
import type { InvoiceStatus } from "../types";

export function StatusPill({ status }: { status: InvoiceStatus | string }) {
  const c = statusColors(status);
  return (
    <span
      className="inv-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 100,
        fontSize: 11.5,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {status}
    </span>
  );
}

export function Btn({
  children,
  kind = "ghost",
  sm,
  onClick,
  href,
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  kind?: "accent" | "ink" | "ghost" | "locked";
  sm?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const style = btnStyle(disabled ? "locked" : kind, sm);
  if (href && !disabled) {
    return (
      <a href={href} style={style} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style} title={title}>
      {children}
    </button>
  );
}

export const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4" fill="none" />
  </svg>
);

export function LockNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: t.muted }}>
      <LockIcon /> Requires invoicing permission
    </span>
  );
}

export function ActionBtn({
  canInvoice,
  label,
  kind,
  onClick,
  sm,
}: {
  canInvoice: boolean;
  label: string;
  kind: "accent" | "ink" | "ghost";
  onClick?: () => void;
  sm?: boolean;
}) {
  if (canInvoice) {
    return (
      <Btn kind={kind} onClick={onClick} sm={sm}>
        {label}
      </Btn>
    );
  }
  return (
    <Btn kind="locked" disabled sm={sm} title="Requires invoicing permission">
      <LockIcon /> {label}
    </Btn>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...card, ...style }}>{children}</div>;
}

export function Cap({ children }: { children: ReactNode }) {
  return <div style={cap}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: t.muted, minWidth: 0 }}>
      {label}
      {children}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  minHeight: 44,
  border: `1px solid ${t.border}`,
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 16,
  color: t.fg,
  background: t.elev,
  fontWeight: 600,
  width: "100%",
  minWidth: 0,
  fontFamily: "inherit",
};

export function Progress({ pct }: { pct: number }) {
  return (
    <div style={{ height: 8, borderRadius: 100, background: t.elev, border: `1px solid ${t.border}`, overflow: "hidden" }}>
      <i style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: t.ink }} />
    </div>
  );
}

export function AutoChecked() {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: t.ok, background: "#d1fae5", borderRadius: 100, padding: "2px 8px", alignSelf: "flex-start" }}>
      ✓ Auto-checked
    </span>
  );
}
