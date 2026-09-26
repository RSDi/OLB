"use client";
import { useState } from "react";
import type { OlbTeam } from "../../../../lib/teams/types";

const COLORS = ["GREY", "BLACK", "RED", "BLUE", "WHITE", "GOLD"];

type TeamFields = {
  name: string;
  color: string | null;
  grade_label: string | null;
  division: string | null;
  target_size: number | null;
  min_size: number | null;
  max_size: number | null;
};

export default function EditTeamModal({
  team,
  onSave,
  onClose,
}: {
  team: OlbTeam;
  onSave: (fields: TeamFields) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color ?? "");
  const [grade, setGrade] = useState(team.grade_label ?? "");
  const [division, setDivision] = useState(team.division ?? "");
  const [target, setTarget] = useState(team.target_size?.toString() ?? "");
  const [min, setMin] = useState(team.min_size?.toString() ?? "");
  const [max, setMax] = useState(team.max_size?.toString() ?? "");

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  function save() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      color: color || null,
      grade_label: grade.trim() || null,
      division: division.trim() || null,
      target_size: num(target),
      min_size: num(min),
      max_size: num(max),
    });
  }

  return (
    <div className="olb-modal-backdrop" onClick={onClose}>
      <div className="olb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit team">
        <div className="olb-modal__title">Edit team</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="olb-field">
            <span className="olb-label">Team name</span>
            <input className="olb-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="olb-grid-2">
            <label className="olb-field">
              <span className="olb-label">Color</span>
              <select className="olb-select" value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">None</option>
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="olb-field">
              <span className="olb-label">Grade</span>
              <input className="olb-input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 4th" />
            </label>
          </div>
          <label className="olb-field">
            <span className="olb-label">Division</span>
            <input className="olb-input" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g. Mid Bronze" />
          </label>
          <div>
            <span className="olb-label">Roster target (optional)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input className="olb-input" type="number" min={0} placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} />
              <input className="olb-input" type="number" min={0} placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} />
              <input className="olb-input" type="number" min={0} placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="olb-modal__actions">
          <button className="olb-btn olb-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="olb-btn olb-btn--gold" disabled={!name.trim()} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
