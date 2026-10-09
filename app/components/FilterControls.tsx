"use client";
// The list filters shared by the Directory, External Contacts and the HS
// Schedule: a chip-shaped drop-down that fills in once it's narrowing the
// list, the same chip with tick boxes to pick several, and a segmented switch
// for a few views of the same list.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ComboSelect, type ComboSelectProps } from "./ComboSelect";
import { Icons } from "./icons";

// A list hangs off its chip's left (or right) edge, so a chip near the other
// side of a phone would push it off the screen. Slide it back to 16px from
// the edge once it's open.
function useKeepInView(ref: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    function fit() {
      if (!el) return;
      el.style.transform = "";
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      let dx = 0;
      if (r.right > vw - 16) dx = vw - 16 - r.right;
      if (r.left + dx < 16) dx = 16 - r.left;
      if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, open]);
}

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
        ...(grow ? { flex: "1 1 0", minWidth: GROW_MIN, maxWidth: 220 } : null),
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

// A drop-down that shares its row (`grow`) never gets narrower than this:
// when the row is full it wraps to the next line instead of squeezing to an
// empty pill.
const GROW_MIN = 120;

export interface MultiOption {
  value: string;
  label: string;
  count?: number;
  // Before the label, like a status's color dot.
  mark?: ReactNode;
  disabled?: boolean;
}

