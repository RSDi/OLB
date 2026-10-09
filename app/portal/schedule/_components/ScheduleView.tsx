"use client";
// The HS Schedule: one season on a page, laid out like the planning
// spreadsheet's "HS Schedule" tab. A row per weekend, grouped by month: the
// dates, where and how far, the event (colored by how it stands, with the
// teams coming under it), a column per team of ours with its games, and the
// notes. Hover a team's count (or tap it) to see the teams coming and edit
// them; tap an event for the weekend's details. Past seasons are one click
// away, and "Compare with" puts another season's same weekend beside each row.
// Without canEdit (the travel coordinator) it's the same schedule to look at:
// no Add weekend, Season or Edit, and the weekend's details read-only.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import {
  WEEKEND_STATUSES,
  cellOpponents,
  formatWeekdays,
  levelPlays,
  formatWeekendDates,
  levelTotals,
  matchesWeekendFilters,
  matchingWeekends,
  monthHeading,
  monthKey,
  nextWeekendDates,
  opponentKey,
  recordLabel,
  sortWeekends,
  summarizeCell,
  weekendFacts,
  weekendFilterCounts,
  type WeekendFilter,
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
import { WeekendDetails } from "./WeekendDetails";
import { TravelChip, TravelPopover } from "./TravelPopover";
import { placesNear, type PlacesNear, type TravelPlace } from "../../../../lib/hs-schedule/travel";
import { FilterMultiSelect, FilterSelect, type MultiOption } from "../../../components/FilterControls";

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
  | null;

