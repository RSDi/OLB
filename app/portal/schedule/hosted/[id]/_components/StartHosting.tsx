"use client";
// A weekend that isn't ticked "We host this tournament" (or was unticked):
// what the planning page is for, and Start planning.

import Link from "next/link";
import { Pill } from "../../../../../components/ui";
import { setHosted } from "../../../../../../lib/hosted/actions";
import { formatWeekendDates } from "../../../../../../lib/hs-schedule/logic";
import type { HostedPageData } from "../../../../../../lib/hosted/types";
import { Said, sub, useAct } from "./parts";

export function StartHosting({ weekend }: { weekend: HostedPageData["weekend"] }) {
  const { busy, error, act } = useAct();
  return (
    <div className="rsd-card" style={{ padding: "32px 24px", gap: 12, alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{formatWeekendDates(weekend.starts_on, weekend.ends_on)}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{weekend.event || "This weekend"}</div>
      <p style={{ ...sub, maxWidth: 480 }}>
        When we host the tournament, it gets a planning page: the facility checklist (walk-through, certificate of insurance,
        pricing, contract), the divisions and teams, the court schedule and brackets, the budget (tied to Finances) and an email to
        every program coming.
      </p>
      <Said error={error} notice={null} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pill variant="accent" onClick={() => act(() => setHosted(weekend.id, true))} disabled={busy}>
          {busy ? "Starting…" : "We host this tournament: start planning"}
        </Pill>
        <Link href="/portal/schedule" style={{ fontSize: 13, fontWeight: 700, alignSelf: "center" }}>
          Back to the HS Schedule
        </Link>
      </div>
    </div>
  );
}
