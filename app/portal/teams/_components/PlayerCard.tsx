"use client";
import { useDraggable } from "@dnd-kit/core";
import type { OlbPlayer } from "../../../../lib/teams/types";
import { ageLabel } from "../../../../lib/teams/age";

// Presentational — also used inside the DragOverlay.
export function PlayerCardView({
  player,
  dragging,
  overlay,
}: {
  player: OlbPlayer;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const meta = [player.age_group, ageLabel(player.dob), player.grade].filter(Boolean).join(" · ");
  return (
    <div className={"olb-player" + (dragging ? " olb-dragging" : "") + (overlay ? " olb-overlay" : "")}>
      <div>
        <div className="olb-player__name">{player.full_name}</div>
        {meta && <div className="olb-player__meta">{meta}</div>}
      </div>
      <span className="olb-player__spacer" />
      {player.import_flag && (
        <span className="olb-player__flag" title="Check date of birth">⚠</span>
      )}
    </div>
  );
}

export default function PlayerCard({ player, onTap }: { player: OlbPlayer; onTap?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: { type: "player" },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onTap} style={{ touchAction: "manipulation" }}>
      <PlayerCardView player={player} dragging={isDragging} />
    </div>
  );
}
