"use client";
// The list filters shared by the Directory and External Contacts: a
// chip-shaped drop-down that fills in once it's narrowing the list, and a
// segmented switch for a few views of the same list.

import type { ReactNode } from "react";
import { ComboSelect, type ComboSelectProps } from "./ComboSelect";

// `leading` sits inside the chip before the label, like a team's color dot.
// `grow` shares the row with its neighbours instead of sizing to the longest
// option, so two fit side by side on a phone.
export function FilterSelect({
  active,
  leading,
  grow,
  ...props
}: ComboSelectProps & { active: boolean; leading?: ReactNode; grow?: boolean }) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        ...(grow ? { flex: "1 1 0", minWidth: 0, maxWidth: 220 } : null),
      }}
    >
      {leading && (
        <span style={{ position: "absolute", left: 12, display: "flex", pointerEvents: "none", zIndex: 1 }}>{leading}</span>
      )}
      <ComboSelect
        {...props}
        className="rsd-chip rsd-select-sm"
        style={{
          ...(grow ? { width: "100%" } : null),
          height: 34,
          padding: `0 24px 0 ${leading ? 30 : 14}px`,
          borderRadius: 100,
          border: "1px solid",
          borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
          background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
          color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      />
    </span>
  );
}

export function SegGroup({ label, children, ...rest }: { label: string; children: ReactNode; "data-tour"?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      {...rest}
      style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)" }}
    >
      {children}
    </div>
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
      }}
    >
      {label}
    </button>
  );
}
