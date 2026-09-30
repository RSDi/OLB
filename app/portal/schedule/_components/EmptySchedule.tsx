"use client";
// No seasons on the HS Schedule yet: the board starts one by hand.

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
        <Icons.Calendar width={28} height={28} style={{ color: "var(--gw-fg-faint)" }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>No seasons on the HS Schedule yet</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", maxWidth: 520, lineHeight: 1.6 }}>
          {isStaff ? `Start ${seasonLabel(current)} to add its weekends.` : "The board hasn't added a season yet."}
        </div>
        {isStaff && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <Pill variant="accent" size="md" onClick={() => setCreating(true)}>
              <Icons.Plus width={14} height={14} /> New season
            </Pill>
          </div>
        )}
      </div>
      {creating && <NewSeasonSheet seasons={[]} onClose={() => setCreating(false)} />}
    </>
  );
}
