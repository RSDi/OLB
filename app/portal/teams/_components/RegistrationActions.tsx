"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveRegistration, rejectRegistration } from "../../../../lib/teams/registration-actions";

export default function RegistrationActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [err, setErr] = useState(false);

  async function run(kind: "approve" | "reject") {
    setBusy(kind);
    setErr(false);
    try {
      if (kind === "approve") await approveRegistration(id);
      else await rejectRegistration(id);
      router.refresh();
    } catch {
      setBusy(null);
      setErr(true);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
      {err && <span style={{ color: "var(--olb-red)", fontSize: 12 }}>Failed</span>}
      <button className="olb-btn olb-btn--gold olb-btn--sm" disabled={!!busy} onClick={() => run("approve")}>
        {busy === "approve" ? "…" : "Approve"}
      </button>
      <button className="olb-btn olb-btn--ghost olb-btn--sm" disabled={!!busy} onClick={() => run("reject")}>
        {busy === "reject" ? "…" : "Reject"}
      </button>
    </div>
  );
}
