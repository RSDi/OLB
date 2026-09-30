"use client";
// Which of our teams a program plays on a weekend: a chip for each team of
// ours (V, JV1, JV2…) and "All". Tap a team to add it or take it off; "All"
// puts the program down for every team we bring. A maybe is dashed. A team
// whose game has a score was played, so it stays on.

import { useState, type CSSProperties } from "react";
import { setOpponentLevels } from "../../../../lib/hs-schedule/actions";
import { programTeamIds, toggleProgramTeam, type WeekendProgram } from "../../../../lib/hs-schedule/logic";
import type { HsLevel, HsOpponentStatus } from "../../../../lib/hs-schedule/types";
import type { ScheduleAction } from "./store";

export function TeamChips({
  weekendId,
  program,
  name,
  levels,
  playing,
  status,
  keepOne = false,
  dispatch,
  onError,
}: {
  weekendId: string;
  program: WeekendProgram;
  // The program's name as the page shows it.
  name: string;
  // Our teams to offer, in column order (any hidden one it plays is added).
  levels: HsLevel[];
  // Our teams playing that weekend: the ones "All" covers.
  playing: ReadonlySet<string>;
  // What it starts as on a team it's added to.
  status: HsOpponentStatus;
  // Never take off its last team (the trash can takes a program off).
  keepOne?: boolean;
  dispatch: (a: ScheduleAction) => void;
  onError: (msg: string) => void;
}) {
  // While saving: the teams asked for (null: all of them).
  const [saving, setSaving] = useState<string[] | null | undefined>(undefined);
  const busy = saving !== undefined;
  const byLevel = new Map(program.teams.map((t) => [t.level.id, t]));
  const shown = [...levels, ...program.teams.map((t) => t.level).filter((l) => !levels.some((x) => x.id === l.id))].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );
  const ids = busy ? (saving === null ? [...playing] : saving) : programTeamIds(program);
  const allOn = busy ? saving === null : program.all;

  const save = async (next: string[] | null) => {
    setSaving(next);
    const res = await setOpponentLevels({
      weekend_id: weekendId,
      contact_id: program.contact_id,
      name: program.name,
      level_ids: next,
      status,
    });
    if (res.error || !res.data) onError(res.error ?? "Couldn't save.");
    else dispatch({ type: "program", weekendId, key: program.key, rows: res.data });
    setSaving(undefined);
  };

  return (
    <div role="group" aria-label={`Which of our teams ${name} plays`} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      <button
        type="button"
        aria-pressed={allOn}
        // Not `disabled`, so the tooltip still shows.
        aria-disabled={busy || allOn}
        onClick={() => !busy && !allOn && save(null)}
        title={allOn ? `${name} is down for all our teams. Tap a team to change that.` : `Put ${name} down for all our teams`}
        style={{ ...chip, ...(allOn ? onStyle : offStyle), cursor: busy || allOn ? "default" : "pointer" }}
      >
        All
      </button>
      {shown.map((l) => {
        const t = byLevel.get(l.id);
        const on = ids.includes(l.id);
        const played = on && !!t?.scored;
        const last = keepOne && on && ids.length <= 1;
        const look = !on ? offStyle : !busy && t?.status === "tentative" ? maybeStyle : !busy && t?.viaAll ? viaAllStyle : onStyle;
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            aria-label={`${l.label}${on && t?.status === "tentative" ? ", a maybe" : ""}`}
            aria-disabled={busy || played || last}
            onClick={() => !busy && !played && !last && save(toggleProgramTeam(program, l.id))}
            title={
              played
                ? `${l.label} played ${name}: it has a score`
                : last
                  ? `${name} plays just ${l.label}. To take it off the weekend, use the trash can.`
                  : on
                    ? `Take ${name} off ${l.label}`
                    : `${name} plays ${l.label} too`
            }
            style={{ ...chip, ...look, cursor: busy || played || last ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

const chip: CSSProperties = {
  height: 24,
  minWidth: 30,
  padding: "0 7px",
  borderRadius: 100,
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
};

// Plays this team of ours.
const onStyle: CSSProperties = { border: "1.5px solid var(--gw-fg)", background: "var(--gw-fg)", color: "var(--gw-bg)" };
// Plays it because it's down for all our teams.
const viaAllStyle: CSSProperties = { border: "1.5px solid var(--gw-fg)", background: "var(--gw-bg-elev)", color: "var(--gw-fg)" };
// A maybe for this team of ours.
const maybeStyle: CSSProperties = { border: "1.5px dashed #D39B00", background: "rgba(255, 214, 0, 0.18)", color: "#8A6100" };
const offStyle: CSSProperties = { border: "1.5px solid var(--gw-border)", background: "transparent", color: "var(--gw-fg-muted)" };
