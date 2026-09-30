"use client";
// Add a season: empty, or started from another season (the same weekends a
// year on, the same events, places, columns and games, the teams that came
// now on the fence). The board only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Select } from "../../../components/ui";
import { SideSheet } from "../../../components/SideSheet";
import { createSeason } from "../../../../lib/hs-schedule/actions";
import { seasonLabel } from "../../../../lib/planning/season";
import type { HsSeason } from "../../../../lib/hs-schedule/types";

export function NewSeasonSheet({ seasons, onClose }: { seasons: HsSeason[]; onClose: () => void }) {
  const router = useRouter();
  const taken = new Set(seasons.map((s) => s.season));
  const latest = seasons.length ? Math.max(...seasons.map((s) => s.season)) : new Date().getFullYear();
  // The next few seasons, and a few back for filling in history.
  const choices = Array.from({ length: 8 }, (_, i) => latest + 2 - i).filter((y) => !taken.has(y));
  const [season, setSeason] = useState<number>(choices[0] ?? latest + 1);
  const [from, setFrom] = useState<string>(seasons.find((s) => s.season === latest)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await createSeason({ season, fromSeasonId: from || null });
    setBusy(false);
    if (res.error) return setError(res.error);
    onClose();
    router.push(`/portal/schedule?season=${season}`);
    router.refresh();
  }

  return (
    <SideSheet
      eyebrow="HS Schedule"
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
            {busy ? "Adding…" : `Add ${seasonLabel(season)}`}
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
          </option>
        ))}
      </Select>
      <Select label="Start from" value={from} onChange={(e) => setFrom(e.target.value)}>
        <option value="">An empty schedule</option>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {seasonLabel(s.season)}
          </option>
        ))}
      </Select>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
        {from
          ? "Copies that season's weekends to the same weekends in the new one (same days of the week), with their events, places, columns and games. The teams that came are carried over as on the fence, ready to confirm. Scores and canceled weekends stay behind."
          : "Starts with no weekends and no columns. Add the columns (V, JV1…) in Season settings."}
      </div>
    </SideSheet>
  );
}
