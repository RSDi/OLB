"use client";
// Every dropdown on the site. Type to find an option, or press space (or the
// down arrow, or click it) to see the whole list, then pick with the arrows
// and Enter, Tab or the mouse. A drop-in for <select>: the same props and
// <option>/<optgroup> children, with a real <select> hidden underneath that
// still holds the value, the name for forms, `required` and the change
// event, so callers' onChange gets e.target.value as before. Phones work the
// same way (tap to see the list, type to narrow it), except that a short list
// is tap-only: no keyboard, so the page doesn't zoom or jump. The page before
// it hydrates shows the plain <select>.

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export type ComboSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
  group: string | null;
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

// Style that sizes and places the control goes on the wrapper; the rest
// (border, colors, font) stays on the field.
const LAYOUT_KEYS = [
  "width", "minWidth", "maxWidth", "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "justifySelf",
  "gridColumn", "gridRow", "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
] as const;

const noSubscribe = () => () => {};

// On a phone, a list this short is tap-only: no keyboard to type with.
const TAP_ONLY_MAX = 20;

export function ComboSelect(props: ComboSelectProps) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  if (!hydrated || props.multiple) return <select {...props} />;
  return <Combo {...props} />;
}

function Combo(props: ComboSelectProps) {
  const {
    children,
    value,
    defaultValue,
    onChange,
    name,
    required,
    form,
    autoComplete,
    disabled,
    className,
    style,
    onFocus,
    onBlur,
    onKeyDown,
    onClick,
    onMouseDown,
    ...rest
  } = props;
  const opts = useMemo(() => collectOptions(children), [children]);
  const listId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The value as the hidden <select> has it (for callers that don't pass
  // `value`); a passed `value` always wins.
  const [own, setOwn] = useState<string | null>(null);
  useEffect(() => {
    if (selectRef.current) setOwn(selectRef.current.value);
  }, []);
  const current =
    value !== undefined && value !== null
      ? String(value)
      : own ?? (defaultValue !== undefined ? String(defaultValue) : (opts.find((o) => !o.disabled)?.value ?? ""));
  const selected = opts.find((o) => o.value === current) ?? null;

  // null: not typing, the field shows the chosen option.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const shown = useMemo(() => matching(opts, query), [opts, query]);
  const filtering = !!query?.trim();
  const showing = open && (shown.length > 0 || filtering);

  function openAll() {
    setQuery((q) => (q && q.trim() ? q : null));
    setOpen(true);
    const i = opts.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : Math.max(0, firstEnabled(opts)));
  }

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function pick(o: Opt | undefined) {
    if (!o || o.disabled) return;
    close();
    const sel = selectRef.current;
    if (!sel || o.value === current) return;
    sel.value = o.value;
    setOwn(o.value);
    // React's onChange for a <select> listens for the native change event.
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Typing: filter, and highlight the best match.
  function search(text: string) {
    setQuery(text);
    setOpen(true);
    setActive(Math.max(0, firstEnabled(matching(opts, text))));
  }

  function move(step: 1 | -1) {
    if (!showing) return openAll();
    const n = firstEnabled(shown, active + step, step);
    if (n >= 0) setActive(n);
  }

  // Keep the highlighted option in view.
  useEffect(() => {
    if (showing) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showing, active, listId]);

  // Place the list under the field (or above it, near the bottom of the
  // screen) in screen coordinates, so a card that hides overflow can't clip it.
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!showing) return;
    function place() {
      const w = wrapRef.current;
      if (!w) return;
      const r = w.getBoundingClientRect();
      // On a phone, the part of the screen above the keyboard.
      const vv = window.visualViewport;
      const bottomEdge = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const below = bottomEdge - r.bottom;
      const up = below < 220 && r.top > below;
      const width = Math.max(r.width, 160);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(width, 360) - 8));
      const maxHeight = Math.max(120, Math.min(280, (up ? r.top : below) - 12));
      setPos({
        left,
        minWidth: width,
        maxWidth: Math.max(width, 360),
        maxHeight,
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [showing]);
  // If a transformed ancestor moved "fixed", shift the list back to the field.
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const l = listRef.current;
    const w = wrapRef.current;
    if (!showing || !pos || !l || !w) return;
    const lr = l.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    const wantLeft = typeof pos.left === "number" ? pos.left : lr.left;
    const wantTop = pos.top !== undefined ? wr.bottom + 4 : wr.top - 4 - lr.height;
    const dx = wantLeft - lr.left;
    const dy = wantTop - lr.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) setShift((s) => ({ x: s.x + dx, y: s.y + dy }));
  }, [showing, pos]);

  const wrapStyle: CSSProperties = { position: "relative", display: "inline-block", verticalAlign: "middle" };
  const fieldStyle: CSSProperties = { ...style };
  for (const k of LAYOUT_KEYS) {
    if (fieldStyle[k] !== undefined) {
      (wrapStyle as Record<string, unknown>)[k] = fieldStyle[k];
      delete fieldStyle[k];
    }
  }
  if (className?.split(/\s+/).includes("olb-select")) {
    wrapStyle.display = "block";
    wrapStyle.width ??= "100%";
  }
  if (wrapStyle.width !== undefined || wrapStyle.flex !== undefined || wrapStyle.flexGrow !== undefined) {
    fieldStyle.width = "100%";
  }
  // The chevron, drawn the way the site's styled selects already draw it.
  if (fieldStyle.background !== undefined) {
    fieldStyle.backgroundColor = fieldStyle.background as string;
    delete fieldStyle.background;
  }
  const chip = className?.split(/\s+/).includes("rsd-chip");
  if (fieldStyle.backgroundImage === undefined) {
    fieldStyle.backgroundImage = CHEVRON;
    fieldStyle.backgroundRepeat = "no-repeat";
    fieldStyle.backgroundPosition = chip ? "right 5px center" : "right 10px center";
    fieldStyle.backgroundSize = chip ? "10px" : "12px";
  }
  fieldStyle.paddingRight ??= chip ? 18 : 28;
  fieldStyle.cursor = disabled ? "default" : fieldStyle.cursor ?? "pointer";
  fieldStyle.textOverflow = "ellipsis";
  // A <select>'s width includes its padding and border; match it.
  fieldStyle.boxSizing ??= "border-box";
  if (!className && fieldStyle.border === undefined) {
    // A bare <select> looked like one; keep a field outline.
    fieldStyle.border = "1px solid var(--gw-border)";
    fieldStyle.borderRadius ??= 6;
    fieldStyle.backgroundColor ??= "var(--gw-bg)";
    fieldStyle.color ??= "var(--gw-fg)";
    fieldStyle.height ??= 32;
    fieldStyle.paddingLeft ??= 8;
  }

  // Phones: a short list opens on a tap with no keyboard, so iOS doesn't zoom
  // into the field or scroll the page up to make room. iOS zooms into any
  // focused field with small text, read-only or not, so the field never takes
  // focus: a tap lands on a cover over it, and a tap anywhere else closes.
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const tapOnly = coarse && opts.length <= TAP_ONLY_MAX;
  useEffect(() => {
    if (!tapOnly || !showing) return;
    function outside(e: PointerEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !listRef.current?.contains(t)) close();
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [tapOnly, showing]);

  const blank = !selected || selected.value === "";
  const longest = opts.reduce((m, o) => Math.max(m, o.label.length), 4);

  return (
    <span ref={wrapRef} style={wrapStyle}>
      <input
        {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showing}
        aria-activedescendant={showing && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        readOnly={tapOnly}
        inputMode={tapOnly ? "none" : undefined}
        disabled={disabled}
        className={className}
        size={longest + 2}
        value={query ?? (blank ? "" : selected!.label)}
        placeholder={blank ? (selected?.label ?? "") : undefined}
        style={fieldStyle}
        onFocus={(e) => {
          // On a computer, select the choice so typing replaces it. (On a
          // phone that pops up the copy/paste bubble instead.)
          if (window.matchMedia("(pointer: fine)").matches) e.currentTarget.select();
          onFocus?.(e as unknown as React.FocusEvent<HTMLSelectElement>);
        }}
        onBlur={(e) => {
          close();
          onBlur?.(e as unknown as React.FocusEvent<HTMLSelectElement>);
        }}
        onMouseDown={(e) => onMouseDown?.(e as unknown as React.MouseEvent<HTMLSelectElement>)}
        onClick={(e) => {
          if (showing && !filtering) close();
          else if (!showing) openAll();
          onClick?.(e as unknown as React.MouseEvent<HTMLSelectElement>);
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (query !== null) return search(v);
          // Typing over the chosen option (phone keyboards don't say which
          // key it was): search for just what was typed.
          const label = blank ? "" : selected!.label;
          if (label && v.startsWith(label)) search(v.slice(label.length));
          else if (label && label.startsWith(v)) search("");
          else search(v);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e as unknown as React.KeyboardEvent<HTMLSelectElement>);
          if (e.defaultPrevented) return;
          const typing = query !== null && query.trim() !== "";
          if (e.key === " " && !typing) {
            e.preventDefault();
            openAll();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Home" && showing && !typing) {
            e.preventDefault();
            setActive(Math.max(0, firstEnabled(shown)));
          } else if (e.key === "End" && showing && !typing) {
            e.preventDefault();
            setActive(Math.max(0, firstEnabled(shown, shown.length - 1, -1)));
          } else if (e.key === "Enter") {
            // Like a <select>: Enter picks, and never submits the form.
            e.preventDefault();
            if (showing) pick(shown[active]);
            else openAll();
          } else if (e.key === "Tab") {
            if (showing && typing) pick(shown[active]);
            else close();
          } else if (e.key === "Escape") {
            if (showing || query !== null) {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          } else if (query === null && (e.key === "Backspace" || e.key === "Delete")) {
            e.preventDefault();
            search("");
          } else if (query === null && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            // Typing over the chosen option starts a fresh search.
            e.preventDefault();
            search(e.key);
          }
        }}
      />
      {/* Holds the value for forms and onChange; labels point at the field above. */}
      <select
        ref={selectRef}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        required={required}
        form={form}
        autoComplete={autoComplete}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        onFocus={() => inputRef.current?.focus()}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, pointerEvents: "none" }}
      >
        {children}
      </select>
      {tapOnly && !disabled && (
        <span
          aria-hidden
          onClick={(e) => {
            // Inside a <label>, the click would otherwise focus the field.
            e.preventDefault();
            if (showing) close();
            else openAll();
            onClick?.(e as unknown as React.MouseEvent<HTMLSelectElement>);
          }}
          style={{ position: "absolute", inset: 0, cursor: "pointer" }}
        />
      )}
      {showing && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          // Inside a <label> (the shared Select), a click would also reach
          // the field and open the list again.
          onClick={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            zIndex: 90,
            transform: shift.x || shift.y ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
            visibility: pos ? "visible" : "hidden",
            ...pos,
            overflowY: "auto",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,.14)",
            padding: 4,
            boxSizing: "border-box",
            textAlign: "left",
            textTransform: "none",
            letterSpacing: "normal",
          }}
        >
          {shown.length === 0 && (
            <div style={{ padding: "7px 9px", fontSize: 13, color: "var(--gw-fg-muted)" }}>No match</div>
          )}
          {shown.map((o, i) => {
            const header = !filtering && o.group !== null && o.group !== shown[i - 1]?.group ? o.group : null;
            const isSel = o.value === current;
            return (
              <Fragment key={`${o.group ?? ""}\u0000${o.value}\u0000${i}`}>
                {header && (
                  <div
                    style={{
                      padding: "8px 9px 3px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: "var(--gw-fg-muted)",
                    }}
                  >
                    {header}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => {
                    pick(o);
                    if (!tapOnly) inputRef.current?.focus();
                  }}
                  style={{
                    padding: "7px 9px",
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: isSel ? 700 : 500,
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    background: i === active && !o.disabled ? "var(--gw-bg)" : "transparent",
                    color: o.disabled ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                    opacity: o.disabled ? 0.6 : 1,
                    cursor: o.disabled ? "default" : "pointer",
                  }}
                >
                  {o.label || " "}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </span>
  );
}

// Options whose label starts with (or has a word starting with) what's typed,
// then any that contain it.
function matching(opts: Opt[], query: string | null): Opt[] {
  const q = query?.trim().toLowerCase();
  if (!q) return opts;
  const starts: Opt[] = [];
  const has: Opt[] = [];
  for (const o of opts) {
    const l = o.label.toLowerCase();
    if (l.startsWith(q) || l.split(/[\s(/–-]+/).some((w) => w.startsWith(q))) starts.push(o);
    else if (l.includes(q)) has.push(o);
  }
  return [...starts, ...has];
}

function firstEnabled(list: Opt[], from = 0, step = 1) {
  for (let i = from; i >= 0 && i < list.length; i += step) if (!list[i].disabled) return i;
  return -1;
}

// The options a <select>'s children describe.
function collectOptions(children: ReactNode, group: string | null = null, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { children?: ReactNode; value?: unknown; label?: unknown; disabled?: boolean };
    if (c.type === Fragment) collectOptions(p.children, group, out);
    else if (c.type === "optgroup") collectOptions(p.children, p.label != null ? String(p.label) : null, out);
    else if (c.type === "option") {
      const label = textOf(p.children).replace(/\s+/g, " ").trim();
      out.push({
        value: p.value !== undefined && p.value !== null ? String(p.value) : label,
        label,
        disabled: !!p.disabled,
        group,
      });
    }
  });
  return out;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}
