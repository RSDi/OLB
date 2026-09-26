"use client";
// Kanban board for the Tasks queue: columns by status, cards are tasks. Staff
// drag a card between columns to change its status (optimistic + rollback on
// error); anyone can click a card to open it. Cards carry the same chips as the
// list rows. Someday/Cancelled tasks are kept off the board (they live in the
// List view). Native HTML5 drag — desktop pointer only; on touch the columns
// scroll horizontally and tapping a card opens it.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changeTicketStatus, type TicketStatus } from "../../../lib/maintenance/actions";
import { TaskScheduleChips } from "./QueueRow";

export interface KanbanCard {
  id: string;
  title: string;
  status: TicketStatus;
  category: { name: string; chip_class: string } | null;
  priority: { label: string; chip_class: string } | null;
  assigneeName: string | null;
  start_on: string | null;
  due_on: string | null;
  someday: boolean;
  progress: { done: number; total: number } | null;
}

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

export function KanbanBoard({
  cards,
  today,
  canMove,
}: {
  cards: KanbanCard[];
  today: string;
  canMove: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<KanbanCard[]>(cards);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TicketStatus | null>(null);
  const draggingRef = useRef(false);

  async function moveTo(id: string, status: TicketStatus) {
    const card = items.find((c) => c.id === id);
    if (!card || card.status === status) return;
    const prev = items;
    setItems(items.map((c) => (c.id === id ? { ...c, status } : c)));
    const r = await changeTicketStatus(id, status);
    if (r.error) {
      setItems(prev);
      window.alert(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))`,
        gap: 12,
        alignItems: "start",
        overflowX: "auto",
      }}
    >
      {COLUMNS.map((col) => {
        const colCards = items.filter((c) => c.status === col.status);
        const isOver = overCol === col.status;
        return (
          <div
            key={col.status}
            onDragOver={canMove ? (e) => { e.preventDefault(); setOverCol(col.status); } : undefined}
            onDragLeave={canMove ? () => setOverCol((s) => (s === col.status ? null : s)) : undefined}
            onDrop={
              canMove
                ? (e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    setOverCol(null);
                    setDragId(null);
                    if (id) void moveTo(id, col.status);
                  }
                : undefined
            }
            style={{
              // Columns are page-colored lanes so the cards inside stand off them.
              background: isOver ? "var(--rsd-accent-bg)" : "var(--gw-bg)",
              border: `1px solid ${isOver ? "var(--rsd-accent)" : "var(--gw-border)"}`,
              borderRadius: 12,
              padding: 10,
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              transition: "background 120ms, border-color 120ms",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px" }}>
              <span style={{ fontFamily: "var(--rsd-display)", fontSize: "calc(12px * var(--rsd-display-scale))", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--gw-fg-muted)" }}>
                {col.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{colCards.length}</span>
            </div>

            {colCards.map((c) => (
              <div
                key={c.id}
                draggable={canMove}
                onDragStart={
                  canMove
                    ? (e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                        draggingRef.current = true;
                        setDragId(c.id);
                      }
                    : undefined
                }
                onDragEnd={canMove ? () => { draggingRef.current = false; setDragId(null); setOverCol(null); } : undefined}
                onClick={() => {
                  if (draggingRef.current) return;
                  router.push(`/portal/tasks/${c.id}`);
                }}
                className="rsd-card gw-press"
                title={canMove ? "Click to open · drag to change status" : "Click to open"}
                style={{
                  gap: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  opacity: dragId === c.id ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: "var(--gw-fg)" }}>
                  {c.category && (
                    <span
                      className={`rsd-chip rsd-chip-dot ${c.category.chip_class}`}
                      title={c.category.name}
                      style={{ display: "inline-block", width: 9, height: 9, padding: 0, borderRadius: "50%", marginRight: 7, verticalAlign: "middle", flexShrink: 0 }}
                    />
                  )}
                  {c.title}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {c.priority && (
                    <span className={`rsd-chip ${c.priority.chip_class}`} style={{ fontSize: 10 }}>{c.priority.label}</span>
                  )}
                  {c.progress && (
                    <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                      To-dos · {c.progress.done}/{c.progress.total}
                    </span>
                  )}
                  <TaskScheduleChips
                    startOn={c.start_on}
                    dueOn={c.due_on}
                    someday={c.someday}
                    status={c.status}
                    today={today}
                  />
                </div>
                {c.assigneeName && (
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{c.assigneeName}</div>
                )}
              </div>
            ))}

            {colCards.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--gw-fg-faint)", padding: "10px 4px", textAlign: "center" }}>
                Nothing here
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
