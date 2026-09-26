"use client";
import type { OlbTeam } from "../../../../lib/teams/types";

// Mobile-first action sheet. Tap a player/coach → edit/remove, or pick a destination team.
export default function MoveSheet({
  title,
  currentTeamId,
  teams,
  counts,
  onPick,
  onClose,
  onEdit,
  onRemove,
}: {
  title: string;
  currentTeamId: string | null;
  teams: OlbTeam[];
  counts: Record<string, number>;
  onPick: (teamId: string | null) => void;
  onClose: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="olb-sheet-backdrop" onClick={onClose}>
      <div className="olb-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="olb-sheet__grab" />
        <div className="olb-sheet__title">{title}</div>

        {(onEdit || onRemove) && (
          <div className="olb-sheet__actions">
            {onEdit && <button className="olb-btn olb-btn--ghost olb-btn--sm" onClick={onEdit}>✎ Edit details</button>}
            {onRemove && <button className="olb-btn olb-btn--ghost olb-btn--sm" onClick={onRemove}>Remove</button>}
          </div>
        )}

        <div className="olb-sheet__label">Move to</div>
        <button className="olb-sheet__opt" data-current={currentTeamId === null} onClick={() => onPick(null)}>
          Unassigned
          <span className="olb-sheet__optcount">{counts.unassigned ?? 0}</span>
        </button>

        {teams.map((t) => (
          <button
            key={t.id}
            className="olb-sheet__opt"
            data-current={currentTeamId === t.id}
            onClick={() => onPick(t.id)}
          >
            {t.name}
            <span className="olb-sheet__optcount">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
