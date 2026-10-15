"use client";
// Settings → Import.
// - Hotel rooming list: Travel + board (always).
// - HS planning spreadsheet: preview accounts only (lib/auth/feature-preview.ts).
import { useState } from "react";
import { Icons } from "../../components/icons";
import { Pill } from "../../components/ui";
import { PlanningImportSheet } from "../../components/PlanningImportSheet";
import { HotelRoomingImport } from "./HotelRoomingImport";

export function ImportTab({ showPlanningImport = false }: { showPlanningImport?: boolean }) {
  const [importing, setImporting] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }} data-tour="settings-import">
      <HotelRoomingImport />

      {showPlanningImport && (
        <div className="rsd-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>HS planning spreadsheet</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
            Reads its Contacts tab into External Contacts and its &quot;HS Schedule&quot; tabs into the HS Schedule. You
            see everything it found before anything is saved.
          </div>
          <div>
            <Pill variant="ghost" size="sm" onClick={() => setImporting(true)}>
              <Icons.Download width={13} height={13} style={{ transform: "rotate(180deg)" }} /> Import spreadsheet
            </Pill>
          </div>
        </div>
      )}
      {importing && <PlanningImportSheet schedules onClose={() => setImporting(false)} />}
    </div>
  );
}
