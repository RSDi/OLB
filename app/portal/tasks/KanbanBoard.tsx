"use client";
// Kanban board for the Tasks queue: columns by status, cards are tasks. Staff
// drag a card between columns to change its status (optimistic + rollback on
// error); anyone can click a card to open it. Cards carry the same chips as the
// list rows. Someday/Cancelled tasks are kept off the board (they live in the
// List view). Native HTML5 drag — desktop pointer only; on touch the columns
// scroll horizontally and tapping a card opens it. Touch phones can't drag, so
// on a touch or narrow screen each card also carries a "Move" chip (a native
// <select> of the lanes) that makes the same change as a drop.
import { useRef, useState, useSyncExternalStore } from "react";
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

const TOUCHY_QUERY = "(pointer: coarse), (max-width: 767px)";
function subscribeTouchy(onChange: () => void) {
  const mq = window.matchMedia(TOUCHY_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function readTouchy() {
  return window.matchMedia(TOUCHY_QUERY).matches;
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
  // Set on pointerdown when the press began on the Move control, so pressing
  // it never starts a card drag.
  const pressOnMoveRef = useRef(false);
  // Touch pointer or phone width: show the Move control (drag doesn't work on
  // touch). Desktop keeps drag only, so cards stay uncluttered.
  // Server render and first paint read false, so the control appears once
  // the page is live.
  const touchy = useSyncExternalStore(subscribeTouchy, readTouchy, () => false);

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
        // On a phone the lanes scroll sideways; settle on a lane's edge.
        scrollSnapType: "x proximity",
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
              scrollSnapAlign: "start",
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
                onPointerDown={
                  canMove
                    ? (e) => { pressOnMoveRef.current = !!(e.target as Element).closest("[data-card-move]"); }
                    : undefined
                }
                onDragStart={
                  canMove
                    ? (e) => {
                        if (pressOnMoveRef.current) {
                          e.preventDefault();
                          return;
                        }
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
                {(c.assigneeName || (canMove && touchy)) && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, minWidth: 0 }}>{c.assigneeName}</span>
                    {canMove && touchy && (
                      <MoveControl
                        title={c.title}
                        status={c.status}
                        onMove={(s) => void moveTo(c.id, s)}
                      />
                    )}
                  </div>
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

// The touch stand-in for dragging: a chip reading "Move" over an invisible
// native <select> of the lanes. The native picker opens as the phone's own
// sheet, so nothing gets clipped by the lane or board, and the select keeps a
// 16px font so iOS doesn't zoom in when it's tapped. Clicks stop here so a tap
// doesn't also open the task.
function MoveControl({
  title,
  status,
  onMove,
}: {
  title: string;
  status: TicketStatus;
  onMove: (status: TicketStatus) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <span
      data-card-move
      data-tour="tasks-card-move"
      onClick={(e) => e.stopPropagation()}
      style={{ position: "relative", display: "inline-flex", flexShrink: 0, marginLeft: "auto" }}
    >
      <span
        aria-hidden
        className="rsd-chip rsd-chip-mute"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minHeight: 36,
          padding: "0 12px",
          borderRadius: 100,
          fontSize: 11,
          fontWeight: 700,
          outline: focused ? "2px solid var(--rsd-accent)" : undefined,
          outlineOffset: 2,
        }}
      >
        Move
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
      <select
        aria-label={`Move "${title}" to another lane`}
        value={status}
        onChange={(e) => onMove(e.target.value as TicketStatus)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          fontSize: 16,
          cursor: "pointer",
          appearance: "none",
          border: 0,
          margin: 0,
        }}
      >
        {COLUMNS.map((col) => (
          <option key={col.status} value={col.status}>
            {col.status === status ? `${col.label} (here now)` : col.label}
          </option>
        ))}
      </select>
    </span>
  );
}
