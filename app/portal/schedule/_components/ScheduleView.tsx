"use client";
// The HS Schedule: one season on a page, laid out like the planning
// spreadsheet's "HS Schedule" tab. A row per weekend, grouped by month: the
// dates, where and how far, the event (colored by how it stands, with the
// teams coming under it), a column per team of ours with its games, and the
// notes. Hover a team's count (or tap it) to see the teams coming and edit
// them; tap an event for the weekend's details. Past seasons are one click
// away, and "Compare" puts another season's same weekend beside each row.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { PlanningImportSheet } from "../../../components/PlanningImportSheet";
import {
  WEEKEND_STATUSES,
  cellOpponents,
  formatWeekdays,
  levelPlays,
  formatWeekendDates,
  levelTotals,
  matchingWeekends,
  monthHeading,
  monthKey,
  nextWeekendDates,
  recordLabel,
  sortWeekends,
  summarizeCell,
} from "../../../../lib/hs-schedule/logic";
import { seasonLabel } from "../../../../lib/planning/season";
import type {
  HsContactOption,
  HsContactRef,
  HsGames,
  HsLevel,
  HsOpponent,
  HsSeason,
  HsSeasonSchedule,
  HsWeekend,
} from "../../../../lib/hs-schedule/types";
import { CellPopover, levelTitle, type CellTarget } from "./CellPopover";
import { SeasonSheet, type DirectoryTeam } from "./SeasonSheet";
import { NewSeasonSheet } from "./NewSeasonSheet";
import { STATUS_STYLE, StatusChip } from "./status";
import { scheduleReducer } from "./store";
import type { TeamPick } from "./TeamAdder";
import { WeekendSheet } from "./WeekendSheet";

export interface CompareWeekend {
  id: string;
  starts_on: string;
  ends_on: string;
  event: string;
  status: HsWeekend["status"];
}

type SheetState =
  | { kind: "weekend"; id: string | null }
  | { kind: "season" }
  | { kind: "new-season" }
  | { kind: "import" }
  | null;

