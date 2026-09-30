"use client";
// The card that opens over a team's cell in the grid (hover it, or tap it):
// how many games that team of ours plays that weekend and the teams coming,
// confirmed, on the fence or not coming, each linked to its program in
// External Contacts when the viewer can open it. "Edit" turns the same card into the
// editor: the games (and "not sure yet"), each team's Yes / Maybe / No,
// whether it's coming for this team of ours or every team we bring, scores,
// and "Add a team".
//
// On a phone it opens as a sheet from the bottom instead.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import {
  addOpponent,
  deleteOpponent,
  setWeekendGames,
  updateOpponent,
} from "../../../../lib/hs-schedule/actions";
import {
  formatWeekendDates,
  opponentKey,
  resultLabel,
  summarizeCell,
} from "../../../../lib/hs-schedule/logic";
import type {
  HsContactOption,
  HsContactRef,
  HsGames,
  HsLevel,
  HsOpponent,
  HsOpponentStatus,
  HsWeekend,
} from "../../../../lib/hs-schedule/types";
import type { ScheduleAction } from "./store";
import { TeamAdder, type TeamPick } from "./TeamAdder";

const WIDTH = 340;

export interface CellTarget {
  weekend: HsWeekend;
  level: HsLevel;
  anchor: HTMLElement;
  pinned: boolean;
  editing: boolean;
}

export function levelTitle(l: HsLevel): string {
  return l.name && l.name !== l.label ? `${l.name} (${l.label})` : l.label;
}

