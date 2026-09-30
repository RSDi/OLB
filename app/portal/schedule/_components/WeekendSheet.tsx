"use client";
// A weekend's details in a sheet: its dates, event, where, trip, status,
// notes (the venue and game times) and the Facilities contact, plus every
// team of ours with its games and every team coming, each with the teams of
// ours it plays (TeamChips). The fields save with "Save"; games and teams
// save as you change them, like the grid.

import { useState } from "react";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import { SideSheet } from "../../../components/SideSheet";
import {
  addOpponent,
  deleteOpponent,
  deleteWeekend,
  saveWeekend,
  setWeekendGames,
  updateOpponent,
} from "../../../../lib/hs-schedule/actions";
import {
  TRIP_TYPES,
  WEEKEND_STATUSES,
  addDays,
  daysBetween,
  formatWeekdays,
  formatWeekendDates,
  resultLabel,
  teamsPlaying,
  weekendPrograms,
  type WeekendProgram,
} from "../../../../lib/hs-schedule/logic";
import type {
  HsContactOption,
  HsContactRef,
  HsGames,
  HsLevel,
  HsOpponent,
  HsOpponentStatus,
  HsWeekend,
  HsWeekendInput,
  HsWeekendStatus,
} from "../../../../lib/hs-schedule/types";
import { Dot, StatusSwitch } from "./CellPopover";
import type { ScheduleAction } from "./store";
import { TeamAdder, type TeamPick } from "./TeamAdder";
import { ComboSelect } from "../../../components/ComboSelect";
import { TeamChips } from "./TeamChips";

const FACILITY_TYPES = ["facilities", "facility", "gyms", "venues", "gym rentals"];

export function WeekendSheet({
  seasonId,
  weekend,
  defaults,
  levels,
  games,
  opponents,
  contacts,
  options,
  knownTeams,
  dispatch,
  onClose,
  onSaved,
}: {
  seasonId: string;
  // null: a new weekend, starting from `defaults`.
  weekend: HsWeekend | null;
  defaults: { starts_on: string; ends_on: string };
  levels: HsLevel[];
  games: HsGames[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  dispatch: (a: ScheduleAction) => void;
  onClose: () => void;
  onSaved: (w: HsWeekend) => void;
}) {
  const [startsOn, setStartsOn] = useState(weekend?.starts_on ?? defaults.starts_on);
  const [endsOn, setEndsOn] = useState(weekend?.ends_on ?? defaults.ends_on);
  const [event, setEvent] = useState(weekend?.event ?? "");
  const [details, setDetails] = useState(weekend?.details ?? "");
  const [location, setLocation] = useState(weekend?.location ?? "");
  const [trip, setTrip] = useState(weekend?.trip ?? "");
  const [status, setStatus] = useState<HsWeekendStatus>(weekend?.status ?? "planned");
  const [notes, setNotes] = useState(weekend?.notes ?? "");
  const [facilityId, setFacilityId] = useState(weekend?.facility_contact_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facilities = options.filter((o) => o.category && FACILITY_TYPES.includes(o.category.toLowerCase()));
  const trips = [...new Set([...TRIP_TYPES, ...(weekend?.trip ? [weekend.trip] : [])])];
  const input: HsWeekendInput = {
    starts_on: startsOn,
    ends_on: endsOn < startsOn ? startsOn : endsOn,
    event,
    details,
    location,
    trip: trip || null,
    status,
    notes,
    facility_contact_id: facilityId || null,
  };

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveWeekend(seasonId, weekend?.id ?? null, input);
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? "Couldn't save.");
    dispatch({ type: "weekend", row: res.data });
    onSaved(res.data);
  }

  async function remove() {
    if (!weekend) return;
    if (!confirm(`Delete ${weekend.event || "this weekend"} (${formatWeekendDates(weekend.starts_on, weekend.ends_on)}) and its games and teams?`)) return;
    setBusy(true);
    const res = await deleteWeekend(weekend.id);
    setBusy(false);
    if (res.error) return setError(res.error);
    dispatch({ type: "weekendGone", id: weekend.id });
    onClose();
  }

  const span = daysBetween(input.starts_on, input.ends_on);

  return (
    <SideSheet
      eyebrow={weekend ? formatWeekendDates(weekend.starts_on, weekend.ends_on) : "New weekend"}
      title={weekend ? weekend.event || "Weekend" : "Add a weekend"}
      busy={busy}
      width={600}
      onClose={onClose}
      tour="schedule-weekend-sheet"
      footer={
        <>
          {weekend && (
            <Pill variant="ghost" size="md" onClick={remove} disabled={busy} style={{ color: "var(--gw-error)", marginRight: "auto" }}>
              <Icons.Trash width={14} height={14} /> Delete
            </Pill>
          )}
          <Pill variant="ghost" size="md" onClick={onClose} disabled={busy}>
            {weekend ? "Close" : "Cancel"}
          </Pill>
          <Pill variant="accent" size="md" onClick={save} disabled={busy}>
            {busy ? "Saving…" : weekend ? "Save" : "Add weekend"}
          </Pill>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Input label="Event" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="e.g. Missouri River Shootout" autoFocus={!weekend} />
      <div style={grid2}>
        <Input
          label="First day"
          type="date"
          value={startsOn}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            // Keep the weekend's length when its start moves.
            setEndsOn(addDays(v, Math.max(0, daysBetween(startsOn, endsOn))));
            setStartsOn(v);
          }}
        />
        <Input label="Last day" type="date" value={endsOn} min={startsOn} onChange={(e) => e.target.value && setEndsOn(e.target.value)} />
      </div>
      <div style={{ fontSize: 12, color: span > 14 ? "var(--gw-error)" : "var(--gw-fg-muted)", fontWeight: 600, marginTop: -8 }}>
        {formatWeekendDates(input.starts_on, input.ends_on)} · {formatWeekdays(input.starts_on, input.ends_on)}
        {span > 14 && " · two weeks at most"}
      </div>
      <div style={grid2}>
        <Input label="Where" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Omaha, NE" />
        <Select label="Trip" value={trip} onChange={(e) => setTrip(e.target.value)}>
          <option value="">—</option>
          {trips.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <Select
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as HsWeekendStatus)}
        help="The spreadsheet's colors: need to secure facility (yellow), final details in process (pale yellow), facility secured (green)."
      >
        {WEEKEND_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Venue, game times… e.g. Secured IA West Fieldhouse" />
      {facilities.length > 0 && (
        <Select label="Facility (External Contacts)" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          <option value="">— None —</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      )}
      <Textarea
        label="Details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={details.length > 200 ? 5 : 3}
        placeholder="Anything else: who might come, who to call, what's still open."
      />

      {weekend ? (
        <>
          <GamesEditor weekend={weekend} levels={levels} games={games} dispatch={dispatch} onError={setError} />
          <TeamsEditor
            weekend={weekend}
            levels={levels}
            games={games}
            opponents={opponents.filter((o) => o.weekend_id === weekend.id)}
            contacts={contacts}
            options={options}
            knownTeams={knownTeams}
            dispatch={dispatch}
            onError={setError}
          />
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Add the weekend first; then set each team&apos;s games and who&apos;s coming, here or in the grid.
        </div>
      )}
    </SideSheet>
  );
}

