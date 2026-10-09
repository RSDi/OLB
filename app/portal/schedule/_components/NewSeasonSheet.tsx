"use client";
// Add a season: a copy of another (the same weekends a year on, the same
// events, places, teams of ours and games, the teams that came now on the
// fence) or an empty one. It opens on the season after the newest one, or
// on this season when there are none yet. The board only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Select } from "../../../components/ui";
import { SideSheet } from "../../../components/SideSheet";
import { SegButton, SegGroup } from "../../../components/FilterControls";
import { createSeason } from "../../../../lib/hs-schedule/actions";
import { seasonLabel } from "../../../../lib/planning/season";
import type { HsSeason } from "../../../../lib/hs-schedule/types";

export function NewSeasonSheet({
  seasons,
  current,
  onClose,
}: {
  seasons: HsSeason[];
  // This season, for a schedule with none yet.
  current?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const taken = new Set(seasons.map((s) => s.season));
  const newest = seasons.length ? Math.max(...seasons.map((s) => s.season)) : null;
  const latest = newest ?? current ?? new Date().getFullYear();
  // The next few seasons, and a few back for filling in history.
  const choices = Array.from({ length: 8 }, (_, i) => latest + 2 - i).filter((y) => !taken.has(y));
  const first = newest != null ? newest + 1 : latest;
  const [season, setSeason] = useState<number>(choices.includes(first) ? first : (choices[0] ?? latest + 1));
  // Newest first: the one to copy starts as the newest.
  const sorted = [...seasons].sort((a, b) => b.season - a.season);
  const [copy, setCopy] = useState(sorted.length > 0);
  const [from, setFrom] = useState<string>(sorted[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromSeason = copy ? sorted.find((s) => s.id === from) ?? null : null;
  const tag = (y: number) =>
    newest == null ? "" : y === newest + 1 ? " (next)" : y > newest ? " (later)" : " (past)";
  const onSchedule = sorted.map((s) => seasonLabel(s.season));
  const eyebrow = onSchedule.length
    ? `${onSchedule.slice(0, 3).join(" · ")}${onSchedule.length > 3 ? ` +${onSchedule.length - 3}` : ""} on the schedule`
    : "HS Schedule";

  async function add() {
    setBusy(true);
    setError(null);
    const res = await createSeason({ season, fromSeasonId: fromSeason?.id ?? null });
    setBusy(false);
    if (res.error) return setError(res.error);
    onClose();
    router.push(`/portal/schedule?season=${season}`);
    router.refresh();
  }

  return (
    <SideSheet
      eyebrow={eyebrow}
      title="New season"
      busy={busy}
      width={480}
      onClose={onClose}
      footer={
        <>
          <Pill variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Pill>
          <Pill variant="accent" size="md" onClick={add} disabled={busy || choices.length === 0}>
            {busy
              ? "Adding…"
              : fromSeason
                ? `Add ${seasonLabel(season)} from ${seasonLabel(fromSeason.season)}`
                : `Add ${seasonLabel(season)}`}
          </Pill>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Select label="Season" value={String(season)} onChange={(e) => setSeason(Number(e.target.value))}>
        {choices.map((y) => (
          <option key={y} value={y}>
            {seasonLabel(y)}
            {tag(y)}
          </option>
        ))}
      </Select>
      {sorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SegGroup label="Copy a season or start empty">
            <SegButton label={`Copy ${seasonLabel((sorted.find((s) => s.id === from) ?? sorted[0]).season)}`} active={copy} onClick={() => setCopy(true)} />
            <SegButton label="Start empty" active={!copy} onClick={() => setCopy(false)} />
          </SegGroup>
          {copy && sorted.length > 1 && (
            <Select label="Copy which season" value={from} onChange={(e) => setFrom(e.target.value)}>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {seasonLabel(s.season)}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
        {fromSeason
          ? "Same weekends a year on, with the teams that came now on the fence. Scores and canceled weekends aren't carried."
          : "No weekends yet; add our teams (V, JV1…) in Season settings."}
      </div>
    </SideSheet>
  );
}