export function CellPopover({
  target,
  games,
  list,
  weekendOpponents,
  contacts,
  canEdit,
  options,
  knownTeams,
  today,
  dispatch,
  onError,
  onClose,
  onPin,
  onHover,
  onOpenWeekend,
}: {
  target: CellTarget;
  games: HsGames | undefined;
  // The teams this cell lists (lib/hs-schedule/logic.ts cellOpponents).
  list: HsOpponent[];
  // Every team row on this weekend, for tidying up when a row's scope changes.
  weekendOpponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  canEdit: boolean;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  today: string;
  dispatch: (a: ScheduleAction) => void;
  onError: (msg: string) => void;
  onClose: () => void;
  onPin: (editing: boolean) => void;
  onHover: (inside: boolean) => void;
  onOpenWeekend: () => void;
}) {
  const { weekend, level } = target;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; sheet: boolean } | null>(null);
  const summary = summarizeCell(games, list);
  const past = weekend.ends_on < today;

  // Place it under the cell (above when there's no room), kept on screen;
  // a sheet along the bottom on a phone.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth < 640) {
        setPos({ top: 0, left: 0, sheet: true });
        return;
      }
      const r = target.anchor.getBoundingClientRect();
      const h = el.offsetHeight;
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : Math.min(below, Math.max(8, window.innerHeight - 8 - h));
      const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
      setPos({ top, left, sheet: false });
    };
    place();
    const onMove = () => (target.pinned ? place() : onClose());
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [target, onClose, list.length, target.editing, summary.count]);

  // Escape closes; a click outside closes a pinned card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!target.pinned) return;
      const t = e.target as Node;
      if (ref.current?.contains(t) || target.anchor.contains(t)) return;
      // The guided tour's Next / Back, while it points at this card.
      if (t instanceof Element && t.closest("[data-guided-tour]")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [target, onClose]);

  const sheet = pos?.sheet ?? false;
  const style: CSSProperties = sheet
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "82vh",
        borderRadius: "16px 16px 0 0",
      }
    : {
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: WIDTH,
        maxHeight: "min(560px, calc(100vh - 16px))",
        borderRadius: 14,
      };

  const card = (
    <>
      {sheet && (
        <div
          aria-hidden
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(11,11,12,.3)", zIndex: 79 }}
        />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-label={`${levelTitle(level)}, ${weekend.event || "weekend"}`}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        data-tour="schedule-popover"
        style={{
          ...style,
          zIndex: 80,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          boxShadow: "0 18px 44px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--gw-border)", display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
              {levelTitle(level)} · {formatWeekendDates(weekend.starts_on, weekend.ends_on)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>{weekend.event || "Weekend"}</div>
          </div>
          {(target.pinned || sheet) && (
            <button type="button" aria-label="Close" onClick={onClose} style={iconBtn}>
              <Icons.X width={14} height={14} />
            </button>
          )}
        </div>

        <div style={{ overflowY: "auto", padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {target.editing && canEdit ? (
            <Editor
              weekend={weekend}
              level={level}
              games={games}
              list={list}
              weekendOpponents={weekendOpponents}
              contacts={contacts}
              options={options}
              knownTeams={knownTeams}
              past={past}
              dispatch={dispatch}
              onError={onError}
            />
          ) : (
            <Viewer
              summary={summary}
              games={games}
              level={level}
              contacts={contacts}
              past={past}
              // Teams coming for every team we bring, when this one of ours
              // isn't playing that weekend.
              others={
                new Set(
                  weekendOpponents
                    .filter((o) => !o.level_id && o.status !== "declined" && !list.some((x) => opponentKey(x) === opponentKey(o)))
                    .map(opponentKey)
                ).size
              }
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 10px",
            borderTop: "1px solid var(--gw-border)",
            background: "var(--gw-bg)",
          }}
        >
          <button type="button" onClick={onOpenWeekend} style={textBtn}>
            Weekend details
            <Icons.ChevronRight width={12} height={12} />
          </button>
          {canEdit &&
            (target.editing ? (
              <button type="button" onClick={() => onPin(false)} style={primaryBtn} data-tour="schedule-popover-done">
                Done
              </button>
            ) : (
              <button type="button" onClick={() => onPin(true)} style={primaryBtn} data-tour="schedule-popover-edit">
                <Icons.Pencil width={12} height={12} />
                Edit
              </button>
            ))}
        </div>
      </div>
    </>
  );
  return createPortal(card, document.body);
}

// ─── Reading ────────────────────────────────────────────────────────────────

function Viewer({
  summary,
  games,
  level,
  contacts,
  others,
  past,
}: {
  summary: ReturnType<typeof summarizeCell>;
  games: HsGames | undefined;
  level: HsLevel;
  contacts: Map<string, HsContactRef>;
  others: number;
  // The weekend is over: the teams "played", rather than are coming.
  past: boolean;
}) {
  const nothing = summary.confirmed.length + summary.tentative.length + summary.declined.length === 0;
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
        {summary.count != null ? (
          <span>
            <strong style={{ fontSize: 15 }}>{summary.count}</strong> game{summary.count === 1 ? "" : "s"}
          </span>
        ) : (
          <span style={{ color: "var(--gw-fg-muted)" }}>{summary.unsure ? "Games not settled" : "No games entered"}</span>
        )}
        {summary.unsure && summary.count != null && <FenceTag>not sure yet</FenceTag>}
        {summary.tbd > 0 && (
          <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            · {summary.tbd} opponent{summary.tbd === 1 ? "" : "s"} still to name
          </span>
        )}
      </div>
      {games?.note && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{games.note}</div>}
      {nothing ? (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
          No teams named for {level.label} yet.
          {others > 0 && summary.count == null && !summary.unsure && (
            <>
              {" "}
              {others} team{others === 1 ? " is" : "s are"} coming this weekend for our other teams; enter {level.label}
              &apos;s games to list them here too.
            </>
          )}
        </div>
      ) : (
        <>
          <Section title={past ? "Played" : "Coming"} rows={summary.confirmed} tone="confirmed" contacts={contacts} level={level} />
          <Section title={past ? "Were on the fence" : "On the fence"} rows={summary.tentative} tone="tentative" contacts={contacts} level={level} />
          <Section title={past ? "Didn't come" : "Not coming"} rows={summary.declined} tone="declined" contacts={contacts} level={level} />
        </>
      )}
    </>
  );
}

function Section({
  title,
  rows,
  tone,
  contacts,
  level,
}: {
  title: string;
  rows: HsOpponent[];
  tone: HsOpponentStatus;
  contacts: Map<string, HsContactRef>;
  level: HsLevel;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={cap}>
        {title} ({rows.length})
      </span>
      {rows.map((o) => {
        const c = o.contact_id ? contacts.get(o.contact_id) : undefined;
        const name = c?.name ?? o.name;
        const place = c ? [c.city, c.state].filter(Boolean).join(", ") : "";
        const result = resultLabel(o);
        const nameEl = (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: tone === "declined" ? "var(--gw-fg-muted)" : "var(--gw-fg)",
              textDecoration: tone === "declined" ? "line-through" : "none",
            }}
          >
            {name}
          </span>
        );
        return (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", minHeight: 26 }}>
            <Dot tone={tone} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              {o.contact_id && c ? (
                <Link href={`/portal/contacts/${o.contact_id}`} style={{ textDecoration: "none" }} title={`Open ${name} in External Contacts`}>
                  {nameEl}
                </Link>
              ) : (
                nameEl
              )}
              {place && <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{place}</span>}
              {o.level_id && (
                <span style={{ fontSize: 10, color: "var(--gw-fg-muted)", fontWeight: 700, border: "1px solid var(--gw-border)", borderRadius: 100, padding: "0 6px" }}>
                  {level.label} only
                </span>
              )}
            </div>
            {result && (
              <span className={`rsd-chip ${result.startsWith("W") ? "rsd-chip-success" : "rsd-chip-mute"}`} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                {result}
              </span>
            )}
            {o.contact_id && c && (
              <Link href={`/portal/contacts/${o.contact_id}`} aria-label={`Open ${name}`} style={{ color: "var(--gw-fg-muted)", display: "flex" }}>
                <Icons.ChevronRight width={12} height={12} />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Editing ────────────────────────────────────────────────────────────────

function Editor({
  weekend,
  level,
  games,
  list,
  weekendOpponents,
  contacts,
  options,
  knownTeams,
  past,
  dispatch,
  onError,
}: {
  weekend: HsWeekend;
  level: HsLevel;
  games: HsGames | undefined;
  list: HsOpponent[];
  weekendOpponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  past: boolean;
  dispatch: (a: ScheduleAction) => void;
  onError: (msg: string) => void;
}) {
  const [addStatus, setAddStatus] = useState<HsOpponentStatus>("confirmed");
  const [addAll, setAddAll] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);

  const saveGames = async (next: { games: number | null; unsure: boolean; note?: string | null }) => {
    const before = games ?? null;
    const optimistic: HsGames = { weekend_id: weekend.id, level_id: level.id, note: games?.note ?? null, ...next, games: next.games };
    dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: optimistic });
    const res = await setWeekendGames({ weekend_id: weekend.id, level_id: level.id, ...next, note: next.note ?? games?.note ?? null });
    if (res.error) {
      dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: before });
      onError(res.error);
    } else dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: res.data ?? null });
  };

  const patch = async (o: HsOpponent, p: Partial<HsOpponent>) => {
    dispatch({ type: "opponent", row: { ...o, ...p } });
    const res = await updateOpponent(o.id, p);
    if (res.error || !res.data) {
      dispatch({ type: "opponent", row: o });
      onError(res.error ?? "Couldn't save.");
    } else dispatch({ type: "opponent", row: res.data });
  };

  const remove = async (o: HsOpponent) => {
    const name = (o.contact_id && contacts.get(o.contact_id)?.name) || o.name;
    if (!o.level_id && !confirm(`Take ${name} off this weekend for every team?`)) return;
    dispatch({ type: "opponentGone", id: o.id });
    const res = await deleteOpponent(o.id);
    if (res.error) {
      dispatch({ type: "opponent", row: o });
      onError(res.error);
    }
  };

  // This team of ours only ⇄ every team we bring. Going to every team also
  // folds in the program's rows for our other teams (unless they have a score).
  const setScope = async (o: HsOpponent, all: boolean) => {
    if (all === !o.level_id) return;
    if (all) {
      const twins = weekendOpponents.filter(
        (x) => x.id !== o.id && x.level_id && opponentKey(x) === opponentKey(o) && x.our_score == null
      );
      for (const t of twins) {
        dispatch({ type: "opponentGone", id: t.id });
        void deleteOpponent(t.id);
      }
    }
    await patch(o, { level_id: all ? null : level.id });
  };

  const add = async (pick: TeamPick) => {
    const res = await addOpponent({
      weekend_id: weekend.id,
      level_id: addAll ? null : level.id,
      contact_id: pick.contact_id,
      name: pick.name,
      status: addStatus,
    });
    if (res.error || !res.data) onError(res.error ?? "Couldn't add the team.");
    else dispatch({ type: "opponent", row: res.data });
  };

  const n = games?.games ?? null;
  const taken = new Set(list.map(opponentKey));

  return (
    <>
      {/* Games */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} data-tour="schedule-popover-games">
        <span style={{ ...cap, minWidth: 44 }}>Games</span>
        <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--gw-border)", borderRadius: 9, overflow: "hidden" }}>
          <button
            type="button"
            aria-label="One game fewer"
            disabled={n == null}
            onClick={() => saveGames({ games: n == null || n <= 0 ? null : n - 1, unsure: !!games?.unsure })}
            style={stepBtn}
          >
            −
          </button>
          <span style={{ minWidth: 30, textAlign: "center", fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {n ?? "–"}
          </span>
          <button
            type="button"
            aria-label="One game more"
            onClick={() => saveGames({ games: Math.min(30, (n ?? 0) + 1), unsure: !!games?.unsure })}
            style={stepBtn}
          >
            +
          </button>
        </div>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!games?.unsure}
            onChange={(e) => saveGames({ games: n, unsure: e.target.checked })}
            style={{ accentColor: "var(--rsd-accent-fill)" }}
          />
          Not sure yet
        </label>
      </div>

      {/* Add a team */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-tour="schedule-popover-add">
        <TeamAdder options={options} knownTeams={knownTeams} taken={taken} onAdd={add} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusSwitch value={addStatus} onChange={setAddStatus} name="the new team" />
          <label style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 11.5, fontWeight: 600, cursor: "pointer", color: "var(--gw-fg-muted)" }}>
            <input type="checkbox" checked={addAll} onChange={(e) => setAddAll(e.target.checked)} style={{ accentColor: "var(--rsd-accent-fill)" }} />
            For all our teams
          </label>
        </div>
      </div>
      {/* Teams */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={cap}>Teams</span>
        {list.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>None yet. Add one below.</div>
        )}
        {list.map((o) => {
          const name = (o.contact_id && contacts.get(o.contact_id)?.name) || o.name;
          return (
            <div key={o.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", borderTop: "1px solid var(--gw-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Dot tone={o.status} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                  {name}
                </span>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => remove(o)} style={iconBtn}>
                  <Icons.Trash width={13} height={13} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingLeft: 14 }}>
                <StatusSwitch value={o.status} onChange={(s) => patch(o, { status: s })} name={name} />
                <select
                  value={o.level_id ? "one" : "all"}
                  onChange={(e) => setScope(o, e.target.value === "all")}
                  aria-label={`Which of our teams ${name} plays`}
                  style={miniSelect}
                >
                  <option value="one">{level.label} only</option>
                  <option value="all">All our teams</option>
                </select>
                {(past || o.our_score != null) && o.level_id && (
                  <button type="button" onClick={() => setScoring(scoring === o.id ? null : o.id)} style={{ ...textBtn, fontSize: 11 }}>
                    {resultLabel(o) ?? "Score"}
                  </button>
                )}
              </div>
              {scoring === o.id && (
                <ScoreInputs
                  o={o}
                  onSave={(ours, theirs) => {
                    setScoring(null);
                    void patch(o, { our_score: ours, their_score: theirs });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

    </>
  );
}

function ScoreInputs({ o, onSave }: { o: HsOpponent; onSave: (ours: number | null, theirs: number | null) => void }) {
  const [ours, setOurs] = useState(o.our_score?.toString() ?? "");
  const [theirs, setTheirs] = useState(o.their_score?.toString() ?? "");
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(num(ours), num(theirs));
      }}
      style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 14 }}
    >
      <input aria-label="Our score" inputMode="numeric" value={ours} onChange={(e) => setOurs(e.target.value.replace(/\D/g, ""))} placeholder="Us" style={scoreInput} autoFocus />
      <span style={{ color: "var(--gw-fg-muted)" }}>–</span>
      <input aria-label="Their score" inputMode="numeric" value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/\D/g, ""))} placeholder="Them" style={scoreInput} />
      <button type="submit" style={primaryBtn}>
        Save
      </button>
    </form>
  );
}

// Yes (confirmed) / Maybe (on the fence) / No (not coming).
export function StatusSwitch({
  value,
  onChange,
  name,
}: {
  value: HsOpponentStatus;
  onChange: (s: HsOpponentStatus) => void;
  name: string;
}) {
  const opts: { v: HsOpponentStatus; label: string; aria: string }[] = [
    { v: "confirmed", label: "Yes", aria: "Coming" },
    { v: "tentative", label: "Maybe", aria: "On the fence" },
    { v: "declined", label: "No", aria: "Not coming" },
  ];
  return (
    <div role="radiogroup" aria-label={`Is ${name} coming?`} style={{ display: "inline-flex", padding: 2, gap: 2, borderRadius: 8, background: "var(--gw-border)" }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            title={o.aria}
            onClick={() => !on && onChange(o.v)}
            style={{
              padding: "3px 9px",
              borderRadius: 6,
              border: "none",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: on ? "default" : "pointer",
              background: on ? (o.v === "confirmed" ? "#2E9E4F" : o.v === "tentative" ? "#F2C200" : "var(--gw-bg-elev)") : "transparent",
              color: on ? (o.v === "confirmed" ? "#fff" : o.v === "tentative" ? "#0B0B0C" : "var(--gw-fg)") : "var(--gw-fg-muted)",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,.1)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

export function Dot({ tone }: { tone: HsOpponentStatus }) {
  const s: CSSProperties =
    tone === "confirmed"
      ? { background: "#2E9E4F", border: "2px solid #2E9E4F" }
      : tone === "tentative"
        ? { background: "transparent", border: "2px dashed #D39B00" }
        : { background: "transparent", border: "2px solid var(--gw-fg-faint)" };
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 5, flexShrink: 0, boxSizing: "content-box", ...s }} />;
}

function FenceTag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8A6100", background: "rgba(255, 214, 0, 0.18)", borderRadius: 100, padding: "1px 7px" }}>
      {children}
    </span>
  );
}

const cap: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

const iconBtn: CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const textBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "none",
  border: "none",
  padding: "4px 6px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gw-fg)",
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 100,
  border: "1px solid var(--rsd-accent-fill)",
  background: "var(--rsd-accent-fill)",
  color: "var(--rsd-accent-fill-on)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const stepBtn: CSSProperties = {
  width: 30,
  height: 28,
  border: "none",
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const miniSelect: CSSProperties = {
  height: 26,
  padding: "0 6px",
  borderRadius: 7,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
  fontSize: 11.5,
  fontWeight: 600,
};

const scoreInput: CSSProperties = {
  width: 52,
  height: 28,
  padding: "0 6px",
  borderRadius: 7,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "center",
};