function GamesEditor({
  weekend,
  levels,
  games,
  dispatch,
  onError,
}: {
  weekend: HsWeekend;
  levels: HsLevel[];
  games: HsGames[];
  dispatch: (a: ScheduleAction) => void;
  onError: (m: string) => void;
}) {
  const save = async (level: HsLevel, next: { games: number | null; unsure: boolean }) => {
    const before = games.find((g) => g.weekend_id === weekend.id && g.level_id === level.id) ?? null;
    dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: { weekend_id: weekend.id, level_id: level.id, note: before?.note ?? null, ...next } });
    const res = await setWeekendGames({ weekend_id: weekend.id, level_id: level.id, ...next, note: before?.note ?? null });
    if (res.error) {
      dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: before });
      onError(res.error);
    } else dispatch({ type: "games", weekendId: weekend.id, levelId: level.id, row: res.data ?? null });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={cap}>Games for each of our teams</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 8 }}>
        {levels.map((l) => {
          const g = games.find((x) => x.weekend_id === weekend.id && x.level_id === l.id);
          return (
            <div key={l.id} style={{ border: "1px solid var(--gw-border)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4, opacity: l.hidden ? 0.7 : 1 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                {l.label}
                {l.hidden && <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}> (hidden)</span>}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <GamesInput
                  label={`${l.label} games`}
                  value={g?.games ?? null}
                  onSave={(n) => save(l, { games: n, unsure: !!g?.unsure })}
                />
                <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!g?.unsure} onChange={(e) => save(l, { games: g?.games ?? null, unsure: e.target.checked })} style={{ accentColor: "var(--rsd-accent-fill)" }} />
                  Not sure
                </label>
              </div>
              {g?.note && <span style={{ fontSize: 11, color: "var(--gw-fg-muted)" }}>{g.note}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamsEditor({
  weekend,
  levels,
  games,
  opponents,
  contacts,
  options,
  knownTeams,
  dispatch,
  onError,
}: {
  weekend: HsWeekend;
  levels: HsLevel[];
  games: HsGames[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  options: HsContactOption[];
  knownTeams: TeamPick[];
  dispatch: (a: ScheduleAction) => void;
  onError: (m: string) => void;
}) {
  const [addLevel, setAddLevel] = useState<string>("all");
  const [addStatus, setAddStatus] = useState<HsOpponentStatus>("confirmed");
  const labelOf = new Map(levels.map((l) => [l.id, l.label]));
  const playing = teamsPlaying(weekend.id, levels, games);
  const programs = weekendPrograms(weekend.id, opponents, levels, playing);
  const chipLevels = levels.filter((l) => !l.hidden);

  // Yes / Maybe / No for every team of ours it plays; a game with a score keeps its own.
  const setStatus = async (p: WeekendProgram, status: HsOpponentStatus) => {
    const rows = p.rows.filter((o) => o.our_score == null && o.status !== status);
    for (const o of rows) dispatch({ type: "opponent", row: { ...o, status } });
    const saved = await Promise.all(rows.map((o) => updateOpponent(o.id, { status })));
    saved.forEach((res, i) => {
      if (res.error || !res.data) {
        dispatch({ type: "opponent", row: rows[i] });
        onError(res.error ?? "Couldn't save.");
      } else dispatch({ type: "opponent", row: res.data });
    });
  };
  const remove = async (p: WeekendProgram, name: string) => {
    const played = p.rows.some((o) => o.our_score != null);
    if (played && !confirm(`${name} has a score this weekend. Take it off anyway?`)) return;
    if (!played && p.teams.length > 1 && !confirm(`Take ${name} off this weekend for all our teams?`)) return;
    for (const o of p.rows) dispatch({ type: "opponentGone", id: o.id });
    const done = await Promise.all(p.rows.map((o) => deleteOpponent(o.id)));
    done.forEach((res, i) => {
      if (res.error) {
        dispatch({ type: "opponent", row: p.rows[i] });
        onError(res.error);
      }
    });
  };
  const add = async (pick: TeamPick) => {
    const res = await addOpponent({
      weekend_id: weekend.id,
      level_id: addLevel === "all" ? null : addLevel,
      contact_id: pick.contact_id,
      name: pick.name,
      status: addStatus,
    });
    if (res.error || !res.data) onError(res.error ?? "Couldn't add the team.");
    else dispatch({ type: "opponent", row: res.data });
  };
  // A team already here gets more of our teams with its chips, not a second line.
  const taken = new Set(programs.map((p) => p.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-tour="schedule-weekend-teams">
      <span style={cap}>Teams coming ({programs.length})</span>
      {programs.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>None yet.</div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Under each, tap the teams of ours it plays. <strong>All</strong> is every team we bring.
        </div>
      )}
      {programs.map((p) => {
        const c = p.contact_id ? contacts.get(p.contact_id) : undefined;
        const name = c?.name ?? p.name;
        const results = p.rows
          .filter((o) => resultLabel(o))
          .map((o) => [o.level_id ? labelOf.get(o.level_id) : null, resultLabel(o)].filter(Boolean).join(" "))
          .join(", ");
        return (
          <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: "1px solid var(--gw-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Dot tone={p.status} />
              <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, fontWeight: 700 }}>
                {c ? (
                  <a href={`/portal/contacts/${c.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {name}
                  </a>
                ) : (
                  name
                )}
                {results && <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}> · {results}</span>}
              </span>
              <StatusSwitch value={p.status} onChange={(s) => setStatus(p, s)} name={name} />
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => remove(p, name)}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Icons.Trash width={13} height={13} />
              </button>
            </div>
            <div style={{ paddingLeft: 16 }}>
              <TeamChips
                weekendId={weekend.id}
                program={p}
                name={name}
                levels={chipLevels}
                playing={playing}
                status={p.status}
                keepOne
                dispatch={dispatch}
                onError={onError}
              />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid var(--gw-border)" }}>
        <TeamAdder options={options} knownTeams={knownTeams} taken={taken} onAdd={add} placeholder="Add a team coming…" />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusSwitch value={addStatus} onChange={setAddStatus} name="the new team" />
          <ComboSelect
            value={addLevel}
            onChange={(e) => setAddLevel(e.target.value)}
            aria-label="For which of our teams"
            style={{ height: 26, padding: "0 6px", borderRadius: 7, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 11.5, fontWeight: 600 }}
          >
            <option value="all">For all our teams</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                For {l.label} only
              </option>
            ))}
          </ComboSelect>
        </div>
      </div>
    </div>
  );
}

// A number box that saves when you leave it (or press Enter).
function GamesInput({ label, value, onSave }: { label: string; value: number | null; onSave: (n: number | null) => void }) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [last, setLast] = useState(value);
  if (value !== last) {
    // Changed elsewhere (the grid): show the new number.
    setLast(value);
    setText(value?.toString() ?? "");
  }
  const commit = () => {
    const n = text === "" ? null : Math.min(30, Number(text));
    if (n !== value) onSave(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={text}
      placeholder="–"
      onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      style={{ width: 44, height: 28, textAlign: "center", borderRadius: 7, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontWeight: 800, fontSize: 13 }}
    />
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};