// FilterSelect's chip, but its list has a tick box per option: tick as many
// as you like, and the first row ("All …") clears them. The chip shows
// `summary`; the list stays open while you tick.
export function FilterMultiSelect({
  label,
  summary,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
  leading,
  grow,
  ...rest
}: {
  label: string;
  summary: string;
  allLabel: string;
  options: MultiOption[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  leading?: ReactNode;
  grow?: boolean;
  "data-tour"?: string;
}) {
  const [open, setOpen] = useState(false);
  // The row the arrow keys are on: -1 is the "All" row.
  const [activeRow, setActiveRow] = useState(-1);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = selected.size > 0;
  useKeepInView(listRef, open);

  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const rows = [-1, ...options.map((_, i) => i).filter((i) => !options[i].disabled || selected.has(options[i].value))];
  const pick = (row: number) => (row === -1 ? onClear() : onToggle(options[row].value));
  const move = (by: number) => {
    const at = rows.indexOf(activeRow);
    setActiveRow(rows[Math.min(rows.length - 1, Math.max(0, (at === -1 ? 0 : at) + by))]);
  };

  return (
    <span
      ref={wrapRef}
      data-tour={rest["data-tour"]}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        // The list hangs off the chip, so never stretch to a taller row.
        alignSelf: "center",
        ...(grow ? { flex: "1 1 0", minWidth: GROW_MIN, maxWidth: 220 } : null),
      }}
    >
      {leading && (
        <span style={{ position: "absolute", left: 12, display: "flex", pointerEvents: "none", zIndex: 1 }}>{leading}</span>
      )}
      <button
        ref={buttonRef}
        type="button"
        // A select-only combobox: the focus stays here and the arrow keys
        // move through the list.
        role="combobox"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeRow + 1}` : undefined}
        className="rsd-chip"
        onClick={() => {
          setOpen((o) => !o);
          setActiveRow(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) setOpen(true);
            else move(e.key === "ArrowDown" ? 1 : -1);
          } else if ((e.key === " " || e.key === "Enter") && open) {
            e.preventDefault();
            pick(activeRow);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        style={{
          ...(grow ? { width: "100%" } : null),
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: `0 10px 0 ${leading ? 30 : 14}px`,
          borderRadius: 100,
          border: "1px solid",
          borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
          background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
          color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>{summary}</span>
        <Icons.ChevronDown width={11} height={11} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-multiselectable
          aria-label={label}
          // Keep the focus on the chip, so the arrow keys keep working.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 90,
            minWidth: "100%",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 360,
            overflowY: "auto",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,.14)",
            padding: 4,
            boxSizing: "border-box",
          }}
        >
          <MultiRow
            id={`${listId}-0`}
            label={allLabel}
            checked={!active}
            highlighted={activeRow === -1}
            onHover={() => setActiveRow(-1)}
            onPick={() => pick(-1)}
          />
          <div style={{ height: 1, background: "var(--gw-border)", margin: "3px 6px" }} />
          {options.map((o, i) => (
            <MultiRow
              key={o.value}
              id={`${listId}-${i + 1}`}
              label={o.label}
              count={o.count}
              mark={o.mark}
              checked={selected.has(o.value)}
              disabled={o.disabled && !selected.has(o.value)}
              highlighted={activeRow === i}
              onHover={() => setActiveRow(i)}
              onPick={() => pick(i)}
            />
          ))}
        </div>
      )}
    </span>
  );
}

function MultiRow({
  id,
  label,
  count,
  mark,
  checked,
  disabled,
  highlighted,
  onHover,
  onPick,
}: {
  id: string;
  label: string;
  count?: number;
  mark?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  highlighted: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={checked}
      aria-disabled={disabled || undefined}
      onMouseEnter={() => !disabled && onHover()}
      onClick={() => !disabled && onPick()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 9px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: checked ? 700 : 500,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        background: highlighted && !disabled ? "var(--gw-bg)" : "transparent",
        color: disabled ? "var(--gw-fg-muted)" : "var(--gw-fg)",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          borderRadius: 4,
          border: "1.5px solid",
          borderColor: checked ? "var(--rsd-accent-fill)" : "var(--gw-border)",
          background: checked ? "var(--rsd-accent-fill)" : "transparent",
          color: "var(--rsd-accent-fill-on)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {checked && <Icons.Check width={11} height={11} />}
      </span>
      {mark && <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{mark}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--gw-fg-muted)", marginLeft: 12 }}>{count}</span>
      )}
    </div>
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

// A chip that opens a small menu of switches, like the HS Schedule's View:
// tick rows (MenuRow) and radio rows, which change things without closing it.
export function FilterMenu({
  label,
  active,
  icon,
  round,
  children,
  ...rest
}: {
  label: string;
  active: boolean;
  icon?: ReactNode;
  // A round 32px button with just the icon (label is its name), like the
  // schedule's ⋯ beside the gear.
  round?: boolean;
  children: ReactNode;
  "data-tour"?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useKeepInView(menuRef, open);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span ref={wrapRef} data-tour={rest["data-tour"]} style={{ position: "relative", display: "inline-flex", alignSelf: "center" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={round ? label : undefined}
        title={round ? label : undefined}
        className={round ? "gw-press" : "rsd-chip"}
        onClick={() => setOpen((o) => !o)}
        style={round ? {
          width: 32,
          height: 32,
          borderRadius: 100,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg)",
          padding: 0,
          cursor: "pointer",
        } : {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 10px 0 14px",
          borderRadius: 100,
          border: "1px solid",
          borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
          background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
          color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {icon}
        {!round && label}
        {!round && <Icons.ChevronDown width={11} height={11} style={{ opacity: 0.6 }} />}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 90,
            minWidth: 220,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,.14)",
            padding: 4,
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

// A row in a FilterMenu: a tick box (or a round radio) and its label.
export function MenuRow({
  label,
  checked,
  radio,
  onPick,
}: {
  label: string;
  checked: boolean;
  radio?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "7px 9px",
        border: "none",
        borderRadius: 7,
        background: "transparent",
        color: "var(--gw-fg)",
        fontSize: 13,
        fontWeight: checked ? 700 : 500,
        textAlign: "left",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gw-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          borderRadius: radio ? 8 : 4,
          border: "1.5px solid",
          borderColor: checked ? "var(--rsd-accent-fill)" : "var(--gw-border)",
          background: checked ? "var(--rsd-accent-fill)" : "transparent",
          color: "var(--rsd-accent-fill-on)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {checked && (radio ? <span style={{ width: 6, height: 6, borderRadius: 3, background: "currentColor" }} /> : <Icons.Check width={11} height={11} />)}
      </span>
      {label}
    </button>
  );
}

// A row in a FilterMenu that does something (Print, Copy link).
export function MenuAction({ icon, label, onPick }: { icon?: ReactNode; label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 9px",
        border: "none",
        borderRadius: 7,
        background: "transparent",
        color: "var(--gw-fg)",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gw-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon && <span style={{ display: "inline-flex", color: "var(--gw-fg-muted)" }}>{icon}</span>}
      {label}
    </button>
  );
}

// A small heading inside a FilterMenu.
export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "8px 9px 3px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
      {children}
    </div>
  );
}
