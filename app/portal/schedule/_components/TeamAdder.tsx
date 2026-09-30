"use client";
// "Add a team": type a name and pick the program from External Contacts
// (the board sees them all, found by their name, nickname, the short names
// coaches use, or their city), a team already on the schedule, or keep what
// you typed as a name. Space (or the down arrow, or the arrow button) on an
// empty field lists every program to scroll through.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icons } from "../../../components/icons";
import { buildTeamIndex, matchTeam, normalizeTeamName } from "../../../../lib/hs-schedule/match";
import type { HsContactOption } from "../../../../lib/hs-schedule/types";

export interface TeamPick {
  name: string;
  contact_id: string | null;
}

interface Suggestion extends TeamPick {
  hint: string | null;
  key: string;
}

const PROGRAM_TYPES = ["programs", "program", "opponents", "opponent", "other programs", "teams", "schools"];

export function TeamAdder({
  options,
  knownTeams,
  taken,
  onAdd,
  autoFocus,
  placeholder = "Add a team…",
}: {
  options: HsContactOption[];
  knownTeams: TeamPick[];
  // Teams already listed here (contact id or "name:<lower name>").
  taken: Set<string>;
  onAdd: (pick: TeamPick) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // The whole list, shown before anything is typed.
  const [browsing, setBrowsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const programs = useMemo(
    () =>
      options
        .filter((o) => !o.category || PROGRAM_TYPES.includes(o.category.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [options]
  );
  const index = useMemo(
    () =>
      buildTeamIndex(
        programs.map((o) => ({ id: o.id, name: o.name, nickname: o.nickname, aliases: o.aliases, city: o.city }))
      ),
    [programs]
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const t = q.trim();
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion) => {
      if (seen.has(s.key)) return;
      seen.add(s.key);
      out.push(s);
    };
    if (!t) {
      if (!browsing) return [];
      for (const o of programs) push({ key: o.id, name: o.name, contact_id: o.id, hint: placeOf(o) });
      const named = knownTeams
        .filter((k) => !k.contact_id)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const k of named) {
        push({ key: `name:${k.name.trim().toLowerCase()}`, name: k.name, contact_id: null, hint: "On the schedule before" });
      }
      return out;
    }
    const lower = t.toLowerCase();
    // The coaches' way of writing it ("DMW", "So Metro") first.
    const best = matchTeam(index, t, { loose: true });
    if (best) {
      const o = programs.find((p) => p.id === best.id);
      if (o) push({ key: o.id, name: o.name, contact_id: o.id, hint: placeOf(o) });
    }
    for (const o of programs) {
      const hay = [o.name, o.nickname, o.city, ...o.aliases].filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(lower)) push({ key: o.id, name: o.name, contact_id: o.id, hint: placeOf(o) });
      if (out.length >= 8) break;
    }
    for (const k of knownTeams) {
      if (out.length >= 8) break;
      if (!k.name.toLowerCase().includes(lower)) continue;
      const key = k.contact_id ?? `name:${k.name.trim().toLowerCase()}`;
      push({ key, name: k.name, contact_id: k.contact_id, hint: k.contact_id ? null : "On the schedule before" });
    }
    const exact = out.some((s) => normalizeTeamName(s.name) === normalizeTeamName(t));
    if (!exact) push({ key: `name:${lower}`, name: t, contact_id: null, hint: "Just the name" });
    return out;
  }, [q, browsing, index, programs, knownTeams]);

  const showing = open && suggestions.length > 0;

  // Keep the highlighted one in view as the arrows move through a long list.
  useEffect(() => {
    if (showing) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showing, active, listId]);

  function choose(s: Suggestion) {
    if (taken.has(s.key)) return;
    onAdd({ name: s.name, contact_id: s.contact_id });
    setQ("");
    setActive(0);
    setBrowsing(false);
    inputRef.current?.focus();
  }

  function browse() {
    setBrowsing(true);
    setOpen(true);
    setActive(0);
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--gw-fg-muted)", display: "flex" }}>
          <Icons.Plus width={13} height={13} />
        </span>
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
            if (!e.target.value.trim()) setBrowsing(false);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() =>
            setTimeout(() => {
              setOpen(false);
              setBrowsing(false);
            }, 150)
          }
          onKeyDown={(e) => {
            if (e.key === " " && !q) {
              // Space on an empty field shows the whole list.
              e.preventDefault();
              browse();
            } else if (e.key === "ArrowDown" && !showing) {
              e.preventDefault();
              browse();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const s = showing ? suggestions[active] : undefined;
              if (s) choose(s);
            } else if (e.key === "Escape" && (q || showing)) {
              e.stopPropagation();
              setQ("");
              setBrowsing(false);
            }
          }}
          placeholder={placeholder}
          aria-label="Add a team"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showing}
          aria-activedescendant={showing && suggestions[active] ? `${listId}-${active}` : undefined}
          style={{
            width: "100%",
            height: 34,
            boxSizing: "border-box",
            padding: "0 32px 0 28px",
            borderRadius: 8,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg)",
            color: "var(--gw-fg)",
            fontSize: 13,
            fontWeight: 500,
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show all teams"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (showing && !q) {
              setBrowsing(false);
            } else if (!q) {
              browse();
            }
          }}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: "var(--gw-fg-muted)",
            cursor: "pointer",
          }}
        >
          <Icons.ChevronDown width={13} height={13} />
        </button>
      </div>
      {showing && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 5,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,.14)",
            padding: 4,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {suggestions.map((s, i) => {
            const isTaken = taken.has(s.key);
            return (
              <button
                key={s.key}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                disabled={isTaken}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "7px 9px",
                  border: "none",
                  borderRadius: 7,
                  background: i === active && !isTaken ? "var(--gw-bg)" : "transparent",
                  color: isTaken ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                  textAlign: "left",
                  cursor: isTaken ? "default" : "pointer",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: s.contact_id ? 700 : 600, fontStyle: s.contact_id ? "normal" : "italic" }}>
                  {s.contact_id ? s.name : `“${s.name}”`}
                </span>
                <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {isTaken ? "Already listed" : s.hint}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function placeOf(o: HsContactOption): string | null {
  const p = [o.city, o.state].filter(Boolean).join(", ");
  return p || null;
}
