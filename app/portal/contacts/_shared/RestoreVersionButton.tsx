"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../../components/ui";
import { restoreContactVersion } from "../../../../lib/contacts/actions";

// Puts a contact back to how this version had it. It's saved as a new
// change, so it can be undone from History the same way.
export function RestoreVersionButton({ versionId, contactId, when }: { versionId: string; contactId: string; when: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function restore() {
    if (!confirm(`Put this contact back to how it was on ${when}? It's saved as a new change, so you can undo it from History.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await restoreContactVersion(versionId);
      if (res.error) setError(res.error);
      else {
        router.push(`/portal/contacts/${contactId}`);
        router.refresh();
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Pill size="sm" variant="ghost" onClick={restore} disabled={pending}>
        {pending ? "Restoring…" : "Restore this version"}
      </Pill>
      {error && <span style={{ fontSize: 12, color: "var(--gw-error)" }}>{error}</span>}
    </span>
  );
}
