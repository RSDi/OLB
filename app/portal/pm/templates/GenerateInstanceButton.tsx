"use client";
import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createNextInstance } from "../../../../lib/pm/actions";

export function GenerateInstanceButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await createNextInstance({ templateId });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.instanceId) {
        router.push(`/portal/pm/${result.instanceId}`);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          padding: "6px 14px",
          borderRadius: 8,
          background: "var(--rsd-accent-bg)",
          color: "var(--rsd-accent)",
          border: "1px solid var(--rsd-accent-line)",
          fontSize: 12,
          fontWeight: 700,
          cursor: pending ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <Icons.Plus width={12} height={12} />
        {pending ? "Creating…" : "Generate instance"}
      </button>
      {error && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={10} height={10} /> {error}
        </span>
      )}
    </div>
  );
}
