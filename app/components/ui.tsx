"use client";
import type { ReactNode, CSSProperties } from "react";

// ─── Pill button ────────────────────────────────────────────────
interface PillProps {
  children: ReactNode;
  variant?: "light" | "dark" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit";
  form?: string;
  disabled?: boolean;
  href?: string;
}
export function Pill({ children, variant = "light", size = "md", onClick, style, type = "button", form, disabled }: PillProps) {
  const pad = size === "sm" ? "8px 14px" : size === "lg" ? "14px 28px" : "11px 20px";
  const fs  = size === "sm" ? 12 : size === "lg" ? 15 : 13;
  const v = variant === "dark"
    ? { background: "var(--gw-ink)", color: "#fff", borderColor: "var(--gw-stroke-dark)" }
    : variant === "accent"
    ? { background: "var(--rsd-accent)", color: "var(--rsd-accent-on)", borderColor: "var(--rsd-accent)" }
    : variant === "ghost"
    ? { background: "transparent", color: "var(--gw-fg)", borderColor: "var(--gw-border)" }
    : { background: "var(--gw-bg-elev)", color: "var(--gw-fg)", borderColor: "var(--gw-border)" };
  return (
    <button type={type} form={form} disabled={disabled} onClick={onClick} className="gw-press" style={{
      fontWeight: 700, fontSize: fs, lineHeight: 1,
      borderRadius: 100, padding: pad, border: "1px solid",
      display: "inline-flex", alignItems: "center", gap: 8,
      whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
      ...v, ...style,
    }}>
      {children}
    </button>
  );
}

// ─── KPI card ───────────────────────────────────────────────────
export function KpiCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="rsd-card" style={{
      padding: "var(--rsd-kpi-pad)", gap: 10,
      ...(accent ? { background: "var(--gw-rose-bg)", border: "1px solid rgba(244,63,94,.25)" } : {}),
    }}>
      <span className="rsd-eyebrow">{label}</span>
      <span style={{
        fontWeight: 700,
        fontSize: "var(--rsd-kpi-num)",
        lineHeight: 1, letterSpacing: "-.02em",
        color: accent ? "var(--rsd-accent)" : "var(--gw-fg)",
      }}>{value}</span>
      {sub && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{sub}</span>}
    </div>
  );
}

// ─── Section header ─────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 18, color: "var(--gw-fg)", lineHeight: 1.2 }}>{title}</h2>
        {subtitle && <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────
export function EmptyState({ icon, title, body, action }: {
  icon?: ReactNode; title: string; body?: string; action?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 12, padding: "48px 24px", textAlign: "center",
    }}>
      {icon && <div style={{ color: "var(--gw-fg-faint)", marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)" }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 300, lineHeight: 1.6 }}>{body}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

// ─── Form input ─────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function Input({ label, error, style, ...props }: InputProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
      )}
      <input
        {...props}
        style={{
          height: 42, padding: "0 14px",
          border: `1px solid ${error ? "var(--gw-error)" : "var(--gw-border)"}`,
          borderRadius: 8, fontSize: 14,
          color: "var(--gw-fg)", background: "var(--gw-bg)",
          outline: "none", width: "100%",
          transition: "border-color 120ms",
          ...style,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--rsd-accent)"; if (props.onFocus) props.onFocus(e); }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? "var(--gw-error)" : "var(--gw-border)"; if (props.onBlur) props.onBlur(e); }}
      />
      {error && <span style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 500 }}>{error}</span>}
    </label>
  );
}

// ─── Textarea ───────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function Textarea({ label, error, style, ...props }: TextareaProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
      )}
      <textarea
        {...props}
        style={{
          padding: "12px 14px",
          border: `1px solid ${error ? "var(--gw-error)" : "var(--gw-border)"}`,
          borderRadius: 8, fontSize: 14,
          color: "var(--gw-fg)", background: "var(--gw-bg)",
          outline: "none", width: "100%", resize: "vertical",
          transition: "border-color 120ms", lineHeight: 1.6,
          ...style,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--rsd-accent)"; if (props.onFocus) props.onFocus(e); }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? "var(--gw-error)" : "var(--gw-border)"; if (props.onBlur) props.onBlur(e); }}
      />
      {error && <span style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 500 }}>{error}</span>}
    </label>
  );
}

// ─── Select ─────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}
export function Select({ label, style, children, ...props }: SelectProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
      )}
      <select
        {...props}
        style={{
          height: 42, padding: "0 14px",
          border: "1px solid var(--gw-border)",
          borderRadius: 8, fontSize: 14,
          color: "var(--gw-fg)", background: "var(--gw-bg)",
          outline: "none", width: "100%",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          ...style,
        }}
      >
        {children}
      </select>
    </label>
  );
}
