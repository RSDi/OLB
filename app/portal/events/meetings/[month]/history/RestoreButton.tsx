"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../../../../components/ui";
import { restoreMeetingVersion } from "../../../../../../lib/planning/actions";
import type { MonthKey } from "../../../../../../lib/planning/season";

// Puts the meeting's date, status, agenda and minutes back to this version.
// It's saved as a new version, so it can be undone the same way.
export function RestoreButton({ month, versionId, label }: { month: MonthKey; versionId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function restore() {
    if (!confirm(`Put the date, status, agenda and minutes back to how they were ${label}? Task notes stay as they are, and you can undo this from History.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await restoreMeetingVersion(month, versionId);
      if ("error" in res) setError(res.error);
      else router.push(`/portal/events/meetings/${month}`);
    });
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <Pill size="sm" variant="ghost" onClick={restore} disabled={pending}>
        {pending ? "Restoring…" : "Restore this version"}
      </Pill>
      {error && <span style={{ fontSize: 12, color: "var(--gw-error)" }}>{error}</span>}
    </span>
  );
}
