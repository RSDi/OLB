"use client";
// A weekend's details to read, for those who see the HS Schedule without
// changing it (the travel coordinator): when and where, the trip, how it
// stands, the notes (the venue and game times) and details, each team of
// ours' games, and the teams coming, each with the teams of ours it plays.
// WeekendSheet is the same weekend for the coaches and the board, to edit.

import type { CSSProperties, ReactNode } from "react";
import { Pill } from "../../../components/ui";
import { SideSheet } from "../../../components/SideSheet";
import {
  formatWeekdays,
  formatWeekendDates,
  teamsLabel,
  teamsPlaying,
  weekendPrograms,
  type WeekendProgram,
} from "../../../../lib/hs-schedule/logic";
import type { HsContactRef, HsGames, HsLevel, HsOpponent, HsWeekend } from "../../../../lib/hs-schedule/types";
import { Dot } from "./CellPopover";
import { StatusChip } from "./status";

export function WeekendDetails({
  weekend,
  levels,
  games,
  opponents,
  contacts,
  onClose,
}: {
  weekend: HsWeekend;
  levels: HsLevel[];
  games: HsGames[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  onClose: () => void;
}) {
  const playing = teamsPlaying(weekend.id, levels, games);
  const programs = weekendPrograms(weekend.id, opponents, levels, playing);
  const facility = weekend.facility_contact_id ? contacts.get(weekend.facility_contact_id) : undefined;
  const shownLevels = levels.filter((l) => !l.hidden || playing.has(l.id));
  const gamesOf = (l: HsLevel) => games.find((g) => g.weekend_id === weekend.id && g.level_id === l.id);
  const byStatus = (s: WeekendProgram["status"]) => programs.filter((p) => p.status === s);

  return (
    <SideSheet
      eyebrow={formatWeekendDates(weekend.starts_on, weekend.ends_on)}
      title={weekend.event || "Weekend"}
      width={560}
      onClose={onClose}
      footer={
        <Pill variant="ghost" size="md" onClick={onClose}>
          Close
        </Pill>
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status={weekend.status} />
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          {formatWeekdays(weekend.starts_on, weekend.ends_on)}
        </span>
      </div>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(80px, auto) 1fr", gap: "8px 14px" }}>
        <Row label="Where">{weekend.location}</Row>
        <Row label="Trip">{weekend.trip}</Row>
        <Row label="Notes">{weekend.notes}</Row>
        <Row label="Facility">{facility ? [facility.name, [facility.city, facility.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : null}</Row>
        <Row label="Details">{weekend.details}</Row>
      </dl>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={cap}>Games for each of our teams</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {shownLevels.map((l) => {
            const g = gamesOf(l);
            const n = g?.games ?? null;
            return (
              <span
                key={l.id}
                title={g?.note ?? undefined}
                style={{ display: "inline-flex", gap: 6, alignItems: "baseline", padding: "5px 10px", borderRadius: 9, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)" }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{l.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: g?.unsure ? "#8A6100" : "var(--gw-fg)" }}>
                  {n ?? (g?.unsure ? "?" : "–")}
                  {g?.unsure && n != null ? "?" : ""}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={cap}>Teams ({programs.length})</span>
        {programs.length === 0 && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>None named yet.</div>}
        <Group title="Coming" rows={byStatus("confirmed")} contacts={contacts} />
        <Group title="On the fence" rows={byStatus("tentative")} contacts={contacts} />
        <Group title="Not coming" rows={byStatus("declined")} contacts={contacts} />
      </div>
    </SideSheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <>
      <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, fontWeight: 500, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{children}</dd>
    </>
  );
}

function Group({ title, rows, contacts }: { title: string; rows: WeekendProgram[]; contacts: Map<string, HsContactRef> }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
        {title} ({rows.length})
      </span>
      {rows.map((p) => {
        const c = p.contact_id ? contacts.get(p.contact_id) : undefined;
        const place = c ? [c.city, c.state].filter(Boolean).join(", ") : "";
        // Every team of ours it's down for, or just some.
        const teams = p.all ? "all our teams" : teamsLabel(p);
        return (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <Dot tone={p.status} />
            <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: p.status === "declined" ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                  textDecoration: p.status === "declined" ? "line-through" : "none",
                }}
              >
                {c?.name ?? p.name}
              </span>
              {place && <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{place}</span>}
              {teams && <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 700 }}>({teams})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const cap: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};
