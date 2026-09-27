"use client";
import { useDraggable } from "@dnd-kit/core";
import type { OlbCoach } from "../../../../lib/teams/types";

export function CoachChipView({
  coach,
  dragging,
  overlay,
}: {
  coach: OlbCoach;
  dragging?: boolean;
  overlay?: boolean;
}) {
  return (
    <span className={"olb-coach" + (dragging ? " olb-dragging" : "") + (overlay ? " olb-overlay" : "")}>
      {coach.name}
    </span>
  );
}

export default function CoachChip({ coach, onTap }: { coach: OlbCoach; onTap?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: coach.id,
    data: { type: "coach" },
  });
  return (
    <span ref={setNodeRef} {...listeners} {...attributes} onClick={onTap} style={{ touchAction: "manipulation" }}>
      <CoachChipView coach={coach} dragging={isDragging} />
    </span>
  );
}
