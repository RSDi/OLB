"use client";
// A weekend's details to read, for those who see the HS Schedule without
// changing it (the travel coordinator): how it stands, when and where, the
// notes (the venue and game times) and details, where to stay and eat near
// it, each team of ours' games, and the teams coming, each with the teams of
// ours it plays when it's only some. WeekendSheet is the same weekend for
// the coaches and the board, to edit.

import type { CSSProperties } from "react";
import { Icons } from "../../../components/icons";
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
import type { PlacesNear } from "../../../../lib/hs-schedule/travel";
import type { HsContactRef, HsGames, HsLevel, HsOpponent, HsWeekend } from "../../../../lib/hs-schedule/types";
import { Dot } from "./CellPopover";
import { StatusChip } from "./status";
import { TravelPlaces } from "./TravelPopover";

export function WeekendDetails({
  weekend,
  levels,
  games,
  opponents,
  contacts,
  near,
  onClose,
}: {
  weekend: HsWeekend;
  levels: HsLevel[];
  games: HsGames[];
  opponents: HsOpponent[];
  contacts: Map<string, HsContactRef>;
  // The hotels and places to eat near it, on a weekend away.
  near: PlacesNear | null;
  onClose: () => void;
}) {
  const playing = teamsPlaying(weekend.id, levels, games);
  const programs = weekendPrograms(weekend.id, opponents, levels, playing);
  const facility = weekend.facility_contact_id ? contacts.get(weekend.facility_contact_id) : undefined;
  const shownLevels = levels.filter((l) => !l.hidden || playing.has(l.id));
  const gamesOf = (l: HsLevel) => games.find((g) => g.weekend_id === weekend.id && g.level_id === l.id);
  const byStatus = (s: WeekendProgram["status"]) => programs.filter((p) => p.status === s);
  const coming = byStatus("confirmed");
  const fence = byStatus("tentative");
  const notComing = byStatus("declined");
  const meta = [formatWeekdays(weekend.starts_on, weekend.ends_on), weekend.location, weekend.trip].filter(Boolean).join(" · ");
  const nameOf = (p: WeekendProgram) => (p.contact_id && contacts.get(p.contact_id)?.name) || p.name;

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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
          <StatusChip status={weekend.status} small />
          <span>{meta}</span>
        </div>
        {weekend.notes && <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{weekend.notes}</div>}
        {facility && (
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, display: "flex", gap: 4, alignItems: "center" }}>
            <Icons.MapPin width={11} height={11} />
            {[facility.name, [facility.city, facility.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          </div>
        )}
        {weekend.details && (
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{weekend.details}</div>
        )}
      </div>

      {near && (near.hotels.length > 0 || near.food.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--gw-border)", paddingTop: 12 }}>
          <span style={cap}>Where to stay and eat near {near.city}</span>
          <TravelPlaces near={near} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={cap}>Games for each of our teams</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {shownLevels.map((l) => {
            const g = gamesOf(l);
            const n = g?.games ?? null;
            return (
              <span
                key={l.id}
                title={g?.note ?? undefined}
                style={{ display: "inline-flex", gap: 5, alignItems: "center", height: 32, padding: "0 9px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)", boxSizing: "border-box" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{l.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: g?.unsure ? "#8A6100" : "var(--gw-fg)" }}>
                  {n ?? (g?.unsure ? "?" : "–")}
                  {g?.unsure && n != null ? "?" : ""}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={cap}>Teams coming</span>
        {programs.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>None named yet.</div>
        ) : (
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
            {[
              `${coming.length} coming`,
              fence.length > 0 && `${fence.length} on the fence`,
              notComing.length > 0 && `${notComing.length} not coming`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        <Group title="Coming" rows={coming} contacts={contacts} />
        <Group title="On the fence" rows={fence} contacts={contacts} />
        {notComing.length > 0 && (
          <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 700 }}>Not coming:</strong> {notComing.map(nameOf).join(", ")}
          </div>
        )}
      </div>
    </SideSheet>
  );
}

function Group({ title, rows, contacts }: { title: string; rows: WeekendProgram[]; contacts: Map<string, HsContactRef> }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
        {title} {rows.length}
      </span>
      {rows.map((p) => {
        const c = p.contact_id ? contacts.get(p.contact_id) : undefined;
        const place = c ? [c.city, c.state].filter(Boolean).join(", ") : "";
        // Just some of our teams says which; all of them says nothing.
        const teams = p.all ? "" : teamsLabel(p);
        return (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <Dot tone={p.status} />
            <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{c?.name ?? p.name}</span>
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
