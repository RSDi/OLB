"use client";
// No seasons on the HS Schedule yet: import them from the planning
// spreadsheet, or start one by hand. The board only.

import { useState } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { PlanningImportSheet } from "../../../components/PlanningImportSheet";
import { seasonLabel } from "../../../../lib/planning/season";
import { NewSeasonSheet } from "./NewSeasonSheet";

export function EmptySchedule({ isStaff, current }: { isStaff: boolean; current: number }) {
  const [sheet, setSheet] = useState<"import" | "new" | null>(null);
  return (
    <>
      <div className="rsd-card" style={{ textAlign: "center", padding: "44px 24px", gap: 10, alignItems: "center" }}>
        <Icons.Calendar width={28} height={28} style={{ color: "var(--gw-fg-faint)" }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>No seasons on the HS Schedule yet</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", maxWidth: 520, lineHeight: 1.6 }}>
          {isStaff
            ? `Import the planning spreadsheet to bring in every "HS Schedule" tab (and its contacts), or start ${seasonLabel(current)} by hand.`
            : "The board hasn't added a season yet."}
        </div>
        {isStaff && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <span data-tour="schedule-import" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="md" onClick={() => setSheet("import")}>
                <Icons.Download width={14} height={14} style={{ transform: "rotate(180deg)" }} /> Import spreadsheet
              </Pill>
            </span>
            <Pill variant="ghost" size="md" onClick={() => setSheet("new")}>
              <Icons.Plus width={14} height={14} /> New season
            </Pill>
          </div>
        )}
      </div>
      {sheet === "import" && <PlanningImportSheet schedules onClose={() => setSheet(null)} />}
      {sheet === "new" && <NewSeasonSheet seasons={[]} onClose={() => setSheet(null)} />}
    </>
  );
}
