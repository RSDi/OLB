"use client";
// Check-off for one player on one hotel stay: Booked in block, Staying
// elsewhere, or Not yet known. Siblings on the stay can be marked together.

import { useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { clearHotelStayPlayer, markHotelStayPlayer } from "../../../lib/hs-hotel-stays/actions";
import {
  cleanStayPlayerMark,
  STAY_ELSEWHERE_NOTE_REQUIRED,
  stayDoneWord,
  stayMissingWord,
  stayWaivedWord,
  type StaySiblingPlayer,
} from "../../../lib/hs-hotel-stays/logic";
import type { HotelStayPlayer, HotelStayPlayerStatus, HotelStayView } from "../../../lib/hs-hotel-stays/types";

type Choice = HotelStayPlayerStatus | "missing";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const capStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
};

export function HotelStayDialog({
  player,
  stay,
  row,
  siblings,
  onClose,
}: {
  player: { id: string; full_name: string };
  stay: HotelStayView;
  row: HotelStayPlayer | null;
  siblings: StaySiblingPlayer[];
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Choice>(row?.status ?? "done");
  const [completedOn, setCompletedOn] = useState(row?.completed_on ?? today());
  const [note, setNote] = useState(row?.note ?? "");
  const [alsoIds, setAlsoIds] = useState<Set<string>>(() => new Set(siblings.map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = stayDoneWord();
  const waived = stayWaivedWord();
  const missing = stayMissingWord();

  function toggleSibling(id: string) {
    setAlsoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    if (choice === "missing") {
      let extra: string[] = [];
      if (siblings.length > 0) {
        const names = siblings.map((s) => s.full_name).join(", ");
        if (confirm(`Also set ${names} to ${missing}?`)) extra = siblings.map((s) => s.id);
      }
      const result = await clearHotelStayPlayer(player.id, stay.id, extra);
      setBusy(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      return;
    }
    const cleaned = cleanStayPlayerMark({ status: choice, completedOn, note });
    if ("error" in cleaned) {
      setBusy(false);
      setError(cleaned.error);
      return;
    }
    const result = await markHotelStayPlayer({
      playerId: player.id,
      stayId: stay.id,
      status: choice,
      completedOn,
      note,
      alsoPlayerIds: siblings.filter((s) => alsoIds.has(s.id)).map((s) => s.id),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  const choices: { key: Choice; label: string }[] = [
    { key: "done", label: done },
    { key: "waived", label: waived },
    { key: "missing", label: missing },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tour="hotel-stay-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="rsd-card"
        style={{
          width: "min(440px, 100%)",
          maxHeight: "min(90vh, 720px)",
          overflow: "auto",
          gap: 14,
          padding: "18px 20px",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={capStyle}>Hotel stay</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{stay.name}</div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
              {player.full_name} · {stay.hotel_name}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            style={{ border: "none", background: "transparent", color: "var(--gw-fg-muted)", cursor: "pointer", padding: 4 }}
          >
            <Icons.X width={18} height={18} />
          </button>
        </div>

        {(stay.booking_instructions || stay.booking_url || stay.booking_code) && (
          <div style={{ fontSize: 12.5, lineHeight: 1.45, padding: "10px 12px", borderRadius: 8, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
            {stay.booking_code && (
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Code: {stay.booking_code}</div>
            )}
            {stay.booking_url && (
              <a href={stay.booking_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--gw-accent)", display: "inline-block", marginBottom: 4 }}>
                Booking link ↗
              </a>
            )}
            {stay.booking_instructions && <div style={{ whiteSpace: "pre-wrap" }}>{stay.booking_instructions}</div>}
          </div>
        )}

        <div data-tour="hotel-stay-choice" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {choices.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChoice(c.key)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: choice === c.key ? "1px solid var(--gw-accent)" : "1px solid var(--gw-border)",
                background: choice === c.key ? "var(--gw-accent-soft, var(--gw-bg-elev))" : "var(--gw-bg-elev)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                color: "var(--gw-fg)",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {choice !== "missing" && (
          <>
            <Input
              label={choice === "waived" ? `${waived} on` : `${done} on`}
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
            />
            <div data-tour="hotel-stay-note">
              <Textarea
                label={choice === "waived" ? "Note *" : "Note"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={choice === "waived" ? "e.g. staying with family" : "Confirmation number…"}
                error={error === STAY_ELSEWHERE_NOTE_REQUIRED ? error : undefined}
                help={choice === "waived" ? "Required — where they're staying if not in the hotel block." : undefined}
              />
            </div>
          </>
        )}

        {choice !== "missing" && siblings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-tour="hotel-stay-siblings">
            <span style={{ fontSize: 12, fontWeight: 700 }}>Also mark siblings</span>
            {siblings.map((s) => (
              <label key={s.id} style={checkLabel}>
                <input type="checkbox" checked={alsoIds.has(s.id)} onChange={() => toggleSibling(s.id)} />
                {s.full_name}
              </label>
            ))}
          </div>
        )}

        {error && error !== STAY_ELSEWHERE_NOTE_REQUIRED && (
          <div style={{ fontSize: 12, color: "var(--rsd-danger)" }}>{error}</div>
        )}
        {row && (
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
            Last marked {row.status === "waived" ? waived.toLowerCase() : done.toLowerCase()}
            {row.completed_on ? ` on ${formatDay(row.completed_on)}` : ""}
            {row.marked_by_name ? ` by ${row.marked_by_name}` : ""}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Pill variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill variant="accent" size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Pill>
        </div>
      </div>
    </div>
  );
}
