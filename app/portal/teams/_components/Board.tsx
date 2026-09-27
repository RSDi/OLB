"use client";
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import type { OlbBoardData, OlbTeam, OlbPlayer, OlbCoach } from "../../../../lib/teams/types";
import { movePlayer, moveCoach, updatePlayer, deletePlayer, deleteCoach, updateTeam } from "../../../../lib/teams/actions";
import TeamColumn from "./TeamColumn";
import RosterStats from "./RosterStats";
import MoveSheet from "./MoveSheet";
import EditPlayerModal from "./EditPlayerModal";
import EditTeamModal from "./EditTeamModal";
import { PlayerCardView } from "./PlayerCard";
import { CoachChipView } from "./CoachChip";

type ItemRef = { type: "player" | "coach"; id: string };
type TeamFields = {
  name: string; color: string | null; grade_label: string | null; division: string | null;
  target_size: number | null; min_size: number | null; max_size: number | null;
};

export default function Board({ initial }: { initial: OlbBoardData }) {
  const [teams, setTeams] = useState<OlbTeam[]>(initial.teams);
  const [players, setPlayers] = useState<OlbPlayer[]>(initial.players);
  const [coaches, setCoaches] = useState<OlbCoach[]>(initial.coaches);
  const [active, setActive] = useState<ItemRef | null>(null);
  const [sheet, setSheet] = useState<ItemRef | null>(null);
  const [editPlayer, setEditPlayer] = useState<OlbPlayer | null>(null);
  const [editTeam, setEditTeam] = useState<OlbTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const playersByTeam = useMemo(() => {
    const m: Record<string, OlbPlayer[]> = { unassigned: [] };
    for (const t of teams) m[t.id] = [];
    for (const p of players) (m[p.team_id ?? "unassigned"] ??= []).push(p);
    return m;
  }, [teams, players]);

  const coachesByTeam = useMemo(() => {
    const m: Record<string, OlbCoach[]> = { unassigned: [] };
    for (const t of teams) m[t.id] = [];
    for (const c of coaches) (m[c.team_id ?? "unassigned"] ??= []).push(c);
    return m;
  }, [teams, coaches]);

  function applyMove(item: ItemRef, toTeamId: string | null) {
    if (item.type === "player") {
      setPlayers((prev) => prev.map((p) => (p.id === item.id ? { ...p, team_id: toTeamId } : p)));
    } else {
      setCoaches((prev) => prev.map((c) => (c.id === item.id ? { ...c, team_id: toTeamId } : c)));
    }
  }

  function currentTeamOf(item: ItemRef): string | null {
    const src = item.type === "player" ? players.find((p) => p.id === item.id) : coaches.find((c) => c.id === item.id);
    return src?.team_id ?? null;
  }

  async function commitMove(item: ItemRef, toTeamId: string | null) {
    const prev = currentTeamOf(item);
    if (prev === toTeamId) return;
    applyMove(item, toTeamId);
    try {
      if (item.type === "player") await movePlayer(item.id, toTeamId);
      else await moveCoach(item.id, toTeamId);
    } catch {
      applyMove(item, prev);
      setError("Couldn't save that move — it's been put back. Check your connection and try again.");
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActive({ type: e.active.data.current?.type ?? "player", id: String(e.active.id) });
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 60);
    const { active: a, over } = e;
    if (!over) return;
    const item: ItemRef = { type: a.data.current?.type ?? "player", id: String(a.id) };
    const toTeamId = over.id === "unassigned" ? null : String(over.id);
    commitMove(item, toTeamId);
  }

  function openSheet(item: ItemRef) {
    if (justDragged.current) return;
    setSheet(item);
  }

  // ── Edit / remove ─────────────────────────────────────────────
  function savePlayer(id: string, fields: { full_name: string; dob: string | null; grade: string | null; jersey_number: string | null }) {
    const prev = players.find((p) => p.id === id);
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...fields, import_flag: null } : p)));
    setEditPlayer(null);
    updatePlayer(id, fields).catch(() => {
      if (prev) setPlayers((ps) => ps.map((p) => (p.id === id ? prev : p)));
      setError("Couldn't save player changes — reverted.");
    });
  }

  function removePlayer(id: string) {
    const prev = players.find((p) => p.id === id);
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    setEditPlayer(null);
    setSheet(null);
    deletePlayer(id).catch(() => {
      if (prev) setPlayers((ps) => [...ps, prev]);
      setError("Couldn't remove player — restored.");
    });
  }

  function saveTeam(id: string, fields: TeamFields) {
    const prev = teams.find((t) => t.id === id);
    setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    setEditTeam(null);
    updateTeam(id, fields).catch(() => {
      if (prev) setTeams((ts) => ts.map((t) => (t.id === id ? prev : t)));
      setError("Couldn't save team changes — reverted.");
    });
  }

  function removeCoach(id: string) {
    const prev = coaches.find((c) => c.id === id);
    setCoaches((cs) => cs.filter((c) => c.id !== id));
    setSheet(null);
    deleteCoach(id).catch(() => {
      if (prev) setCoaches((cs) => [...cs, prev]);
      setError("Couldn't remove coach — restored.");
    });
  }

  const activePlayer = active?.type === "player" ? players.find((p) => p.id === active.id) : null;
  const activeCoach = active?.type === "coach" ? coaches.find((c) => c.id === active.id) : null;

  const sheetItem = sheet
    ? sheet.type === "player"
      ? players.find((p) => p.id === sheet.id)
      : coaches.find((c) => c.id === sheet.id)
    : null;
  const counts: Record<string, number> = {
    unassigned: playersByTeam.unassigned.length,
    ...Object.fromEntries(teams.map((t) => [t.id, (playersByTeam[t.id] ?? []).length])),
  };

  return (
    <div className="olb-page">
      <h1 className="olb-h1" style={{ marginBottom: 14 }}>Teams — {initial.board.season}</h1>
      <RosterStats players={players} teams={teams} />
      {error && (
        <div className="olb-alert olb-alert--error" style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => setError(null)}>
          {error} <span style={{ opacity: 0.6 }}>(dismiss)</span>
        </div>
      )}

      <DndContext id="olb-board" sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="olb-board">
          <TeamColumn
            team={null}
            players={playersByTeam.unassigned}
            coaches={coachesByTeam.unassigned ?? []}
            onTapPlayer={(p) => openSheet({ type: "player", id: p.id })}
            onTapCoach={(c) => openSheet({ type: "coach", id: c.id })}
          />
          {teams.map((t) => (
            <TeamColumn
              key={t.id}
              team={t}
              players={playersByTeam[t.id] ?? []}
              coaches={coachesByTeam[t.id] ?? []}
              onTapPlayer={(p) => openSheet({ type: "player", id: p.id })}
              onTapCoach={(c) => openSheet({ type: "coach", id: c.id })}
              onEditTeam={(tm) => setEditTeam(tm)}
            />
          ))}
        </div>

        <DragOverlay>
          {activePlayer ? <PlayerCardView player={activePlayer} overlay /> : null}
          {activeCoach ? <CoachChipView coach={activeCoach} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {sheet && sheetItem && (
        <MoveSheet
          title={sheet.type === "player" ? `${(sheetItem as OlbPlayer).full_name}` : `Coach ${(sheetItem as OlbCoach).name}`}
          currentTeamId={sheetItem.team_id ?? null}
          teams={teams}
          counts={counts}
          onPick={(toTeamId) => { const it = sheet; setSheet(null); commitMove(it, toTeamId); }}
          onClose={() => setSheet(null)}
          onEdit={sheet.type === "player" ? () => { const p = players.find((x) => x.id === sheet.id) ?? null; setSheet(null); setEditPlayer(p); } : undefined}
          onRemove={() => { if (sheet.type === "player") removePlayer(sheet.id); else removeCoach(sheet.id); }}
        />
      )}

      {editPlayer && (
        <EditPlayerModal
          player={editPlayer}
          onSave={(f) => savePlayer(editPlayer.id, f)}
          onRemove={() => removePlayer(editPlayer.id)}
          onClose={() => setEditPlayer(null)}
        />
      )}

      {editTeam && (
        <EditTeamModal
          team={editTeam}
          onSave={(f) => saveTeam(editTeam.id, f)}
          onClose={() => setEditTeam(null)}
        />
      )}
    </div>
  );
}
