"use client";
// A season's settings: its notes, its columns (the teams we field,
// in order, each with a short label, an optional longer name, the Directory
// team it is, and whether it's folded away), starting next season from this
// one, and deleting it. Adding and deleting seasons is the board's.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import { SideSheet } from "../../../components/SideSheet";
import {
  createSeason,
  deleteLevel,
  deleteSeason,
  moveLevel,
  saveLevel,
  updateSeason,
} from "../../../../lib/hs-schedule/actions";
import { seasonLabel } from "../../../../lib/planning/season";
import type { HsLevel, HsSeason } from "../../../../lib/hs-schedule/types";

export interface DirectoryTeam {
  id: string;
  name: string;
  age_group: string | null;
}

export function SeasonSheet({
  season,
  levels,
  seasons,
  teams,
  isStaff,
  onClose,
  onNewSeason,
}: {
  season: HsSeason;
  levels: HsLevel[];
  seasons: HsSeason[];
  // This season's teams in the Directory (only the current season has them).
  teams: DirectoryTeam[];
  isStaff: boolean;
  onClose: () => void;
  // Opens New season, for any other season, empty or from another.
  onNewSeason: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(season.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const next = season.season + 1;
  const nextExists = seasons.some((s) => s.season === next);

  async function run<T>(fn: () => Promise<{ error?: string; data?: T }>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return undefined;
    }
    router.refresh();
    return res.data;
  }

  return (
    <SideSheet
      eyebrow={seasonLabel(season.season)}
      title="Season settings"
      busy={busy}
      width={560}
      onClose={onClose}
      tour="schedule-season-sheet"
      footer={
        <>
          <Pill variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Close
          </Pill>
          <Pill
            variant="accent"
            size="md"
            disabled={busy}
            onClick={() => run(() => updateSeason(season.id, { notes }))}
          >
            Save
          </Pill>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything about the season as a whole: game limits, who's the scheduler…" />
      {season.imported_from && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Imported from {season.imported_from}
          {season.imported_at && ` on ${new Date(season.imported_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-tour="schedule-columns">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={cap}>Our teams</span>
          {!adding && (
            <Pill variant="light" size="sm" onClick={() => setAdding(true)}>
              <Icons.Plus width={12} height={12} /> Add team
            </Pill>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
          Each team we field this season, like the spreadsheet&apos;s V, JV1, JV2, 14U A: one column on the schedule
          each. A hidden team keeps its games but folds away, like the spreadsheet&apos;s hidden 14U and 12U.
        </div>
        {adding && (
          <LevelForm
            teams={teams}
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              const ok = await run(() => saveLevel(season.id, null, input));
              if (ok) setAdding(false);
            }}
          />
        )}
        {levels.map((l, i) => (
          <LevelRow
            key={l.id}
            level={l}
            first={i === 0}
            last={i === levels.length - 1}
            teams={teams}
            busy={busy}
            onSave={(input) => run(() => saveLevel(season.id, l.id, input))}
            onMove={(d) => run(() => moveLevel(l.id, d))}
            onDelete={() => {
              if (!confirm(`Delete ${l.label} and every game and team entered under it?`)) return;
              void run(() => deleteLevel(l.id));
            }}
          />
        ))}
      </div>

      {isStaff && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--gw-border)", paddingTop: 14 }}>
          <span style={cap}>Next season</span>
          {nextExists ? (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>{seasonLabel(next)} is already on the schedule.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Start {seasonLabel(next)} from this season: the same weekends a year on (same days of the week), the same
                events, places, teams of ours and games, and the teams that came, now on the fence. Scores and canceled weekends
                aren&apos;t carried.
              </div>
              <div>
                <Pill
                  variant="light"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const made = await run(() => createSeason({ season: next, fromSeasonId: season.id }));
                    if (made) {
                      onClose();
                      router.push(`/portal/schedule?season=${next}`);
                    }
                  }}
                >
                  Start {seasonLabel(next)} from {seasonLabel(season.season)}
                </Pill>
              </div>
            </>
          )}
          <div>
            <Pill variant="ghost" size="sm" disabled={busy} onClick={onNewSeason}>
              <Icons.Plus width={12} height={12} /> New season
            </Pill>
          </div>
          <span style={{ ...cap, marginTop: 8 }}>Delete</span>
          <div>
            <Pill
              variant="ghost"
              size="sm"
              disabled={busy}
              style={{ color: "var(--gw-error)" }}
              onClick={async () => {
                if (!confirm(`Delete the whole ${seasonLabel(season.season)} schedule, with every weekend, game, team and score? This can't be undone.`)) return;
                const gone = await run(() => deleteSeason(season.id));
                if (gone !== undefined) {
                  onClose();
                  router.push("/portal/schedule");
                }
              }}
            >
              <Icons.Trash width={12} height={12} /> Delete {seasonLabel(season.season)}
            </Pill>
          </div>
        </div>
      )}
    </SideSheet>
  );
}

