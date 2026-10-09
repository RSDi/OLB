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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icons } from "../../../components/icons";
import { ClearSearchButton, Pill } from "../../../components/ui";
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
import { seasonLabel, seasonOf } from "../../../../lib/planning/season";
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
import { FilterMenu, FilterMultiSelect, FilterSelect, MenuAction, MenuHeading, MenuRow, type MultiOption } from "../../../components/FilterControls";

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
  // ─── What's showing, kept in the page's address ───────────────────────────
  // ?show=tentative,unsure (the weekends drop-down: any of what's ticked),
  // ?q= (the search box), ?team=JV1 (just one of our teams), ?hidden=1 and
  // ?past=1 (View). A link carries them, and Back undoes the last change.
  const params = useSearchParams();
  const pathname = usePathname();
  const setParams = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      window.history[replace ? "replaceState" : "pushState"](null, "", `${pathname}${qs ? `?${qs}` : ""}`);
    },
    [pathname]
  );
  const showParam = params.get("show") ?? "";
  const filters = useMemo<ReadonlySet<WeekendFilter>>(
    () => new Set(showParam.split(",").filter((f): f is WeekendFilter => FILTER_KEYS.has(f))),
    [showParam]
  );
  const setFilters = (next: ReadonlySet<WeekendFilter>) => setParams({ show: [...next].join(",") || null });
  const showHidden = params.get("hidden") === "1";
  const setShowHidden = (on: boolean) => setParams({ hidden: on ? "1" : null });
  const showPast = params.get("past") === "1";
  const setShowPast = (on: boolean) => setParams({ past: on ? "1" : null });
  // The search box types into its own state (so the cursor doesn't jump) and
  // keeps the address in step; Back brings an earlier search back.
  const qParam = params.get("q") ?? "";
  const [query, setQuery] = useState(qParam);
  const [lastQ, setLastQ] = useState(qParam);
  if (qParam !== lastQ) {
    setLastQ(qParam);
    setQuery(qParam);
  }
  const typeQuery = (v: string) => {
    // The first letter of a search is a step Back can undo; the rest of the
    // typing updates that step.
    const continuing = !!query && !!v;
    setQuery(v);
    setLastQ(v);
    setParams({ q: v || null }, continuing);
  };
  const [cell, setCell] = useState<CellTarget | null>(null);
  // Where to stay and eat: the weekend whose card is open, and what opened it.
  const [travel, setTravel] = useState<{ weekendId: string; anchor: HTMLElement } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const currentSeason = seasonOf(today);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contacts = useMemo(() => new Map<string, HsContactRef>(schedule.contacts.map((c) => [c.id, c])), [schedule.contacts]);
  const levels = useMemo(() => [...state.levels].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [state.levels]);
  const hiddenCount = levels.filter((l) => l.hidden).length;
  // ?team=JV1: just that team of ours, its column and the weekends it plays.
  const teamLevel = levels.find((l) => l.label === params.get("team")) ?? null;
  const shownLevels = useMemo(
    () => (teamLevel ? [teamLevel] : levels.filter((l) => showHidden || !l.hidden)),
    [levels, showHidden, teamLevel]
  );
  const weekends = useMemo(() => sortWeekends(state.weekends), [state.weekends]);
  const facts = useMemo(
    () => weekendFacts(weekends, state.games, state.opponents, new Set(shownLevels.map((l) => l.id))),
    [weekends, state.games, state.opponents, shownLevels]
  );
  const filterCounts = useMemo(() => weekendFilterCounts(weekends, facts), [weekends, facts]);
  // A weekend whose card is open stays put while it's edited, even once it
  // no longer matches.
  const openWeekendId = cell?.weekend.id ?? null;
  // The search: the event, where, the trip, notes, details, the facility and
  // the teams coming.
  const haystack = useMemo(() => {
    const out = new Map<string, string>();
    for (const w of weekends) {
      const teams = state.opponents
        .filter((o) => o.weekend_id === w.id)
        .map((o) => (o.contact_id && contacts.get(o.contact_id)?.name) || o.name);
      const facility = w.facility_contact_id ? contacts.get(w.facility_contact_id)?.name : null;
      out.set(w.id, [w.event, w.location, w.trip, w.notes, w.details, facility, ...teams].filter(Boolean).join("\n").toLowerCase());
    }
    return out;
  }, [weekends, state.opponents, contacts]);
  const q = query.trim().toLowerCase();
  const playsTeam = useCallback(
    (w: HsWeekend) =>
      !!teamLevel &&
      state.games.some((g) => g.weekend_id === w.id && g.level_id === teamLevel.id && ((g.games ?? 0) > 0 || g.unsure)),
    [teamLevel, state.games]
  );
  const shownWeekends = useMemo(
    () =>
      weekends.filter(
        (w) =>
          w.id === openWeekendId ||
          (matchesWeekendFilters(w, filters, facts) && (!q || haystack.get(w.id)!.includes(q)) && (!teamLevel || playsTeam(w)))
      ),
    [weekends, filters, facts, openWeekendId, q, haystack, teamLevel, playsTeam]
  );
  const filtering = filters.size > 0 || !!q || !!teamLevel;
  const clearFilters = () => {
    setQuery("");
    setLastQ("");
    setParams({ show: null, q: null, team: null });
  };
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
  const toggleFilter = (f: WeekendFilter) => {
    const next = new Set(filters);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setFilters(next);
  };
  // While filtering, the totals add up just the weekends showing, and say so.
  const totalNote = filtering ? `for the ${shownWeekends.length} weekend${shownWeekends.length === 1 ? "" : "s"} showing` : null;
  const shownTotals = shownLevels.map((l) => totals.get(l.id)!);
  const anyUnsure = shownTotals.some((t) => t.unsure > 0);
  const anyRecord = shownTotals.some((t) => recordLabel(t));
  const recordTitle = shownTotals.some((t) => t.ties > 0) ? "Record (W–L–T)" : "Record (W–L)";
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

  // ─── Months ───────────────────────────────────────────────────────────────
  // While a season is under way, the months that are over fold to a line
  // (tap one to open it, or Past months for all); a season that's over, or
  // not started, shows every month.
  const thisMonth = monthKey(today);
  const underWay = weekends.some((w) => w.ends_on < today) && weekends.some((w) => w.ends_on >= today);
  // While searching or filtering, every month with a match shows.
  const foldable = underWay && !filtering && byMonth.some((m) => m.key < thisMonth);
  const [openPast, setOpenPast] = useState<ReadonlySet<string>>(() => new Set());
  const isFolded = (key: string) => foldable && key < thisMonth && !showPast && !openPast.has(key);
  const toggleMonth = (key: string) =>
    setOpenPast((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const monthInfo = useMemo(
    () =>
      new Map(
        byMonth.map((m) => {
          const off = m.rows.filter((w) => w.status === "off").length;
          const canceled = m.rows.filter((w) => w.status === "canceled").length;
          const live = m.rows.length - off - canceled;
          const count = [
            live > 0 && `${live} weekend${live === 1 ? "" : "s"}`,
            off > 0 && `${off} off`,
            canceled > 0 && `${canceled} canceled`,
          ]
            .filter(Boolean)
            .join(", ");
          const t = levelTotals(shownLevels, m.rows, state.games, state.opponents);
          const records = shownLevels
            .map((l) => {
              const r = recordLabel(t.get(l.id)!);
              return r ? `${l.label} ${r}` : null;
            })
            .filter(Boolean)
            .join(", ");
          return [m.key, { count, records }] as const;
        })
      ),
    [byMonth, shownLevels, state.games, state.opponents]
  );
  const monthHead = (m: { key: string; heading: string }) => {
    const info = monthInfo.get(m.key)!;
    const past = foldable && m.key < thisMonth;
    return (
      <MonthHeading
        heading={m.heading}
        count={info.count}
        records={isFolded(m.key) ? info.records : ""}
        current={m.key === thisMonth}
        folded={past ? isFolded(m.key) : null}
        onToggle={() => (showPast ? setShowPast(false) : toggleMonth(m.key))}
      />
    );
  };

  // Opened from a contact's page: #w-<weekend id> scrolls to it and marks it
  // (opening its month first if it's folded). Otherwise, mid-season, the
  // page scrolls to this month when it's out of sight.
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const m = window.location.hash.match(/^#w-([0-9a-f-]{36})$/i);
    const w = m ? weekends.find((x) => x.id === m[1]) : null;
    if (w) {
      const k = monthKey(w.starts_on);
      const raf = requestAnimationFrame(() => {
        setOpenPast((cur) => (cur.has(k) ? cur : new Set([...cur, k])));
        setTarget(w.id);
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!underWay) return;
    const month = byMonth.find((x) => x.key >= thisMonth);
    if (!month || month === byMonth[0]) return;
    const el = [document.getElementById(`m-${month.key}`), document.getElementById(`mm-${month.key}`)].find(
      (x) => x && x.offsetParent !== null
    );
    const box = el?.closest("main") ?? null;
    if (el && box && el.getBoundingClientRect().top > box.getBoundingClientRect().bottom - 120) el.scrollIntoView({ block: "start" });
    // On first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!target) return;
    // The grid's row, or on a phone the weekend's card.
    const el = [document.getElementById(`w-${target}`), document.getElementById(`wm-${target}`)].find(
      (x) => x && x.offsetParent !== null
    );
    el?.scrollIntoView({ block: "center" });
    const on = requestAnimationFrame(() => setFlash(target));
    const off = setTimeout(() => setFlash(null), 2400);
    return () => {
      cancelAnimationFrame(on);
      clearTimeout(off);
    };
  }, [target]);

  const comparing = compare ? seasonLabel(compare.season) : null;
  // The weekend we're in, or else the next one coming (not an off one).
  const nowWeekend = useMemo(() => {
    const live = weekends.filter((w) => w.status !== "off" && w.status !== "canceled");
    const during = live.find((w) => w.starts_on <= today && today <= w.ends_on);
    if (during) return { id: during.id, label: "This weekend" };
    const next = live.find((w) => w.starts_on > today);
    return next ? { id: next.id, label: "Next" } : null;
  }, [weekends, today]);
  const nowTagOf = (id: string) => (nowWeekend?.id === id ? nowWeekend.label : null);
  // The season's usual days ("Thu–Sat"), said once in the heading; a
  // weekend on other days says its own.
  const usualDays = useMemo(() => {
    const n = new Map<string, number>();
    for (const w of weekends) {
      const d = formatWeekdays(w.starts_on, w.ends_on);
      n.set(d, (n.get(d) ?? 0) + 1);
    }
    let best = "";
    let most = 0;
    for (const [d, c] of n) if (c > most) [best, most] = [d, c];
    return most >= 2 ? best : "";
  }, [weekends]);
  // The Notes column only when a weekend showing has notes or a facility.
  const showNotes = shownWeekends.some((w) => w.notes?.trim() || w.facility_contact_id);
  // The grid's columns, shared by the headings and the weekends below them.
  const gridHeadRef = useRef<HTMLDivElement>(null);
  const gridTable: React.CSSProperties = {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 858 - (showNotes ? 0 : 168) + shownLevels.length * 56 + (comparing ? 180 : 0),
  };
  const gridCols = (
    <colgroup>
      <col style={{ width: 136 }} />
      <col style={{ width: 164 }} />
      <col />
      {comparing && <col style={{ width: 180 }} />}
      {shownLevels.map((l) => (
        <col key={l.id} style={{ width: 56 }} />
      ))}
      {showNotes && <col style={{ width: 168 }} />}
    </colgroup>
  );
  const sheetWeekend = sheet?.kind === "weekend" && sheet.id ? weekends.find((w) => w.id === sheet.id) ?? null : null;
  const seasonIndex = seasons.findIndex((s) => s.season === season.season);
  const older = seasons[seasonIndex + 1];
  const newer = seasons[seasonIndex - 1];

  return (
    <>
      {/* ─── Season and actions ─── */}
      <div className="hs-no-print" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }} data-tour="schedule-seasons">
            <SeasonArrow href={older ? `/portal/schedule?season=${older.season}` : null} label={older ? `Back to ${seasonLabel(older.season)}` : "No earlier season"}>
              <Icons.ChevronLeft width={16} height={16} />
            </SeasonArrow>
            <SeasonPicker season={season.season} seasons={seasons} current={currentSeason} />
            {newer || !isStaff ? (
              <SeasonArrow href={newer ? `/portal/schedule?season=${newer.season}` : null} label={newer ? `On to ${seasonLabel(newer.season)}` : "No later season"}>
                <Icons.ChevronRight width={16} height={16} />
              </SeasonArrow>
            ) : (
              // The newest season: the board starts the next one from here.
              <button
                type="button"
                onClick={() => setSheet({ kind: "new-season" })}
                aria-label={`Start ${seasonLabel(season.season + 1)}`}
                title={`Start ${seasonLabel(season.season + 1)}`}
                className="gw-press"
                style={{ ...roundButton, borderStyle: "dashed", cursor: "pointer" }}
              >
                <Icons.Plus width={15} height={15} />
              </button>
            )}
            <SeasonTag season={season.season} current={currentSeason} />
          </div>
          {/* On a phone these wrap under the season; they keep to the right. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
            <FilterMenu label="More" round icon={<Icons.More width={16} height={16} />} active={false} data-tour="schedule-more">
              <MenuAction icon={<Icons.Printer width={14} height={14} />} label="Print" onPick={() => window.print()} />
              <MenuAction
                icon={<Icons.Link width={14} height={14} />}
                label={copied ? "Link copied" : "Copy link"}
                onPick={() => {
                  void navigator.clipboard?.writeText(window.location.href).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              />
            </FilterMenu>
            {canEdit ? (
              <>
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
              </>
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
        </div>
        {season.notes?.trim() && (
          <SeasonNotes notes={season.notes.trim()} onEdit={canEdit ? () => setSheet({ kind: "season" }) : undefined} />
        )}
      </div>

      {/* On paper: what this is, and what's showing. */}
      <div className="hs-print-only" style={{ display: "none", fontSize: 12 }}>
        <strong style={{ fontSize: 16 }}>HS Schedule {seasonLabel(season.season)}</strong>
        {filtering && ` · ${shownWeekends.length} of ${weekends.length} weekends`}
        {teamLevel && ` · ${teamLevel.label} only`}
        {q && ` · "${query.trim()}"`}
        {` · printed ${new Date(today + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
        {season.notes?.trim() && <div style={{ marginTop: 2 }}>{season.notes.trim()}</div>}
      </div>

      {/* ─── Search, which weekends and which team, and the View menu ─── */}
      {(weekends.length > 0 || hiddenCount > 0) && (
        <div className="hs-no-print" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {weekends.length > 0 && (
              <div data-tour="schedule-search" style={{ position: "relative", flex: "1 1 240px", maxWidth: 380 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gw-fg-muted)", display: "flex" }}>
                  <Icons.Search width={14} height={14} />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => typeQuery(e.target.value)}
                  placeholder="Search events, places, teams"
                  aria-label="Search the schedule"
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 40px 0 34px",
                    borderRadius: 10,
                    border: "1px solid var(--gw-border)",
                    background: "var(--gw-bg)",
                    color: "var(--gw-fg)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                />
                {query && <ClearSearchButton onClear={() => typeQuery("")} />}
              </div>
            )}
            {weekends.length > 0 && (
              <WeekendFilterSelect
                filters={filters}
                counts={filterCounts}
                total={weekends.length}
                onToggle={toggleFilter}
                onClear={() => setFilters(new Set())}
              />
            )}
            {weekends.length > 0 && levels.length > 1 && (
              <FilterSelect
                value={teamLevel?.label ?? ALL_TEAMS}
                onChange={(e) => setParams({ team: e.target.value === ALL_TEAMS ? null : e.target.value })}
                aria-label="Just one of our teams"
                data-tour="schedule-team"
                grow
                active={!!teamLevel}
              >
                <option value={ALL_TEAMS}>All our teams</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.label}>
                    {l.label}
                    {l.hidden ? " (hidden)" : ""}
                  </option>
                ))}
              </FilterSelect>
            )}
            {((hiddenCount > 0 && !teamLevel) || foldable || (seasons.length > 1 && weekends.length > 0)) && (
              <FilterMenu
                label="View"
                icon={<Icons.Eye width={13} height={13} />}
                active={showHidden || showPast || !!compare}
                data-tour="schedule-compare"
              >
                {hiddenCount > 0 && !teamLevel && (
                  <MenuRow label={`Show hidden teams (${hiddenCount})`} checked={showHidden} onPick={() => setShowHidden(!showHidden)} />
                )}
                {foldable && <MenuRow label="Show past months" checked={showPast} onPick={() => setShowPast(!showPast)} />}
                {seasons.length > 1 && weekends.length > 0 && (
                  <>
                    <MenuHeading>Compare with</MenuHeading>
                    {[null, ...seasons.filter((x) => x.season !== season.season)].map((x) => (
                      <MenuRow
                        key={x?.id ?? "none"}
                        radio
                        label={x ? seasonLabel(x.season) : "No other season"}
                        checked={(compare?.season ?? null) === (x?.season ?? null)}
                        onPick={() => {
                          const next = new URLSearchParams(window.location.search);
                          next.set("season", String(season.season));
                          if (x) next.set("compare", String(x.season));
                          else next.delete("compare");
                          router.push(`${pathname}?${next.toString()}`);
                        }}
                      />
                    ))}
                  </>
                )}
              </FilterMenu>
            )}
          </div>
          {filtering && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }} aria-live="polite">
              {shownWeekends.length} of {weekends.length} weekends ·{" "}
              <button
                type="button"
                onClick={clearFilters}
                style={{ background: "none", border: "none", padding: 0, color: "var(--gw-fg)", fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
              >
                Clear
              </button>
            </div>
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
          <Pill variant="ghost" size="sm" onClick={clearFilters}>
            Show every weekend
          </Pill>
        </div>
      ) : (
        <>
          {/* ─── Desktop: the grid ─── */}
          {/* The column headings stay at the top of the screen as the weekends
              scroll by: their own table, with the same columns, kept in step
              with the grid when it scrolls sideways. */}
          <div className="rsd-card gw-desktop-table hs-grid" style={{ padding: 0, gap: 0 }} data-tour="schedule-grid">
            <div ref={gridHeadRef} className="hs-grid-head" style={{ position: "sticky", top: 0, zIndex: 4, overflow: "hidden", borderRadius: "16px 16px 0 0" }}>
              <table style={gridTable}>
                {gridCols}
                <thead>
                  <tr>
                    <Th style={{ color: "var(--gw-fg)" }} title="The season, and each weekend's dates (on its usual days unless it says otherwise)">
                      {seasonLabel(season.season)}
                      {usualDays && <span style={{ color: "var(--gw-fg-muted)", fontWeight: 700 }}> · {usualDays}</span>}
                    </Th>
                    <Th>Where</Th>
                    <Th>Event</Th>
                    {comparing && <Th>{comparing}</Th>}
                    {shownLevels.map((l) => (
                      <Th key={l.id} style={{ textAlign: "center", padding: "10px 3px", letterSpacing: ".01em" }} title={levelTitle(l)}>
                        <span style={{ color: "var(--gw-fg)", opacity: l.hidden ? 0.55 : 1 }}>{l.label}</span>
                      </Th>
                    ))}
                    {showNotes && <Th>Notes</Th>}
                  </tr>
                </thead>
              </table>
            </div>
            <div
              style={{ overflowX: "auto" }}
              onScroll={(e) => {
                if (gridHeadRef.current) gridHeadRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
            >
            <table style={gridTable}>
              {gridCols}
              <tbody>
                {byMonth.map((m) => (
                  <MonthRows
                    key={m.key}
                    id={`m-${m.key}`}
                    head={monthHead(m)}
                    rows={isFolded(m.key) ? [] : m.rows}
                    span={3 + (showNotes ? 1 : 0) + shownLevels.length + (comparing ? 1 : 0)}
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
                        nowTag={nowTagOf(w.id)}
                        usualDays={usualDays}
                        showNotes={showNotes}
                      />
                    )}
                  />
                ))}
              </tbody>
              <tfoot>
                {/* Total games, then (when there are any) how many aren't settled and the record. */}
                <tr>
                  <td colSpan={3 + (comparing ? 1 : 0)} style={{ ...footCell, textAlign: "right" }}>
                    Total games
                    {totalNote && <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{totalNote}</div>}
                  </td>
                  {shownLevels.map((l) => (
                    <td key={l.id} style={{ ...footCell, textAlign: "center", color: "var(--gw-fg)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                      {totals.get(l.id)!.games}
                    </td>
                  ))}
                  {showNotes && <td style={footCell} />}
                </tr>
                {anyUnsure && (
                  <tr>
                    <td colSpan={3 + (comparing ? 1 : 0)} style={{ ...footSub, textAlign: "right" }}>
                      Not sure yet
                    </td>
                    {shownLevels.map((l) => {
                      const t = totals.get(l.id)!;
                      return (
                        <td key={l.id} style={{ ...footSub, textAlign: "center", padding: "0 2px 8px", whiteSpace: "nowrap", color: "#8A6100", fontVariantNumeric: "tabular-nums" }}>
                          {t.unsure || ""}
                        </td>
                      );
                    })}
                    {showNotes && <td style={footSub} />}
                  </tr>
                )}
                {anyRecord && (
                  <tr>
                    <td colSpan={3 + (comparing ? 1 : 0)} style={{ ...footSub, textAlign: "right" }}>
                      {recordTitle}
                    </td>
                    {shownLevels.map((l) => (
                      <td key={l.id} style={{ ...footSub, textAlign: "center", padding: "0 2px 8px", whiteSpace: "nowrap", color: "var(--gw-fg)", fontVariantNumeric: "tabular-nums" }}>
                        {recordLabel(totals.get(l.id)!) ?? ""}
                      </td>
                    ))}
                    {showNotes && <td style={footSub} />}
                  </tr>
                )}
              </tfoot>
            </table>
            </div>
          </div>

          {/* ─── Phone: a card per weekend ─── */}
          <div className="gw-mobile-cards" style={{ gap: 14 }}>
            {byMonth.map((m) => (
              <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Stays at the top of the screen while its weekends scroll by. */}
                <div id={`mm-${m.key}`} style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--gw-bg)", padding: "4px 0" }}>
                  {monthHead(m)}
                </div>
                {!isFolded(m.key) && m.rows.map((w) => (
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
                    nowTag={nowTagOf(w.id)}
                  />
                ))}
              </div>
            ))}
            <div className="rsd-card" style={{ gap: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={monthLabel}>Total games</span>
                {totalNote && <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{totalNote}</span>}
                {anyRecord && (
                  <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 600, marginLeft: "auto" }}>{recordTitle} under each</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))", gap: 6 }}>
                {shownLevels.map((l) => {
                  const t = totals.get(l.id)!;
                  const rec = recordLabel(t);
                  return (
                    <div
                      key={l.id}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)" }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{l.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{t.games}</span>
                      {t.unsure > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#8A6100", whiteSpace: "nowrap" }}>{t.unsure} not sure</span>}
                      {rec && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gw-fg-muted)", fontVariantNumeric: "tabular-nums" }}>{rec}</span>}
                    </div>
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
  id,
  head,
  rows,
  span,
  render,
}: {
  id: string;
  head: React.ReactNode;
  rows: HsWeekend[];
  span: number;
  render: (w: HsWeekend) => React.ReactNode;
}) {
  return (
    <>
      <tr id={id}>
        <td colSpan={span} style={{ padding: "8px 14px 4px", background: "var(--gw-bg)", borderBottom: "1px solid var(--gw-border)" }}>
          {head}
        </td>
      </tr>
      {rows.map(render)}
    </>
  );
}

// A month's heading: its name, how many weekends (and off), "This month",
// and for a month that's over, a fold with its records while folded.
function MonthHeading({
  heading,
  count,
  records,
  current,
  folded,
  onToggle,
}: {
  heading: string;
  count: string;
  records: string;
  current: boolean;
  // null: not a month that folds.
  folded: boolean | null;
  onToggle: () => void;
}) {
  const body = (
    <>
      {folded !== null && (
        <Icons.ChevronRight
          width={12}
          height={12}
          style={{ flexShrink: 0, transform: folded ? "none" : "rotate(90deg)", transition: "transform 120ms" }}
        />
      )}
      <span style={monthLabel}>{heading}</span>
      {count && <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--gw-fg-muted)" }}>· {count}</span>}
      {records && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gw-fg)" }}>· {records}</span>}
      {current && (
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 8px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)" }}>
          This month
        </span>
      )}
    </>
  );
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", color: "var(--gw-fg-muted)" };
  return folded === null ? (
    <div style={row}>{body}</div>
  ) : (
    <button
      type="button"
      aria-expanded={!folded}
      onClick={onToggle}
      title={folded ? "Show this month's weekends" : "Fold this month"}
      style={{ ...row, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%" }}
    >
      {body}
    </button>
  );
}

// An off or canceled weekend's name as the spreadsheet wrote it, shouting
// ("THANKSGIVING - - OFF"), reads in normal case without the "OFF" the row
// already says. Only for display: the name itself isn't changed.
function eventName(w: Pick<HsWeekend, "event" | "status">): string {
  const name = w.event.trim();
  if (!name) return "—";
  if (w.status !== "off" && w.status !== "canceled") return name;
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  const plain = name.replace(/[\s\-–—:]*(off|canceled|cancelled)\s*$/i, "").trim() || name;
  const lower = plain.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// The details icon's tooltip: the details themselves, a few lines' worth.
function detailsTip(details: string): string {
  const d = details.trim();
  return d.length > 280 ? `${d.slice(0, 277)}…` : d;
}

// The teams line's tooltip: every team coming, then the maybes.
function teamsTip(opps: HsOpponent[], contacts: Map<string, HsContactRef>): string {
  const names = (status: HsOpponent["status"]) => [
    ...new Set(opps.filter((o) => o.status === status).map((o) => (o.contact_id && contacts.get(o.contact_id)?.name) || o.name)),
  ];
  const yes = names("confirmed");
  const maybe = names("tentative").filter((n) => !yes.includes(n));
  return [yes.length && `Coming: ${yes.join(", ")}`, maybe.length && `On the fence: ${maybe.join(", ")}`].filter(Boolean).join("\n");
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
  nowTag,
  usualDays,
  showNotes,
}: {
  w: HsWeekend;
  levels: HsLevel[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  gamesAt: (w: string, l: string) => HsGames | undefined;
  today: string;
  flash: boolean;
  // "This weekend" or "Next" by the date, for the one we're in or coming up.
  nowTag: string | null;
  // The season's usual days ("Thu–Sat"): a weekend on other days says so.
  usualDays: string;
  // The Notes column, when any weekend showing has notes or a facility.
  showNotes: boolean;
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
  const coming = line.names.length + line.more;
  const facility = w.facility_contact_id ? contacts.get(w.facility_contact_id) : undefined;
  const days = formatWeekdays(w.starts_on, w.ends_on);
  return (
    <tr
      id={`w-${w.id}`}
      className="hs-row"
      // Anywhere in the row but a button or link opens the weekend.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a")) onEvent();
      }}
      style={{
        background: flash ? "var(--rsd-accent-bg)" : st.tint,
        transition: "background-color 600ms ease",
        opacity: past && !flash ? 0.82 : 1,
        cursor: "pointer",
      }}
    >
      <td style={{ ...cellBase, fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2px 6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{formatWeekendDates(w.starts_on, w.ends_on)}</span>
          {nowTag && <NowTag label={nowTag} />}
        </div>
        {days !== usualDays && <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{days}</div>}
      </td>
      <td style={cellBase}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.location ?? ""}</div>
        {/* The trip, with the hotels and places to eat beside it. */}
        {(w.trip || near) && (
          <div style={{ display: "flex", alignItems: "center", gap: "2px 6px", flexWrap: "wrap", marginTop: 1 }}>
            {w.trip && <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{w.trip}</span>}
            {near && <TravelChip near={near} active={travelOpen} onOpen={onTravel} small />}
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
              {eventName(w)}
            </span>
            {w.details && (
              <span title={detailsTip(w.details)} style={{ display: "inline-block", marginLeft: 5, color: "var(--gw-fg-muted)", verticalAlign: -1 }}>
                <Icons.FileText width={11} height={11} />
              </span>
            )}
          </button>
          {/* Secured and off weekends already say so with their color; the
              chip is for the ones that still need something. */}
          {w.status !== "planned" && w.status !== "secured" && w.status !== "off" && <StatusChip status={w.status} small short />}
        </div>
        {(coming > 0 || line.fence > 0) && (
          <div style={{ marginTop: 1, lineHeight: 1.3 }} title={teamsTip(mine, contacts)}>
            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.3 }}>
              {line.names.slice(0, 2).join(", ")}
              {coming > 2 && ` +${coming - 2}`}
              {line.fence > 0 && (
                <span style={{ color: "#8A6100", fontWeight: 700 }}>
                  {coming ? " · " : ""}
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
          {/* Off and canceled weekends leave our teams' cells empty. */}
          {!quiet && (
            <LevelCell
              w={w}
              level={l}
              summary={summarizeCell(gamesAt(w.id, l.id), cellOpponents(w.id, l.id, opponents, levelPlays(gamesAt(w.id, l.id))))}
              record={past ? cellRecord(mine, l.id) : null}
              quiet={quiet}
              active={active === l.id}
              onHoverIn={onHoverIn}
              onHoverOut={onHoverOut}
              onOpen={onOpen}
            />
          )}
        </td>
      ))}
      {showNotes && (
        <td style={{ ...cellBase, fontSize: 12, lineHeight: 1.4, color: "var(--gw-fg)" }}>
          {w.notes}
          {facility && (
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
              <Icons.MapPin width={10} height={10} /> {facility.name}
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

// A team of ours' results on a weekend that's over: "2–1" (or "2–1–1"),
// or null when nothing has a score.
function cellRecord(opps: HsOpponent[], levelId: string): string | null {
  let w = 0;
  let l = 0;
  let t = 0;
  for (const o of opps) {
    if (o.level_id !== levelId || o.our_score == null || o.their_score == null) continue;
    if (o.our_score > o.their_score) w++;
    else if (o.our_score < o.their_score) l++;
    else t++;
  }
  return recordLabel({ wins: w, losses: l, ties: t });
}

// "This weekend" / "Next", under a weekend's dates.
function NowTag({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 800,
        padding: "1px 7px",
        borderRadius: 100,
        background: "var(--rsd-accent-fill)",
        color: "var(--rsd-accent-fill-on)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// A team's count. Solid: games set. "3?" underlined dashes: not sure yet.
// A small amber dot (in the grid): teams on the fence. Hover (or tap) for
// the card.
function LevelCell({
  w,
  level,
  summary,
  record,
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
  // A weekend that's over with scores: the result ("2–1") in place of the count.
  record?: string | null;
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
    : `${level.label}: ${count ?? "no"} game${count === 1 ? "" : "s"}${record ? `, went ${record}` : ""}${unsure ? ", not sure yet" : ""}, ${confirmed.length} coming, ${tentative.length} on the fence`;
  // In the grid a plain count is just the number; the box shows when the
  // cell needs a look (not sure, a team on the fence), is open, or on hover.
  const boxed = mobile || active || unsure || tentative.length > 0;
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
      className={mobile ? undefined : "hs-cell"}
      style={{
        position: "relative",
        width: mobile ? "auto" : "100%",
        minWidth: mobile ? 44 : undefined,
        height: 32,
        padding: mobile ? "0 9px" : 0,
        borderRadius: 8,
        border: "1px solid",
        borderColor: active ? "var(--gw-fg)" : empty || !boxed ? "transparent" : "var(--gw-border)",
        background: empty || !boxed ? "transparent" : "var(--gw-bg-elev)",
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
          fontSize: mobile ? 14 : record ? 13 : 15,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          borderBottom: unsure ? "2px dashed #D39B00" : "2px solid transparent",
          paddingBottom: 1,
          color: unsure ? "#8A6100" : undefined,
        }}
      >
        {record ?? (
          <>
            {count ?? (unsure ? "?" : "–")}
            {unsure && count != null ? "?" : ""}
          </>
        )}
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
  nowTag,
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
  nowTag: string | null;
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
          {eventName(w)}
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
            {nowTag && (
              <>
                {" "}
                <NowTag label={nowTag} />
              </>
            )}
          </span>
          {/* The green bar already says Facility secured; the chip flags what still needs work. */}
          {w.status !== "planned" && w.status !== "secured" && <StatusChip status={w.status} small />}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.3 }}>
          {eventName(w)}
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

// The season's name, which opens the list of seasons to jump to.
function SeasonPicker({ season, seasons, current }: { season: number; seasons: HsSeason[]; current: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const list = [...seasons].sort((a, b) => b.season - a.season);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Pick a season"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: "0 4px", cursor: "pointer", color: "var(--gw-fg)" }}
      >
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>{seasonLabel(season)}</h2>
        <Icons.ChevronDown width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Seasons"
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 90, minWidth: 190, background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)", borderRadius: 10, boxShadow: "0 12px 28px rgba(0,0,0,.14)", padding: 4 }}
        >
          {list.map((x) => (
            <Link
              key={x.id}
              role="menuitem"
              href={`/portal/schedule?season=${x.season}`}
              onClick={() => setOpen(false)}
              aria-current={x.season === season ? "page" : undefined}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 9px", borderRadius: 7, fontSize: 13, fontWeight: x.season === season ? 800 : 500, color: "var(--gw-fg)", textDecoration: "none", background: x.season === season ? "var(--gw-bg)" : "transparent" }}
            >
              {seasonLabel(x.season)}
              {x.season === current && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gw-fg-muted)" }}>This season</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Beside the season's name: whether it's this season, or which way it is.
function SeasonTag({ season, current }: { season: number; current: number }) {
  const label = season === current ? "This season" : season < current ? "Past season" : season === current + 1 ? "Next season" : "Later season";
  const on = season === current;
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 10.5,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 100,
        whiteSpace: "nowrap",
        background: on ? "var(--rsd-accent-fill)" : "transparent",
        color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
        border: on ? "1px solid var(--rsd-accent-fill)" : "1px solid var(--gw-border)",
      }}
    >
      {label}
    </span>
  );
}

// The season's notes from Season settings, one line with "more" when longer.
function SeasonNotes({ notes, onEdit }: { notes: string; onEdit?: () => void }) {
  const [more, setMore] = useState(false);
  const long = notes.length > 90 || notes.includes("\n");
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, minWidth: 0 }} data-tour="schedule-season-notes">
      <span
        style={
          more
            ? { whiteSpace: "pre-wrap", lineHeight: 1.45 }
            : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }
        }
      >
        {notes}
      </span>
      {long && (
        <button type="button" onClick={() => setMore((m) => !m)} style={inlineLink}>
          {more ? "less" : "more"}
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} style={inlineLink}>
          Edit
        </button>
      )}
    </div>
  );
}

const inlineLink: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gw-fg)",
  cursor: "pointer",
  textDecoration: "underline",
  flexShrink: 0,
};

function SeasonArrow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  // With nowhere to go it fades right back, so it doesn't read as a button.
  const style: React.CSSProperties = href ? roundButton : { ...roundButton, opacity: 0.35, borderStyle: "dashed", cursor: "not-allowed" };
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
// The team drop-down's "All our teams" (an empty value reads as unpicked).
const ALL_TEAMS = "\u0000all";

// What ?show= may hold.
const FILTER_KEYS: ReadonlySet<string> = new Set<string>([...WEEKEND_STATUSES.map((s) => s.value), "unsure", "fence"]);

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
      ? "All weekends"
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

// The rows under Total games: smaller, closer.
const footSub: React.CSSProperties = {
  padding: "0 12px 8px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  background: "var(--gw-bg)",
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