export function ScheduleView({
  schedule,
  seasons,
  compare,
  isStaff,
  canEdit,
  options,
  knownTeams,
  directoryTeams,
  travelPlaces,
  today,
}: {
  schedule: HsSeasonSchedule;
  seasons: HsSeason[];
  compare: { season: number; weekends: CompareWeekend[] } | null;
  isStaff: boolean;
  // The board and the coaches change it; the travel coordinator only looks.
  canEdit: boolean;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  directoryTeams: DirectoryTeam[];
  // Hotels and places to eat, for where to stay and eat on weekends away.
  travelPlaces: TravelPlace[];
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
  // The weekends drop-down above the grid: show only the weekends that match
  // any of what's ticked. None ticked shows every weekend.
  const [filters, setFilters] = useState<ReadonlySet<WeekendFilter>>(() => new Set());
  const [cell, setCell] = useState<CellTarget | null>(null);
  // Where to stay and eat: the weekend whose card is open, and what opened it.
  const [travel, setTravel] = useState<{ weekendId: string; anchor: HTMLElement } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contacts = useMemo(() => new Map<string, HsContactRef>(schedule.contacts.map((c) => [c.id, c])), [schedule.contacts]);
  const levels = useMemo(() => [...state.levels].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [state.levels]);
  const hiddenCount = levels.filter((l) => l.hidden).length;
  const shownLevels = useMemo(() => levels.filter((l) => showHidden || !l.hidden), [levels, showHidden]);
  const weekends = useMemo(() => sortWeekends(state.weekends), [state.weekends]);
  const facts = useMemo(
    () => weekendFacts(weekends, state.games, state.opponents, new Set(shownLevels.map((l) => l.id))),
    [weekends, state.games, state.opponents, shownLevels]
  );
  const filterCounts = useMemo(() => weekendFilterCounts(weekends, facts), [weekends, facts]);
  // A weekend whose card is open stays put while it's edited, even once it
  // no longer matches.
  const openWeekendId = cell?.weekend.id ?? null;
  const shownWeekends = useMemo(
    () => weekends.filter((w) => w.id === openWeekendId || matchesWeekendFilters(w, filters, facts)),
    [weekends, filters, facts, openWeekendId]
  );
  const filtering = filters.size > 0;
  // The hotels and places to eat near each weekend away.
  const nearBy = useMemo(() => {
    const out = new Map<string, PlacesNear>();
    if (travelPlaces.length === 0) return out;
    for (const w of weekends) {
      if (w.status === "off" || w.status === "canceled") continue;
      const near = placesNear(w.location, travelPlaces);
      if (near) out.set(w.id, near);
    }
    return out;
  }, [weekends, travelPlaces]);
  const toggleTravel = (weekendId: string, anchor: HTMLElement) =>
    setTravel((t) => (t?.weekendId === weekendId ? null : { weekendId, anchor }));
  const closeTravel = useCallback(() => setTravel(null), []);
  const travelWeekend = travel ? weekends.find((w) => w.id === travel.weekendId) ?? null : null;
  const travelNear = travel ? nearBy.get(travel.weekendId) ?? null : null;
  const totals = useMemo(
    () => levelTotals(levels, shownWeekends, state.games, state.opponents),
    [levels, shownWeekends, state.games, state.opponents]
  );
  const toggleFilter = (f: WeekendFilter) =>
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  const totalLabel = filtering ? `Total for these ${shownWeekends.length} weekend${shownWeekends.length === 1 ? "" : "s"}` : "Total games";
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
    for (const w of shownWeekends) {
      const k = monthKey(w.starts_on);
      const last = out[out.length - 1];
      if (last && last.key === k) last.rows.push(w);
      else out.push({ key: k, heading: monthHeading(w.starts_on), rows: [w] });
    }
    return out;
  }, [shownWeekends]);

  const comparing = compare ? seasonLabel(compare.season) : null;
  const sheetWeekend = sheet?.kind === "weekend" && sheet.id ? weekends.find((w) => w.id === sheet.id) ?? null : null;
  const seasonIndex = seasons.findIndex((s) => s.season === season.season);
  const older = seasons[seasonIndex + 1];
  const newer = seasons[seasonIndex - 1];

  return (
    <>
      {/* ─── Season and actions ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }} data-tour="schedule-seasons">
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
        {canEdit ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSheet({ kind: "season" })}
              data-tour="schedule-season-settings"
              aria-label="Season settings"
              title="Season settings"
              className="gw-press"
              style={{ ...roundButton, cursor: "pointer" }}
            >
              <Icons.Cog width={15} height={15} />
            </button>
            <span data-tour="schedule-add-weekend" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => setSheet({ kind: "weekend", id: null })}>
                <Icons.Plus width={13} height={13} /> Add weekend
              </Pill>
            </span>
          </div>
        ) : (
          <span
            className="rsd-chip rsd-chip-mute"
            title="The coaches and the board keep the schedule up to date."
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <Icons.Eye width={13} height={13} /> View only
          </span>
        )}
      </div>

      {/* ─── Which weekends, and view options ─── */}
      {(weekends.length > 0 || hiddenCount > 0) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {weekends.length > 0 && (
            <WeekendFilterSelect
              filters={filters}
              counts={filterCounts}
              total={weekends.length}
              onToggle={toggleFilter}
              onClear={() => setFilters(new Set())}
            />
          )}
          {seasons.length > 1 && weekends.length > 0 && (
            <FilterSelect
              value={compare?.season ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                router.push(`/portal/schedule?season=${season.season}${v ? `&compare=${v}` : ""}`);
              }}
              aria-label="Compare with another season"
              data-tour="schedule-compare"
              grow
              active={!!compare}
            >
              <option value="">Compare with…</option>
              {seasons
                .filter((s) => s.season !== season.season)
                .map((s) => (
                  <option key={s.id} value={s.season}>
                    Compare with {seasonLabel(s.season)}
                  </option>
                ))}
            </FilterSelect>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              aria-pressed={showHidden}
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? "Hide the hidden teams again" : "Show the teams hidden in Season settings"}
              className="rsd-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 34,
                padding: "0 14px",
                borderRadius: 100,
                border: "1px solid",
                borderColor: showHidden ? "var(--rsd-accent-fill)" : "var(--gw-border)",
                background: showHidden ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
                color: showHidden ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Icons.Eye width={13} height={13} /> Hidden teams {hiddenCount}
            </button>
          )}
        </div>
      )}

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
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No weekends yet</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.5, maxWidth: 440 }}>
            {!canEdit
              ? "The coaches and the board haven't added this season's weekends yet."
              : levels.length === 0
                ? "Add our teams (V, JV1…) first: a column each on the schedule. Then add the season's weekends one at a time."
                : "Add the season's weekends one at a time."}
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
              {levels.length === 0 && (
                <Pill variant="accent" size="sm" onClick={() => setSheet({ kind: "season" })}>
                  <Icons.Cog width={13} height={13} /> Season settings
                </Pill>
              )}
              <Pill variant={levels.length === 0 ? "ghost" : "accent"} size="sm" onClick={() => setSheet({ kind: "weekend", id: null })}>
                <Icons.Plus width={13} height={13} /> Add weekend
              </Pill>
            </div>
          )}
        </div>
      ) : shownWeekends.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "32px 24px", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>No weekends match</div>
          <Pill variant="ghost" size="sm" onClick={() => setFilters(new Set())}>
            Show every weekend
          </Pill>
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
                        near={nearBy.get(w.id) ?? null}
                        travelOpen={travel?.weekendId === w.id}
                        onTravel={(el) => toggleTravel(w.id, el)}
                      />
                    )}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3 + (comparing ? 1 : 0)} style={{ ...footCell, textAlign: "right" }}>
                    {totalLabel}
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
                    near={nearBy.get(w.id) ?? null}
                    travelOpen={travel?.weekendId === w.id}
                    onTravel={(el) => toggleTravel(w.id, el)}
                  />
                ))}
              </div>
            ))}
            <div className="rsd-card" style={{ gap: 8, padding: 14 }}>
              <div style={monthLabel}>{totalLabel}</div>
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

      {travel && travelWeekend && travelNear && (
        <TravelPopover weekend={travelWeekend} near={travelNear} anchor={travel.anchor} onClose={closeTravel} />
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
          weekendGames={state.games.filter((g) => g.weekend_id === liveCell.weekend.id)}
          levels={levels}
          shownLevels={shownLevels}
          contacts={contacts}
          canEdit={canEdit}
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

      {sheet?.kind === "weekend" && !canEdit && sheetWeekend && (
        <WeekendDetails
          weekend={sheetWeekend}
          levels={levels}
          games={state.games}
          opponents={state.opponents}
          contacts={contacts}
          near={nearBy.get(sheetWeekend.id) ?? null}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "weekend" && canEdit && (
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
      {sheet?.kind === "season" && canEdit && (
        <SeasonSheet
          season={season}
          levels={levels}
          seasons={seasons}
          teams={directoryTeams}
          isStaff={isStaff}
          onClose={() => setSheet(null)}
          onNewSeason={() => setSheet({ kind: "new-season" })}
        />
      )}
      {sheet?.kind === "new-season" && <NewSeasonSheet seasons={seasons} onClose={() => setSheet(null)} />}
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
    const key = opponentKey(o);
    const name = (o.contact_id && contacts.get(o.contact_id)?.name) || o.name;
    if (o.status === "confirmed" && !seen.has(key)) {
      seen.add(key);
      confirmed.push(name);
    }
  }
  for (const o of opps) {
    const key = opponentKey(o);
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
  near,
  travelOpen,
  onTravel,
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
  near: PlacesNear | null;
  travelOpen: boolean;
  onTravel: (el: HTMLElement) => void;
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
        {near && (
          <div style={{ marginTop: 6 }}>
            <TravelChip near={near} active={travelOpen} onOpen={onTravel} />
          </div>
        )}
      </td>
      <td style={{ ...cellBase, borderLeft: `4px solid ${st.bar}`, paddingLeft: 12 }}>
        {/* The event, with how it stands beside it on the same line. */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px 8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onEvent}
            data-tour="schedule-event"
            style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit", whiteSpace: "normal" }}
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
          {w.status !== "planned" && <StatusChip status={w.status} small />}
        </div>
        {(line.names.length > 0 || line.fence > 0) && (
          <div style={{ marginTop: 1, lineHeight: 1.3 }}>
            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.3 }}>
              {line.names.join(" · ")}
              {line.more > 0 && ` +${line.more}`}
              {line.fence > 0 && (
                <span style={{ color: "#8A6100", fontWeight: 700 }}>
                  {line.names.length ? " · " : ""}
                  {line.fence} on the fence
                </span>
              )}
            </span>
          </div>
        )}
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
// A small amber dot (in the grid): teams on the fence. Hover (or tap) for
// the card.
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
        minWidth: mobile ? 44 : undefined,
        height: mobile ? 32 : 40,
        padding: mobile ? "0 9px" : 0,
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
        gap: mobile ? 5 : 0,
      }}
    >
      {mobile && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{level.label}</span>}
      <span
        style={{
          fontSize: mobile ? 14 : 15,
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
      {/* On a phone the card's "on the fence" line says it once for the weekend. */}
      {tentative.length > 0 && !mobile && <FenceDot style={{ position: "absolute", top: 4, right: 4 }} />}
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
  near,
  travelOpen,
  onTravel,
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
  near: PlacesNear | null;
  travelOpen: boolean;
  onTravel: (el: HTMLElement) => void;
}) {
  const st = STATUS_STYLE[w.status];
  const quiet = w.status === "off" || w.status === "canceled";
  const bar = st.bar === "transparent" ? "var(--gw-border)" : st.bar;
  const past = w.ends_on < today;

  // An off or canceled weekend is one slim line: nothing to plan there.
  if (quiet) {
    return (
      <button
        type="button"
        id={`wm-${w.id}`}
        onClick={onEvent}
        className="rsd-card"
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 8,
          padding: "9px 12px",
          borderLeft: `5px solid ${bar}`,
          background: flash ? "var(--rsd-accent-bg)" : undefined,
          opacity: past ? 0.85 : 1,
          textAlign: "left",
          color: "var(--gw-fg-muted)",
          cursor: "pointer",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--gw-fg)", whiteSpace: "nowrap" }}>
          {formatWeekendDates(w.starts_on, w.ends_on)}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12.5,
            fontWeight: 600,
            fontStyle: w.status === "off" ? "italic" : "normal",
            textDecoration: w.status === "canceled" ? "line-through" : "none",
          }}
        >
          {w.event || "—"}
          {w.location && <span style={{ fontWeight: 500, textDecoration: "none" }}> · {w.location}</span>}
        </span>
        {w.status === "canceled" && <StatusChip status={w.status} small />}
      </button>
    );
  }

  const line = teamLine(opponents.filter((o) => o.weekend_id === w.id), contacts);
  // The first two teams coming by name, then how many more.
  const coming = line.names.length + line.more;
  const shownNames = line.names.slice(0, 2);
  return (
    <div
      id={`wm-${w.id}`}
      className="rsd-card"
      style={{
        gap: 8,
        padding: 14,
        borderLeft: `5px solid ${bar}`,
        background: flash ? "var(--rsd-accent-bg)" : undefined,
        opacity: past ? 0.85 : 1,
      }}
    >
      {/* The top of the card opens the weekend. */}
      <button
        type="button"
        onClick={onEvent}
        aria-label={`Open ${w.event || "this weekend"}, ${formatWeekendDates(w.starts_on, w.ends_on)}`}
        style={{ display: "flex", flexDirection: "column", gap: 4, background: "none", border: "none", padding: 0, textAlign: "left", color: "inherit", cursor: "pointer", width: "100%" }}
      >
        <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", width: "100%" }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            {formatWeekendDates(w.starts_on, w.ends_on)}{" "}
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{formatWeekdays(w.starts_on, w.ends_on)}</span>
          </span>
          {/* The green bar already says Facility secured; the chip flags what still needs work. */}
          {w.status !== "planned" && w.status !== "secured" && <StatusChip status={w.status} small />}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.3 }}>
          {w.event || "—"}
          {w.details && (
            <span title="Has more details" style={{ display: "inline-block", marginLeft: 6, color: "var(--gw-fg-muted)", verticalAlign: -1 }}>
              <Icons.FileText width={12} height={12} />
            </span>
          )}
        </span>
      </button>
      {(w.location || w.trip || near) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          {(w.location || w.trip) && <span>{[w.location, w.trip].filter(Boolean).join(" · ")}</span>}
          {near && <TravelChip near={near} active={travelOpen} onOpen={onTravel} />}
        </div>
      )}
      {w.notes && <div style={{ fontSize: 12, color: "var(--gw-fg)", lineHeight: 1.4 }}>{w.notes}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
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
      {(coming > 0 || line.fence > 0) && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {shownNames.join(", ")}
          {coming > shownNames.length && ` +${coming - shownNames.length}`}
          {line.fence > 0 && <span style={{ color: "#8A6100", fontWeight: 700 }}>{coming ? " · " : ""}{line.fence} on the fence</span>}
        </div>
      )}
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

