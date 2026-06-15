"use client";
// A rich sub-task row in the Sub-tasks card: done toggle, title (click to open,
// or rename inline), the source-recording "play from this moment" button (for
// sub-tasks made from a ReelNote), priority/schedule chips, assignee (reassign
// for staff), and a "Send to Things" handoff. Mirrors the ReelNotes action-item
// controls so a converted item keeps the same affordances.
import { useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { changeTicketStatus, renameTask } from "../../../../lib/maintenance/actions";
import { AssignSelect } from "./Actions";
import { TaskScheduleChips } from "../QueueRow";
import { memberDisplayName } from "../../../../lib/members/display";

interface StaffMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string;
}

export interface SubtaskRowData {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  start_on: string | null;
  due_on: string | null;
  priority: { label: string; chip_class: string } | null;
  assignee: { id: string; full_name: string | null; nickname: string | null; email: string } | null;
}

const iconBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 100,
  background: "var(--gw-bg-elev)",
  border: "1px solid var(--gw-border)",
  color: "var(--gw-fg-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

// Accent "▶ m:ss" pill, matching the recorded-note action item's play affordance.
const playPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 9px",
  borderRadius: 100,
  background: "transparent",
  color: "var(--rsd-accent)",
  border: "1px solid var(--rsd-accent)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SubtaskRow({
  subtask,
  today,
  canManage,
  canEdit,
  staffList,
  thingsEnabled,
  recordingLink,
}: {
  subtask: SubtaskRowData;
  today: string;
  // staff: toggle done + reassign (those actions are staff-only).
  canManage: boolean;
  // staff or the parent's owner: rename.
  canEdit: boolean;
  staffList: StaffMember[];
  thingsEnabled: boolean;
  recordingLink: { audioUrl: string | null; transcriptMs: number | null } | null;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const title = subtask.description.split("\n")[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [showPlayer, setShowPlayer] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = subtask.status === "done" || subtask.status === "cancelled";
  const ms = recordingLink?.transcriptMs ?? null;

  function toggleDone() {
    if (!canManage) return;
    startTransition(async () => {
      const r = await changeTicketStatus(subtask.id, done ? "open" : "done");
      if (r.error) {
        window.alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  function saveRename() {
    const t = draft.trim();
    if (!t || t === title) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await renameTask(subtask.id, t);
      if (r.error) {
        window.alert(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function play() {
    setShowPlayer(true);
    const el = audioRef.current;
    if (!el) return;
    if (ms != null) el.currentTime = ms / 1000;
    void el.play().catch(() => {});
  }

  function sendToThings() {
    const url =
      "things:///add?title=" +
      encodeURIComponent(title) +
      "&notes=" +
      encodeURIComponent(`${location.origin}/portal/tasks/${subtask.id}`);
    window.location.href = url;
  }

  return (
    <div style={{ borderBottom: "1px solid var(--gw-border)" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0" }}>
      <button
        type="button"
        onClick={toggleDone}
        disabled={!canManage || pending}
        aria-label={done ? "Mark not done" : "Mark done"}
        style={{ flexShrink: 0, marginTop: 1, background: "none", border: "none", padding: 0, cursor: canManage ? "pointer" : "default", display: "inline-flex" }}
      >
        {done ? (
          <Icons.CheckCircle width={18} height={18} style={{ color: "var(--rsd-accent)" }} />
        ) : (
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: `2px solid ${subtask.status === "in_progress" ? "var(--rsd-accent)" : "var(--gw-border)"}`,
            }}
          />
        )}
      </button>

      {/* Title on its own line; chips + controls wrap below so the title never
          gets crushed in the narrow card. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveRename();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            disabled={pending}
            style={{ width: "100%", fontSize: 13.5, fontWeight: 600, padding: "4px 8px", border: "1px solid var(--gw-border)", borderRadius: 6, color: "var(--gw-fg)", background: "var(--gw-bg)" }}
          />
        ) : (
          <a
            href={`/portal/tasks/${subtask.id}`}
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--gw-fg)",
              textDecoration: done ? "line-through" : "none",
              opacity: done ? 0.55 : 1,
            }}
          >
            {title}
          </a>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {subtask.priority && (
            <span className={`rsd-chip ${subtask.priority.chip_class}`} style={{ fontSize: 10 }}>{subtask.priority.label}</span>
          )}
          <TaskScheduleChips startOn={subtask.start_on} dueOn={subtask.due_on} someday={false} status={subtask.status} today={today} />
          {!canManage && subtask.assignee && (
            <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>{memberDisplayName(subtask.assignee)}</span>
          )}
          {/* Controls live in the same wrap row as the chips. */}
          {recordingLink?.audioUrl && (
            <button type="button" onClick={play} className="gw-press" aria-label="Play from the recording" style={playPill}>
              <Icons.Play width={11} height={11} />
              {ms != null && formatMs(ms)}
            </button>
          )}
          {canEdit && !editing && (
            <button type="button" onClick={() => { setDraft(title); setEditing(true); }} className="gw-press" aria-label="Rename" style={iconBtn}>
              <Icons.Pencil width={13} height={13} />
            </button>
          )}
          {canManage && <AssignSelect ticketId={subtask.id} current={subtask.assignee?.id ?? null} staff={staffList} />}
          {thingsEnabled && (
            <button
              type="button"
              onClick={sendToThings}
              className="gw-press"
              aria-label="Send to Things"
              title="Send to your Things app"
              style={{ ...iconBtn, width: "auto", padding: "0 10px", gap: 4, fontSize: 11, fontWeight: 700 }}
            >
              <Icons.CheckCircle width={12} height={12} /> Things
            </button>
          )}
        </div>
      </div>
    </div>
    {/* The player pops up here when Play is pressed. */}
    {recordingLink?.audioUrl && (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={recordingLink.audioUrl}
        style={{ width: "100%", height: 34, marginBottom: 10, display: showPlayer ? "block" : "none" }}
      />
    )}
    </div>
  );
}
