"use client";
import type { OlbPlayer, OlbTeam } from "../../../../lib/teams/types";

export default function RosterStats({ players, teams }: { players: OlbPlayer[]; teams: OlbTeam[] }) {
  const assigned = players.filter((p) => p.team_id).length;
  const unassigned = players.length - assigned;
  const flagged = players.filter((p) => p.import_flag).length;

  return (
    <div className="olb-statbar">
      <div className="olb-stat">
        <span className="olb-stat__num">{players.length}</span>
        <span className="olb-stat__lbl">Players</span>
      </div>
      <div className="olb-stat">
        <span className="olb-stat__num">{teams.length}</span>
        <span className="olb-stat__lbl">Teams</span>
      </div>
      <div className="olb-stat">
        <span className="olb-stat__num" style={unassigned ? { color: "var(--olb-gold-deep)" } : undefined}>{unassigned}</span>
        <span className="olb-stat__lbl">Unassigned</span>
      </div>
      {flagged > 0 && (
        <div className="olb-stat">
          <span className="olb-stat__num" style={{ color: "var(--olb-red)" }}>{flagged}</span>
          <span className="olb-stat__lbl">Flagged</span>
        </div>
      )}
    </div>
  );
}