const roundButton: React.CSSProperties = {
  width: 32,
  height: 32,
  flexShrink: 0,
  borderRadius: 100,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg)",
  padding: 0,
};

function SeasonArrow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const style: React.CSSProperties = { ...roundButton, color: href ? "var(--gw-fg)" : "var(--gw-fg-faint)" };
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

// The weekends drop-down above the grid: tick a status (what still needs
// work, what's waiting, what's good to go), the weekends with a "3?", or the
// ones with a team on the fence, each with how many weekends it has. Tick
// more than one to see them together.
function WeekendFilterSelect({
  filters,
  counts,
  total,
  onToggle,
  onClear,
}: {
  filters: ReadonlySet<WeekendFilter>;
  counts: Map<WeekendFilter, number>;
  total: number;
  onToggle: (f: WeekendFilter) => void;
  onClear: () => void;
}) {
  // The spreadsheet's four colors always; Planned, Off and Canceled when the
  // season has any.
  const statuses = WEEKEND_STATUSES.filter((s) => s.legend || (counts.get(s.value) ?? 0) > 0 || filters.has(s.value));
  const base: { value: WeekendFilter; label: string; mark: React.ReactNode }[] = [
    ...statuses.map((s) => ({
      value: s.value,
      label: s.label,
      mark:
        s.value === "planned" ? (
          <StatusDot style={{ border: "1.5px solid var(--gw-fg-muted)" }} />
        ) : (
          <StatusDot style={{ background: STATUS_STYLE[s.value].bar }} />
        ),
    })),
    { value: "unsure", label: "Not sure yet", mark: <UnsureSample /> },
    { value: "fence", label: "Teams on the fence", mark: <FenceDot /> },
  ];
  const options: (MultiOption & { value: WeekendFilter })[] = base.map((o) => ({ ...o, count: counts.get(o.value) ?? 0, disabled: (counts.get(o.value) ?? 0) === 0 }));
  const picked = options.filter((o) => filters.has(o.value));
  const summary =
    picked.length === 0
      ? `All weekends (${total})`
      : picked.length === 1
        ? `${picked[0].label} (${picked[0].count})`
        : `${picked[0].label} +${picked.length - 1}`;
  // One status picked: its color dot on the chip.
  const only = picked.length === 1 ? picked[0].value : null;
  const leading =
    only === "fence" ? (
      <FenceDot />
    ) : only && only !== "unsure" && only !== "planned" ? (
      <StatusDot style={{ width: 8, height: 8, background: STATUS_STYLE[only].bar, boxShadow: "0 0 0 1.5px var(--gw-bg-elev)" }} />
    ) : undefined;
  return (
    <FilterMultiSelect
      label="Show weekends"
      summary={summary}
      allLabel={`All weekends (${total})`}
      options={options}
      selected={filters}
      onToggle={(v) => onToggle(v as WeekendFilter)}
      onClear={onClear}
      data-tour="schedule-legend"
      grow
      leading={leading}
    />
  );
}

function StatusDot({ style }: { style?: React.CSSProperties }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, boxSizing: "border-box", display: "inline-block", ...style }} />;
}

function UnsureSample() {
  return (
    <span aria-hidden style={{ fontSize: 11, fontWeight: 800, color: "#8A6100", borderBottom: "2px dashed #D39B00", lineHeight: 1 }}>3?</span>
  );
}

function FenceDot({ style }: { style?: React.CSSProperties }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: "#E7A600", display: "inline-block", ...style }} />;
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