export function ScheduleView({
  schedule,
  seasons,
  compare,
  isStaff,
  options,
  knownTeams,
  directoryTeams,
  today,
}: {
  schedule: HsSeasonSchedule;
  seasons: HsSeason[];
  compare: { season: number; weekends: CompareWeekend[] } | null;
  isStaff: boolean;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  directoryTeams: DirectoryTeam[];
  today: string;
}) {
  const router = useRouter();
  const season = schedule.season;
  const fromServer = (x: HsSeasonSchedule) => ({
    levels: x.levels,
    weekends: x.weekends,
    games: x.games,
    opponents: x.opponents,
  });
  const [state, dispatch] = useReducer(scheduleReducer, schedule, fromServer);
  // New data from the server (Season settings refreshes the page): start the
  // page's copy over from it.
  const [loaded, setLoaded] = useState(schedule);
  if (loaded !== schedule) {
    setLoaded(schedule);
    dispatch({ type: "reset", state: fromServer(schedule) });
  }
  const [showHidden, setShowHidden] = useState(false);
  const [cell, setCell] = useState<CellTarget | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contacts = useMemo(() => new Map<string, HsContactRef>(schedule.contacts.map((c) => [c.id, c])), [schedule.contacts]);
  const levels = useMemo(() => [...state.levels].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [state.levels]);
  const hiddenCount = levels.filter((l) => l.hidden).length;
  const shownLevels = levels.filter((l) => showHidden || !l.hidden);
  const weekends = useMemo(() => sortWeekends(state.weekends), [state.weekends]);
  const totals = useMemo(() => levelTotals(levels, weekends, state.games, state.opponents), [levels, weekends, state.games, state.opponents]);
  const gamesAt = useCallback(
    (w: string, l: string) => state.games.find((g) => g.weekend_id === w && g.level_id === l),
    [state.games]
  );
  const known = useMemo(() => {
    // Teams already on this season count as known too.
    const seen = new Map<string, TeamPick>();
    for (const k of [...knownTeams, ...state.opponents.map((o) => ({ name: o.name, contact_id: o.contact_id }))]) {
      const key = k.contact_id ?? `name:${k.name.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, k);
    }
    return [...seen.values()];
  }, [knownTeams, state.opponents]);

  // Opened from a contact's page: #w-<weekend id> scrolls to it and marks it.
  useEffect(() => {
    const m = window.location.hash.match(/^#w-([0-9a-f-]{36})$/i);
    if (!m) return;
    // The grid's row, or on a phone the weekend's card.
    const el = [document.getElementById(`w-${m[1]}`), document.getElementById(`wm-${m[1]}`)].find(
      (x) => x && x.offsetParent !== null
    );
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const on = requestAnimationFrame(() => setFlash(m[1]));
    const off = setTimeout(() => setFlash(null), 2400);
    return () => {
      cancelAnimationFrame(on);
      clearTimeout(off);
    };
  }, []);

  // ─── The team cell's card: hover to peek, click to keep it open ──────────
  const clearTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const openCell = (weekend: HsWeekend, level: HsLevel, anchor: HTMLElement, pinned: boolean) => {
    clearTimer();
    setCell((cur) => {
      const same = !!cur && cur.weekend.id === weekend.id && cur.level.id === level.id;
      // Clicking the cell of a card that's already kept open closes it.
      if (same && pinned && cur!.pinned && !cur!.editing) return null;
      if (same) return { ...cur!, anchor, pinned: cur!.pinned || pinned };
      return { weekend, level, anchor, pinned, editing: false };
    });
  };
  const hoverIn = (weekend: HsWeekend, level: HsLevel, anchor: HTMLElement) => {
    if (cell?.pinned) return;
    clearTimer();
    hoverTimer.current = setTimeout(() => openCell(weekend, level, anchor, false), 140);
  };
  const hoverOut = () => {
    clearTimer();
    hoverTimer.current = setTimeout(() => setCell((c) => (c && !c.pinned ? null : c)), 220);
  };
  const closeCell = useCallback(() => {
    clearTimer();
    setCell(null);
  }, []);

  // Keep the open card's weekend current as it's edited.
  const liveCell = cell ? { ...cell, weekend: weekends.find((w) => w.id === cell.weekend.id) ?? cell.weekend } : null;

  const byMonth = useMemo(() => {
    const out: { key: string; heading: string; rows: HsWeekend[] }[] = [];
    for (const w of weekends) {
      const k = monthKey(w.starts_on);
      const last = out[out.length - 1];
      if (last && last.key === k) last.rows.push(w);
      else out.push({ key: k, heading: monthHeading(w.starts_on), rows: [w] });
    }
    return out;
  }, [weekends]);

  const comparing = compare ? seasonLabel(compare.season) : null;
  const sheetWeekend = sheet?.kind === "weekend" && sheet.id ? weekends.find((w) => w.id === sheet.id) ?? null : null;
  const seasonIndex = seasons.findIndex((s) => s.season === season.season);
  const older = seasons[seasonIndex + 1];
  const newer = seasons[seasonIndex - 1];

  return (
    <>
      {/* ─── Season switcher and actions ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-tour="schedule-seasons">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <SeasonArrow href={older ? `/portal/schedule?season=${older.season}` : null} label={older ? `Back to ${seasonLabel(older.season)}` : "No earlier season"}>
              <Icons.ChevronLeft width={16} height={16} />
            </SeasonArrow>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", minWidth: 96, textAlign: "center" }}>
              {seasonLabel(season.season)}
            </h2>
            <SeasonArrow href={newer ? `/portal/schedule?season=${newer.season}` : null} label={newer ? `On to ${seasonLabel(newer.season)}` : "No later season"}>
              <Icons.ChevronRight width={16} height={16} />
            </SeasonArrow>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[...seasons].reverse().map((s) => (
              <Link
                key={s.id}
                href={`/portal/schedule?season=${s.season}`}
                aria-current={s.season === season.season ? "page" : undefined}
                style={{
                  padding: "4px 10px",
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: "1px solid",
                  borderColor: s.season === season.season ? "var(--rsd-accent-fill)" : "var(--gw-border)",
                  background: s.season === season.season ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
                  color: s.season === season.season ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
                }}
              >
                {seasonLabel(s.season)}
              </Link>
            ))}
            {isStaff && (
              <button
                type="button"
                onClick={() => setSheet({ kind: "new-season" })}
                data-tour="schedule-new-season"
                style={{ padding: "4px 10px", borderRadius: 100, fontSize: 12, fontWeight: 700, border: "1px dashed var(--gw-border)", background: "transparent", color: "var(--gw-fg-muted)", cursor: "pointer" }}
              >
                + New season
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {isStaff && (
            <span data-tour="schedule-import" style={{ display: "inline-flex" }}>
              <Pill variant="ghost" size="sm" onClick={() => setSheet({ kind: "import" })}>
                <Icons.Download width={13} height={13} style={{ transform: "rotate(180deg)" }} /> Import spreadsheet
              </Pill>
            </span>
          )}
          <span data-tour="schedule-season-settings" style={{ display: "inline-flex" }}>
            <Pill variant="ghost" size="sm" onClick={() => setSheet({ kind: "season" })}>
              <Icons.Cog width={13} height={13} /> Season
            </Pill>
          </span>
          <span data-tour="schedule-add-weekend" style={{ display: "inline-flex" }}>
            <Pill variant="accent" size="sm" onClick={() => setSheet({ kind: "weekend", id: null })}>
              <Icons.Plus width={13} height={13} /> Add weekend
            </Pill>
          </span>
        </div>
      </div>

      {/* ─── Title, key and view options ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-tour="schedule-legend">
          <span style={{ fontSize: 13, fontWeight: 700, marginRight: 4 }}>{season.title}</span>
          {WEEKEND_STATUSES.filter((s) => s.legend).map((s) => (
            <StatusChip key={s.value} status={s.value} small />
          ))}
          <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <UnsureSample /> not sure yet
          </span>
          <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <FenceDot /> teams on the fence
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {hiddenCount > 0 && (
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} style={{ accentColor: "var(--rsd-accent-fill)" }} />
              Show hidden columns ({hiddenCount})
            </label>
          )}
          {seasons.length > 1 && (
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 600 }} data-tour="schedule-compare">
              Compare with
              <select
                value={compare?.season ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  router.push(`/portal/schedule?season=${season.season}${v ? `&compare=${v}` : ""}`);
                }}
                style={{ height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)", color: "var(--gw-fg)", fontSize: 12, fontWeight: 600 }}
              >
                <option value="">No other season</option>
                {seasons
                  .filter((s) => s.season !== season.season)
                  .map((s) => (
                    <option key={s.id} value={s.season}>
                      {seasonLabel(s.season)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--gw-error-bg)", border: "1px solid rgba(229,62,62,.25)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}
        >
          <Icons.AlertCircle width={16} height={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}>
            <Icons.X width={14} height={14} />
          </button>
        </div>
      )}

      {weekends.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No weekends yet</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
            Add the season&apos;s weekends one at a time, or import them from the planning spreadsheet.
          </div>
        </div>
      ) : (
        <>
          {/* ─── Desktop: the grid ─── */}
          <div className="rsd-card gw-desktop-table" style={{ padding: 0, gap: 0, overflowX: "auto" }} data-tour="schedule-grid">
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 780 + shownLevels.length * 56 + (comparing ? 180 : 0) }}>
              <thead>
                <tr>
                  <Th style={{ width: 104 }}>Weekend</Th>
                  <Th style={{ width: 118 }}>Where</Th>
                  <Th>Event</Th>
                  {comparing && <Th style={{ width: 180 }}>{comparing}</Th>}
                  {shownLevels.map((l) => (
                    <Th key={l.id} style={{ width: 56, textAlign: "center", padding: "10px 3px", letterSpacing: ".01em" }} title={levelTitle(l)}>
                      <span style={{ color: "var(--gw-fg)", opacity: l.hidden ? 0.55 : 1 }}>{l.label}</span>
                    </Th>
                  ))}
                  <Th style={{ width: 168 }}>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map((m) => (
                  <MonthRows
                    key={m.key}
                    heading={m.heading}
                    rows={m.rows}
                    span={4 + shownLevels.length + (comparing ? 1 : 0)}
                    render={(w) => (
                      <WeekendRow
                        key={w.id}
                        w={w}
                        levels={shownLevels}
                        opponents={state.opponents}
                        contacts={contacts}
                        gamesAt={gamesAt}
                        today={today}
                        flash={flash === w.id}
                        active={liveCell?.weekend.id === w.id ? liveCell.level.id : null}
                        compare={
                          compare
                            ? matchingWeekends(w, season.season, compare.season, compare.weekends)
                            : null
                        }
                        onEvent={() => setSheet({ kind: "weekend", id: w.id })}
                        onHoverIn={hoverIn}
                        onHoverOut={hoverOut}
                        onOpen={openCell}
                      />
                    )}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3 + (comparing ? 1 : 0)} style={{ ...footCell, textAlign: "right" }}>
                    Total games
                  </td>
                  {shownLevels.map((l) => {
                    const t = totals.get(l.id)!;
                    const rec = recordLabel(t);
                    return (
                      <td key={l.id} style={{ ...footCell, textAlign: "center" }} title={t.unsure ? `${t.unsure} of them not sure yet` : undefined}>
                        <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{t.games}</div>
                        {t.unsure > 0 && <div style={{ fontSize: 10, color: "#8A6100", fontWeight: 700 }}>{t.unsure}?</div>}
                        {rec && <div style={{ fontSize: 10, color: "var(--gw-fg-muted)", fontWeight: 700 }}>{rec}</div>}
                      </td>
                    );
                  })}
                  <td style={footCell} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ─── Phone: a card per weekend ─── */}
          <div className="gw-mobile-cards" style={{ gap: 14 }}>
            {byMonth.map((m) => (
              <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={monthLabel}>{m.heading}</div>
                {m.rows.map((w) => (
                  <WeekendCard
                    key={w.id}
                    w={w}
                    levels={shownLevels}
                    opponents={state.opponents}
                    contacts={contacts}
                    gamesAt={gamesAt}
                    today={today}
                    flash={flash === w.id}
                    onEvent={() => setSheet({ kind: "weekend", id: w.id })}
                    onOpen={openCell}
                  />
                ))}
              </div>
            ))}
            <div className="rsd-card" style={{ gap: 8, padding: 14 }}>
              <div style={monthLabel}>Total games</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {shownLevels.map((l) => {
                  const t = totals.get(l.id)!;
                  return (
                    <span key={l.id} className="rsd-chip rsd-chip-mute" style={{ fontSize: 12 }}>
                      {l.label} {t.games}
                      {t.unsure ? ` (${t.unsure}?)` : ""}
                      {recordLabel(t) ? ` · ${recordLabel(t)}` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {liveCell && (
        <CellPopover
          target={liveCell}
          games={gamesAt(liveCell.weekend.id, liveCell.level.id)}
          list={cellOpponents(
            liveCell.weekend.id,
            liveCell.level.id,
            state.opponents,
            levelPlays(gamesAt(liveCell.weekend.id, liveCell.level.id))
          )}
          weekendOpponents={state.opponents.filter((o) => o.weekend_id === liveCell.weekend.id)}
          contacts={contacts}
          canEdit
          options={options}
          knownTeams={known}
          today={today}
          dispatch={dispatch}
          onError={setError}
          onClose={closeCell}
          onPin={(editing) => setCell((c) => (c ? { ...c, pinned: true, editing } : c))}
          onHover={(inside) => {
            if (inside) clearTimer();
            else if (!cell?.pinned) hoverOut();
          }}
          onOpenWeekend={() => {
            const id = liveCell.weekend.id;
            closeCell();
            setSheet({ kind: "weekend", id });
          }}
        />
      )}

      {sheet?.kind === "weekend" && (
        <WeekendSheet
          key={sheet.id ?? "new"}
          seasonId={season.id}
          weekend={sheetWeekend}
          defaults={nextWeekendDates(season.season, weekends)}
          levels={levels}
          games={state.games}
          opponents={state.opponents}
          contacts={contacts}
          options={options}
          knownTeams={known}
          dispatch={dispatch}
          onClose={() => setSheet(null)}
          onSaved={(w) => setSheet({ kind: "weekend", id: w.id })}
        />
      )}
      {sheet?.kind === "season" && (
        <SeasonSheet season={season} levels={levels} seasons={seasons} teams={directoryTeams} isStaff={isStaff} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "new-season" && <NewSeasonSheet seasons={seasons} onClose={() => setSheet(null)} />}
      {sheet?.kind === "import" && <PlanningImportSheet schedules onClose={() => setSheet(null)} />}
    </>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function MonthRows({
  heading,
  rows,
  span,
  render,
}: {
  heading: string;
  rows: HsWeekend[];
  span: number;
  render: (w: HsWeekend) => React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td colSpan={span} style={{ ...monthLabel, padding: "14px 14px 6px", background: "var(--gw-bg)", borderBottom: "1px solid var(--gw-border)" }}>
          {heading}
        </td>
      </tr>
      {rows.map(render)}
    </>
  );
}

// The teams under an event: the confirmed ones by name, then how many are on
// the fence.
function teamLine(opps: HsOpponent[], contacts: Map<string, HsContactRef>): { names: string[]; more: number; fence: number } {
  const seen = new Set<string>();
  const confirmed: string[] = [];
  let fence = 0;
  const fenceSeen = new Set<string>();
  for (const o of opps) {
    const key = o.contact_id ?? o.name.toLowerCase();
    const name = (o.contact_id && contacts.get(o.contact_id)?.name) || o.name;
    if (o.status === "confirmed" && !seen.has(key)) {
      seen.add(key);
      confirmed.push(name);
    }
  }
  for (const o of opps) {
    const key = o.contact_id ?? o.name.toLowerCase();
    if (o.status === "tentative" && !seen.has(key) && !fenceSeen.has(key)) {
      fenceSeen.add(key);
      fence++;
    }
  }
  return { names: confirmed.slice(0, 4), more: Math.max(0, confirmed.length - 4), fence };
}

function WeekendRow({
  w,
  levels,
  opponents,
  contacts,
  gamesAt,
  today,
  flash,
  active,
  compare,
  onEvent,
  onHoverIn,
  onHoverOut,
  onOpen,
}: {
  w: HsWeekend;
  levels: HsLevel[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  gamesAt: (w: string, l: string) => HsGames | undefined;
  today: string;
  flash: boolean;
  active: string | null;
  compare: { id: string; starts_on: string; ends_on: string; event: string; status: HsWeekend["status"] }[] | null;
  onEvent: () => void;
  onHoverIn: (w: HsWeekend, l: HsLevel, el: HTMLElement) => void;
  onHoverOut: () => void;
  onOpen: (w: HsWeekend, l: HsLevel, el: HTMLElement, pinned: boolean) => void;
}) {
  const st = STATUS_STYLE[w.status];
  const past = w.ends_on < today;
  const quiet = w.status === "off" || w.status === "canceled";
  const mine = opponents.filter((o) => o.weekend_id === w.id);
  const line = teamLine(mine, contacts);
  const facility = w.facility_contact_id ? contacts.get(w.facility_contact_id) : undefined;
  return (
    <tr
      id={`w-${w.id}`}
      style={{
        background: flash ? "var(--rsd-accent-bg)" : st.tint,
        transition: "background-color 600ms ease",
        opacity: past && !flash ? 0.82 : 1,
      }}
    >
      <td style={{ ...cellBase, fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{formatWeekendDates(w.starts_on, w.ends_on)}</div>
        <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{formatWeekdays(w.starts_on, w.ends_on)}</div>
      </td>
      <td style={cellBase}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.location ?? ""}</div>
        {w.trip && <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{w.trip}</div>}
      </td>
      <td style={{ ...cellBase, borderLeft: `4px solid ${st.bar}`, paddingLeft: 12 }}>
        <button
          type="button"
          onClick={onEvent}
          data-tour="schedule-event"
          style={{ display: "block", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit", width: "100%", whiteSpace: "normal" }}
          title="Open this weekend"
        >
          <span
            style={{
              fontSize: 13.5,
              fontWeight: quiet ? 600 : 800,
              fontStyle: w.status === "off" ? "italic" : "normal",
              textDecoration: w.status === "canceled" ? "line-through" : "none",
              color: quiet ? "var(--gw-fg-muted)" : "var(--gw-fg)",
              lineHeight: 1.35,
            }}
          >
            {w.event || "—"}
          </span>
          {w.details && (
            <span title="Has more details" style={{ display: "inline-block", marginLeft: 5, color: "var(--gw-fg-muted)", verticalAlign: -1 }}>
              <Icons.FileText width={11} height={11} />
            </span>
          )}
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
          {w.status !== "planned" && <StatusChip status={w.status} small />}
          {(line.names.length > 0 || line.fence > 0) && (
            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.4 }}>
              {line.names.join(" · ")}
              {line.more > 0 && ` +${line.more}`}
              {line.fence > 0 && (
                <span style={{ color: "#8A6100", fontWeight: 700 }}>
                  {line.names.length ? " · " : ""}
                  {line.fence} on the fence
                </span>
              )}
            </span>
          )}
        </div>
      </td>
      {compare && (
        <td style={{ ...cellBase, fontSize: 12, color: "var(--gw-fg-muted)" }}>
          {compare.length === 0 ? (
            <span style={{ color: "var(--gw-fg-faint)" }}>—</span>
          ) : (
            compare.map((c) => (
              <div key={c.id} style={{ lineHeight: 1.35 }}>
                <span style={{ fontWeight: 700, color: "var(--gw-fg)" }}>{c.event || "—"}</span>{" "}
                <span style={{ whiteSpace: "nowrap" }}>{formatWeekendDates(c.starts_on, c.ends_on)}</span>
              </div>
            ))
          )}
        </td>
      )}
      {levels.map((l) => (
        <td key={l.id} style={{ ...cellBase, padding: 3, textAlign: "center", opacity: l.hidden ? 0.6 : 1 }}>
          <LevelCell
            w={w}
            level={l}
            summary={summarizeCell(gamesAt(w.id, l.id), cellOpponents(w.id, l.id, opponents, levelPlays(gamesAt(w.id, l.id))))}
            quiet={quiet}
            active={active === l.id}
            onHoverIn={onHoverIn}
            onHoverOut={onHoverOut}
            onOpen={onOpen}
          />
        </td>
      ))}
      <td style={{ ...cellBase, fontSize: 12, lineHeight: 1.4, color: "var(--gw-fg)" }}>
        {w.notes}
        {facility && (
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
            <Icons.MapPin width={10} height={10} /> {facility.name}
          </div>
        )}
      </td>
    </tr>
  );
}

// A team's count. Solid: games set. "3?" underlined dashes: not sure yet.
// A small amber dot: teams on the fence. Hover (or tap) for the card.
function LevelCell({
  w,
  level,
  summary,
  quiet,
  active,
  onHoverIn,
  onHoverOut,
  onOpen,
  mobile,
}: {
  w: HsWeekend;
  level: HsLevel;
  summary: ReturnType<typeof summarizeCell>;
  quiet: boolean;
  active: boolean;
  onHoverIn?: (w: HsWeekend, l: HsLevel, el: HTMLElement) => void;
  onHoverOut?: () => void;
  onOpen: (w: HsWeekend, l: HsLevel, el: HTMLElement, pinned: boolean) => void;
  mobile?: boolean;
}) {
  const { count, unsure, tentative, confirmed } = summary;
  const empty = count == null && !unsure && tentative.length === 0;
  const label = empty
    ? `${level.label}: nothing entered`
    : `${level.label}: ${count ?? "no"} game${count === 1 ? "" : "s"}${unsure ? ", not sure yet" : ""}, ${confirmed.length} coming, ${tentative.length} on the fence`;
  return (
    <button
      type="button"
      aria-label={label}
      // The tour points at the first cell with something in it.
      data-tour={empty ? undefined : "schedule-cell"}
      onMouseEnter={(e) => onHoverIn?.(w, level, e.currentTarget)}
      onMouseLeave={() => onHoverOut?.()}
      onFocus={(e) => onHoverIn?.(w, level, e.currentTarget)}
      onBlur={() => onHoverOut?.()}
      onClick={(e) => onOpen(w, level, e.currentTarget, true)}
      style={{
        position: "relative",
        width: mobile ? "auto" : "100%",
        minWidth: mobile ? 56 : undefined,
        height: mobile ? 44 : 40,
        padding: mobile ? "0 10px" : 0,
        borderRadius: 8,
        border: "1px solid",
        borderColor: active ? "var(--gw-fg)" : empty ? "transparent" : "var(--gw-border)",
        background: empty ? "transparent" : "var(--gw-bg-elev)",
        color: empty || quiet ? "var(--gw-fg-faint)" : "var(--gw-fg)",
        cursor: "pointer",
        display: "inline-flex",
        flexDirection: mobile ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: mobile ? 6 : 0,
      }}
    >
      {mobile && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{level.label}</span>}
      <span
        style={{
          fontSize: 15,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          borderBottom: unsure ? "2px dashed #D39B00" : "2px solid transparent",
          paddingBottom: 1,
          color: unsure ? "#8A6100" : undefined,
        }}
      >
        {count ?? (unsure ? "?" : "–")}
        {unsure && count != null ? "?" : ""}
      </span>
      {tentative.length > 0 && <FenceDot style={{ position: "absolute", top: 4, right: 4 }} />}
    </button>
  );
}

function WeekendCard({
  w,
  levels,
  opponents,
  contacts,
  gamesAt,
  today,
  flash,
  onEvent,
  onOpen,
}: {
  w: HsWeekend;
  levels: HsLevel[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  gamesAt: (w: string, l: string) => HsGames | undefined;
  today: string;
  flash: boolean;
  onEvent: () => void;
  onOpen: (w: HsWeekend, l: HsLevel, el: HTMLElement, pinned: boolean) => void;
}) {
  const st = STATUS_STYLE[w.status];
  const quiet = w.status === "off" || w.status === "canceled";
  const line = teamLine(opponents.filter((o) => o.weekend_id === w.id), contacts);
  return (
    <div
      id={`wm-${w.id}`}
      className="rsd-card"
      style={{
        gap: 8,
        padding: 14,
        borderLeft: `5px solid ${st.bar === "transparent" ? "var(--gw-border)" : st.bar}`,
        background: flash ? "var(--rsd-accent-bg)" : undefined,
        opacity: w.ends_on < today ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>
          {formatWeekendDates(w.starts_on, w.ends_on)}{" "}
          <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{formatWeekdays(w.starts_on, w.ends_on)}</span>
        </span>
        {w.status !== "planned" && <StatusChip status={w.status} small />}
      </div>
      <button type="button" onClick={onEvent} style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }}>
        <span style={{ fontSize: 15, fontWeight: 800, textDecoration: w.status === "canceled" ? "line-through" : "none", color: quiet ? "var(--gw-fg-muted)" : "var(--gw-fg)" }}>
          {w.event || "—"}
        </span>
      </button>
      {(w.location || w.trip || w.notes) && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {[w.location, w.trip, w.notes].filter(Boolean).join(" · ")}
        </div>
      )}
      {!quiet && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {levels.map((l) => (
            <LevelCell
              key={l.id}
              w={w}
              level={l}
              summary={summarizeCell(gamesAt(w.id, l.id), cellOpponents(w.id, l.id, opponents, levelPlays(gamesAt(w.id, l.id))))}
              quiet={quiet}
              active={false}
              onOpen={onOpen}
              mobile
            />
          ))}
        </div>
      )}
      {(line.names.length > 0 || line.fence > 0) && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {line.names.join(" · ")}
          {line.more > 0 && ` +${line.more}`}
          {line.fence > 0 && <span style={{ color: "#8A6100", fontWeight: 700 }}>{line.names.length ? " · " : ""}{line.fence} on the fence</span>}
        </div>
      )}
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

function SeasonArrow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const style: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 100,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--gw-border)",
    background: "var(--gw-bg-elev)",
    color: href ? "var(--gw-fg)" : "var(--gw-fg-faint)",
  };
  return href ? (
    <Link href={href} aria-label={label} title={label} style={style}>
      {children}
    </Link>
  ) : (
    <span aria-label={label} style={style}>
      {children}
    </span>
  );
}

function FenceDot({ style }: { style?: React.CSSProperties }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: "#E7A600", display: "inline-block", ...style }} />;
}

function UnsureSample() {
  return (
    <span style={{ fontSize: 12, fontWeight: 800, color: "#8A6100", borderBottom: "2px dashed #D39B00", lineHeight: 1 }}>3?</span>
  );
}

function Th({ children, style, title }: { children: React.ReactNode; style?: React.CSSProperties; title?: string }) {
  return (
    <th
      title={title}
      style={{
        textAlign: "left",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "var(--gw-fg-muted)",
        padding: "10px 12px",
        borderBottom: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

const cellBase: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid var(--gw-border)",
  verticalAlign: "top",
};

const footCell: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--gw-fg-muted)",
  background: "var(--gw-bg)",
  verticalAlign: "top",
};

const monthLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