type LevelInput = { label: string; name: string | null; team_id: string | null; hidden: boolean };

function LevelRow({
  level,
  first,
  last,
  teams,
  busy,
  onSave,
  onMove,
  onDelete,
}: {
  level: HsLevel;
  first: boolean;
  last: boolean;
  teams: DirectoryTeam[];
  busy: boolean;
  onSave: (input: LevelInput) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const team = teams.find((t) => t.id === level.team_id);
  if (editing) {
    return (
      <LevelForm
        initial={level}
        teams={teams}
        onCancel={() => setEditing(false)}
        onSave={(input) => {
          onSave(input);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--gw-border)", borderRadius: 10, opacity: level.hidden ? 0.7 : 1 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <button type="button" aria-label="Move left" disabled={first || busy} onClick={() => onMove(-1)} style={arrowBtn}>
          <Icons.ChevronUp width={12} height={12} />
        </button>
        <button type="button" aria-label="Move right" disabled={last || busy} onClick={() => onMove(1)} style={arrowBtn}>
          <Icons.ChevronDown width={12} height={12} />
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>
          {level.label}
          {level.name && <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)", fontSize: 12 }}> · {level.name}</span>}
          {level.hidden && (
            <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10, marginLeft: 6 }}>
              Hidden
            </span>
          )}
        </div>
        {team && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>Directory team: {team.name}</div>}
      </div>
      <button type="button" aria-label={`Edit ${level.label}`} onClick={() => setEditing(true)} style={iconBtn}>
        <Icons.Pencil width={13} height={13} />
      </button>
      <button type="button" aria-label={`Delete ${level.label}`} onClick={onDelete} style={iconBtn}>
        <Icons.Trash width={13} height={13} />
      </button>
    </div>
  );
}

function LevelForm({
  initial,
  teams,
  onCancel,
  onSave,
}: {
  initial?: HsLevel;
  teams: DirectoryTeam[];
  onCancel: () => void;
  onSave: (input: LevelInput) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [teamId, setTeamId] = useState(initial?.team_id ?? "");
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: "1px solid var(--rsd-accent-line)", borderRadius: 10, background: "var(--gw-bg)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={12} placeholder="V, JV1, 14U A" autoFocus />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Varsity (optional)" />
      </div>
      {teams.length > 0 && (
        <Select label="Directory team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— None —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.age_group ? ` (${t.age_group})` : ""}
            </option>
          ))}
        </Select>
      )}
      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} style={{ accentColor: "var(--rsd-accent-fill)" }} />
        Hidden (fold this team away)
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Pill>
        <Pill
          variant="accent"
          size="sm"
          disabled={!label.trim()}
          onClick={() => onSave({ label: label.trim(), name: name.trim() || null, team_id: teamId || null, hidden })}
        >
          {initial ? "Save team" : "Add team"}
        </Pill>
      </div>
    </div>
  );
}

const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const arrowBtn: React.CSSProperties = {
  width: 22,
  height: 16,
  border: "none",
  background: "transparent",
  color: "var(--gw-fg-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};
