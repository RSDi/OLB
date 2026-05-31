"use client";
import { useState, useTransition } from "react";
import { Icons } from "../../../components/icons";
import { restoreTicket, hardDeleteTicket } from "../../../../lib/maintenance/actions";

export function DeletedActions({
  ticketId,
  description,
}: {
  ticketId: string;
  description: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreTicket(ticketId);
      if (result.error) setError(result.error);
    });
  }

  function handleHardDelete() {
    if (!confirm(`Permanently delete this request? "${description}" — this cannot be undone.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await hardDeleteTicket(ticketId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleRestore}
          disabled={pending}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 12,
            fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <Icons.Undo width={12} height={12} /> Restore
        </button>
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={pending}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--gw-error-bg)",
            color: "var(--gw-error)",
            border: "1px solid rgba(229,62,62,.25)",
            fontSize: 12,
            fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <Icons.AlertTriangle width={12} height={12} /> Delete forever
        </button>
      </div>
      {error && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--gw-error)", fontWeight: 600 }}>
          <Icons.AlertCircle width={10} height={10} />
          {error}
        </span>
      )}
    </div>
  );
}
