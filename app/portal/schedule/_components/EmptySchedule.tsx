"use client";
// No seasons on the HS Schedule yet: the board starts this one by hand (the
// New season sheet, set to this season); everyone else is told who to ask.

import { useState } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { seasonLabel } from "../../../../lib/planning/season";
import { NewSeasonSheet } from "./NewSeasonSheet";

export function EmptySchedule({ isStaff, current }: { isStaff: boolean; current: number }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="rsd-card" style={{ textAlign: "center", padding: "44px 24px", gap: 10, alignItems: "center" }}>
        <Icons.Ball width={28} height={28} style={{ color: "var(--gw-fg-faint)" }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>No seasons yet</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", maxWidth: 520, lineHeight: 1.6 }}>
          {isStaff
            ? `Start ${seasonLabel(current)}, then add its weekends.`
            : `The board hasn't added a season yet. Ask the board to start ${seasonLabel(current)}.`}
        </div>
        {isStaff && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <Pill variant="accent" size="md" onClick={() => setCreating(true)}>
              <Icons.Plus width={14} height={14} /> Start {seasonLabel(current)}
            </Pill>
          </div>
        )}
      </div>
      {creating && <NewSeasonSheet seasons={[]} current={current} onClose={() => setCreating(false)} />}
    </>
  );
}
