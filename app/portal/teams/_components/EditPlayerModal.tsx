"use client";
import { useState } from "react";
import type { OlbPlayer } from "../../../../lib/teams/types";

export default function EditPlayerModal({
  player,
  onSave,
  onRemove,
  onClose,
}: {
  player: OlbPlayer;
  onSave: (fields: { full_name: string; dob: string | null; grade: string | null; jersey_number: string | null }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(player.full_name);
  const [dob, setDob] = useState(player.dob ?? "");
  const [grade, setGrade] = useState(player.grade ?? "");
  const [number, setNumber] = useState(player.jersey_number ?? "");
  const [confirmDel, setConfirmDel] = useState(false);

  function save() {
    if (!fullName.trim()) return;
    onSave({
      full_name: fullName.trim(),
      dob: dob || null,
      grade: grade.trim() || null,
      jersey_number: number.trim() || null,
    });
  }

  return (
    <div className="olb-modal-backdrop" onClick={onClose}>
      <div className="olb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit player">
        <div className="olb-modal__title">Edit player</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="olb-field">
            <span className="olb-label">Full name</span>
            <input className="olb-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </label>
          <div className="olb-grid-2">
            <label className="olb-field">
              <span className="olb-label">Date of birth</span>
              <input type="date" className="olb-input" value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
            <label className="olb-field">
              <span className="olb-label">Grade</span>
              <input className="olb-input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 7th / Sr." />
            </label>
          </div>
          <label className="olb-field">
            <span className="olb-label">Jersey number</span>
            <input className="olb-input" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" maxLength={3} placeholder="e.g. 23" />
          </label>
        </div>

        <div className="olb-modal__actions">
          {confirmDel ? (
            <>
              <span className="olb-sub" style={{ marginRight: "auto", color: "var(--olb-red-deep)", fontSize: 13 }}>Remove this player?</span>
              <button className="olb-btn olb-btn--ghost olb-btn--sm" onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="olb-btn olb-btn--danger olb-btn--sm" onClick={onRemove}>Remove</button>
            </>
          ) : (
            <>
              <button className="olb-btn olb-btn--ghost olb-btn--sm" style={{ marginRight: "auto" }} onClick={() => setConfirmDel(true)}>Remove</button>
              <button className="olb-btn olb-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="olb-btn olb-btn--gold" disabled={!fullName.trim()} onClick={save}>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
