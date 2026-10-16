"use client";
import { useState } from "react";
import { familyId, type FamilyGroup, type MailTarget } from "../../../../lib/teams/family-mail";
import { muted } from "./PlayerParts";

const checkLabel: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--rsd-accent)",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
};

// Which families are ticked in Email families / Slack families. All on to
// start; a change to who is in view or Dads/Moms/Players starts over.
export function useFamilySelection(groups: FamilyGroup<MailTarget>[], resetKey: string) {
  const [key, setKey] = useState(resetKey);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  let current = picked;
  if (key !== resetKey) {
    setKey(resetKey);
    setPicked(null);
    current = null;
  }
  const ids = groups.map((g) => familyId(g.players));
  const selected = current ?? new Set(ids);
  const selectedGroups = groups.filter((g) => selected.has(familyId(g.players)));
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }
  return {
    selected,
    count: selectedGroups.length,
    selectedGroups,
    toggle,
    selectAll: () => setPicked(new Set(ids)),
    selectNone: () => setPicked(new Set()),
  };
}

// Each family as a row with a checkbox, plus Select all / none. The count
// is how many are ticked (the send uses that, not everyone in view).
export function FamilyList({
  groups,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  groups: FamilyGroup<MailTarget>[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const n = groups.reduce((c, g) => c + (selected.has(familyId(g.players)) ? 1 : 0), 0);
  const all = n === groups.length;
  const none = n === 0;
  const rows = groups.map((g) => {
    const id = familyId(g.players);
    return (
      <label key={id} style={checkLabel}>
        <input type="checkbox" checked={selected.has(id)} onChange={() => onToggle(id)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, color: "var(--gw-fg)", fontWeight: 500, overflowWrap: "anywhere" }}>
          <strong>{g.players.map((t) => t.first_name).join(" & ")}</strong>
          {" · "}
          {g.emails.join(", ")}
        </span>
      </label>
    );
  });
  const toggle = (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline", ...muted, fontWeight: 600 }}>
      <button type="button" onClick={onSelectAll} disabled={all} style={{ ...linkButton, ...(all ? { opacity: 0.45, cursor: "default", textDecoration: "none" } : null) }}>
        Select all
      </button>
      {" / "}
      <button type="button" onClick={onSelectNone} disabled={none} style={{ ...linkButton, ...(none ? { opacity: 0.45, cursor: "default", textDecoration: "none" } : null) }}>
        none
      </button>
    </span>
  );
  const count = `${n} ${n === 1 ? "family" : "families"}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
      {groups.length > 6 ? (
        <details>
          <summary style={{ ...muted, fontWeight: 600, cursor: "pointer" }}>{count} · see who gets it</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {toggle}
            {rows}
          </div>
        </details>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline" }}>
            <span style={{ ...muted, fontWeight: 600 }}>{count}</span>
            {toggle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>{rows}</div>
        </>
      )}
    </div>
  );
}
