"use client";
// Settings → Teams: the current season's teams. Players are placed on them in
// the Team manager; staff and volunteers are assigned on each team's
// Directory page.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { ShowMeHow } from "./ShowMeHow";
import { createClient } from "../../../lib/supabase/client";
import { createTeam, deleteTeam, updateTeamSettings } from "../../../lib/teams/volunteer-actions";
import type { TeamSettingsInput } from "../../../lib/teams/types";
import { AGE_GROUPS, TEAM_COLORS, teamColorHex, teamLabel } from "../../../lib/teams/volunteer-options";

interface TeamRow {
  id: string;
  name: string;
  age_group: string | null;
  color: string | null;
  division: string | null;
  practice_times: string[];
  practice_location: string | null;
}

interface TeamsData {
  season: string | null;
  teams: TeamRow[];
  players: Map<string, number>;
  error: string | null;
}

async function fetchTeams(): Promise<TeamsData> {
  const supabase = createClient();
  const { data: board } = await supabase
    .from("olb_boards")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return { season: null, teams: [], players: new Map(), error: null };
  const [{ data: teams, error }, { data: roster }] = await Promise.all([
    supabase
      .from("olb_teams")
      .select("id, name, age_group, color, division, practice_times, practice_location")
      .eq("board_id", board.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("olb_players").select("team_id").eq("board_id", board.id),
  ]);
  const players = new Map<string, number>();
  for (const p of (roster as { team_id: string | null }[] | null) ?? []) {
    if (p.team_id) players.set(p.team_id, (players.get(p.team_id) ?? 0) + 1);
  }
  return {
    season: board.season as string,
    teams: (teams as TeamRow[] | null) ?? [],
    players,
    error: error?.message ?? null,
  };
}

export function TeamsSettingsTab() {
  const [season, setSeason] = useState<string | null>(null);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: TeamsData) => {
    setSeason(d.season);
    setRows(d.teams);
    setPlayers(d.players);
    if (d.error) setError(d.error);
    setLoading(false);
  }, []);
  const load = useCallback(async () => apply(await fetchTeams()), [apply]);

  useEffect(() => {
    fetchTeams().then(apply);
  }, [apply]);

  async function save(id: string | null, input: TeamSettingsInput) {
    setError(null);
    const res = id ? await updateTeamSettings(id, input) : await createTeam(input);
    if (res.error) {
      setError(res.error);
      return false;
    }
    setAdding(false);
    setEditingId(null);
    await load();
    return true;
  }

  async function remove(t: TeamRow) {
    const n = players.get(t.id) ?? 0;
    const msg =
      n > 0
        ? `Delete ${teamLabel(t)}? Its ${n} players go back to Unassigned in the Team manager, and its volunteer spots are cleared.`
        : `Delete ${teamLabel(t)}? Its volunteer spots are cleared.`;
    if (!confirm(msg)) return;
    setError(null);
    const res = await deleteTeam(t.id);
    if (res.error) setError(res.error);
    else await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
          {season ? `${season} season. ` : ""}Players are placed on teams in the{" "}
          <Link href="/portal/teams" prefetch={false} style={{ color: "var(--gw-fg)", fontWeight: 700 }}>
            Team manager
          </Link>
          ; coaches and volunteers are assigned on each team&apos;s page in the Directory.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ShowMeHow tour="settings-teams" />
          {!adding && season && (
            <span data-tour="teams-add" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Icons.Plus width={14} height={14} /> New team
              </Pill>
            </span>
          )}
        </div>
      </div>

      {error && <ErrorBox text={error} />}

      {adding && (
        <TeamForm submitLabel="Create team" onCancel={() => setAdding(false)} onSubmit={(v) => save(null, v)} />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : !season ? (
        <Empty text="No season set up yet." />
      ) : rows.length === 0 ? (
        <Empty text="No teams yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((t) =>
            editingId === t.id ? (
              <TeamForm
                key={t.id}
                initial={t}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => save(t.id, v)}
              />
            ) : (
              <div
                key={t.id}
                data-tour="teams-row"
                className="rsd-card"
                style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "12px 18px", flexWrap: "wrap" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: teamColorHex(t.color),
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{teamLabel(t)}</span>
                  <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                    {[
                      t.division,
                      t.practice_times.join(" · ") || null,
                      t.practice_location,
                      `${players.get(t.id) ?? 0} players`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Link
                  href={`/portal/directory/teams/${t.id}`}
                  prefetch={false}
                  style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
                >
                  Staff &amp; volunteers →
                </Link>
                <div style={{ display: "flex", gap: 8 }}>
                  <IconBtn title="Edit" onClick={() => setEditingId(t.id)}>
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  <IconBtn title="Delete" danger onClick={() => remove(t)}>
                    <Icons.Trash width={14} height={14} />
                  </IconBtn>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TeamForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TeamRow;
  submitLabel: string;
  onSubmit: (v: TeamSettingsInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState<string | null>(initial?.age_group ?? null);
  const [color, setColor] = useState<string | null>(initial?.color?.toUpperCase() ?? null);
  const [division, setDivision] = useState(initial?.division ?? "");
  const [times, setTimes] = useState((initial?.practice_times ?? []).join("; "));
  const [location, setLocation] = useState(initial?.practice_location ?? "");
  const [pending, setPending] = useState(false);
  // An imported team can carry an age group outside the standard list.
  const ages = age && !AGE_GROUPS.includes(age) ? [...AGE_GROUPS, age] : AGE_GROUPS;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name,
      age_group: age,
      color,
      division,
      practice_times: times.split(";"),
      practice_location: location,
    });
    setPending(false);
  }

  return (
    <form onSubmit={submit} data-tour="teams-form" className="rsd-card" style={{ gap: 16, padding: "18px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <Input label="Team name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold" autoFocus required />
        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <legend style={legend}>Age group</legend>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ages.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={age === a}
                onClick={() => setAge(age === a ? null : a)}
                style={{
                  height: 42,
                  flex: "1 0 52px",
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: age === a ? "var(--gw-fg)" : "var(--gw-border)",
                  background: age === a ? "var(--gw-fg)" : "var(--gw-bg)",
                  color: age === a ? "var(--rsd-accent-fill)" : "var(--gw-fg-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <legend style={legend}>Team color</legend>
          <div style={{ display: "flex", gap: 10, alignItems: "center", height: 42 }}>
            {TEAM_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.label}
                aria-pressed={color === c.key}
                title={c.label}
                onClick={() => setColor(color === c.key ? null : c.key)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: c.hex,
                  border: "1px solid rgba(0,0,0,.18)",
                  boxShadow: color === c.key ? "0 0 0 2px var(--gw-bg-elev), 0 0 0 4px var(--gw-fg)" : "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </fieldset>
        <Input label="Division" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g. Mid Silver" />
        <Input
          label="Practice times"
          value={times}
          onChange={(e) => setTimes(e.target.value)}
          placeholder="e.g. Tue & Thu 6:00–7:30 pm"
          help="Separate more than one with a semicolon."
        />
        <Input label="Practice location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. North Gym" />
      </div>
      <div data-tour="teams-save" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--gw-error-bg)",
        border: "1px solid rgba(229,62,62,.25)",
        borderRadius: 10,
        padding: "12px 16px",
        fontSize: 13,
        color: "var(--gw-error)",
        fontWeight: 600,
      }}
    >
      <Icons.AlertCircle width={16} height={16} />
      {text}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
    </div>
  );
}

export function IconBtn({
  children,
  onClick,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: danger ? "var(--gw-error)" : "var(--gw-fg-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

const legend: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--gw-fg-muted)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: 0,
  marginBottom: 6,
};
