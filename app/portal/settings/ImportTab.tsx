"use client";
// Settings → Import. The HS planning spreadsheet import, parked here for the
// preview accounts (lib/auth/feature-preview.ts) now that the imports are
// done; External Contacts and the HS Schedule no longer offer it.
import { useState } from "react";
import { Icons } from "../../components/icons";
import { Pill } from "../../components/ui";
import { PlanningImportSheet } from "../../components/PlanningImportSheet";

export function ImportTab() {
  const [importing, setImporting] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
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
      {importing && <PlanningImportSheet schedules onClose={() => setImporting(false)} />}
    </div>
  );
}
