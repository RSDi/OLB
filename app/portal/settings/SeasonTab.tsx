"use client";
// Settings → Season: the season end date and the Conqueror age-cap table.
// Board only (admin / super_admin). Caps are "must not turn (max + 1) on or
// before the end date" — 14U max age 14 means they cannot turn 15.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { loadSeasonSettings, saveAgeCaps, saveSeasonEndDate } from "../../../lib/teams/eligibility-actions";
import type { AgeCap, AgeCapInput, SeasonSettings } from "../../../lib/teams/eligibility";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

function draftCaps(caps: AgeCap[]): AgeCapInput[] {
  return caps.map((c) => ({ id: c.id, age_group: c.age_group, max_age: String(c.max_age) }));
}

export function SeasonTab() {
  const [settings, setSettings] = useState<SeasonSettings | null>(null);
  const [endsOn, setEndsOn] = useState("");
  const [caps, setCaps] = useState<AgeCapInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadSeasonSettings>>) => {
    if ("error" in res) return setError(res.error);
    setSettings(res);
    setEndsOn(res.seasonEndsOn);
    setCaps(draftCaps(res.caps));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSeasonSettings().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  async function run(fn: () => Promise<{ error?: string }>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice(ok);
    const next = await loadSeasonSettings();
    apply(next);
  }

  if (error && !settings) return <ErrorBox text={error} />;
  if (!settings) return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;

  const upCap = (i: number, patch: Partial<AgeCapInput>) => setCaps(caps.map((c, n) => (n === i ? { ...c, ...patch } : c)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        {`${settings.season} season. Conqueror league age rule: a player cannot turn older than their level's max age at any point of the season, or they have to play up. The Directory uses this for `}
        <Link href="/portal/directory" prefetch={false} style={{ color: "var(--gw-fg)", fontWeight: 700 }}>
          eligibility and swing-ups
        </Link>
        .
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="season-end-date">
        <h3 style={h3}>Season end date</h3>
        <p style={sub}>
          The last day of the season. A player ages out of a level if they turn one year over its max age on or before this
          day. 8th / 14U cannot turn 15; 6th / 12U cannot turn 13; 5th cannot turn 12; 4th cannot turn 11; 3rd / 10U-ish
          cannot turn 10 — edit the table below if the league writes it differently.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <Input
            label="Season end date"
            help="Players must still be at or under the level's max age on this day."
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
          <span data-tour="season-end-save" style={{ display: "inline-flex" }}>
            <Pill size="sm" variant="accent" disabled={busy || endsOn === settings.seasonEndsOn} onClick={() => run(() => saveSeasonEndDate(settings.boardId, endsOn), "Season end date saved.")}>
              {busy ? "Saving…" : "Save date"}
            </Pill>
          </span>
        </div>
      </div>

      <div className="rsd-card" style={card} data-tour="season-age-caps">
        <h3 style={h3}>Age caps by level</h3>
        <p style={sub}>
          Max age 14 on 14U means they must not turn 15 on or before the season end date. Same for 12U (must not turn 13)
          and 10U (must not turn 11). Add a row for a grade (5th, 4th, 3rd) if you place by grade instead of U-level.
        </p>
        {caps.map((c, i) => (
          <div
            key={c.id ?? `new-${i}`}
            data-tour={i === 0 ? "season-age-cap-row" : undefined}
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}
          >
            <Input
              label={i === 0 ? "Level" : undefined}
              aria-label="Level"
              value={c.age_group}
              onChange={(e) => upCap(i, { age_group: e.target.value })}
              placeholder="14U"
            />
            <Input
              label={i === 0 ? "Max age" : undefined}
              help={i === 0 ? "Must not turn one year older than this on or before the season end date." : undefined}
              aria-label="Max age"
              inputMode="numeric"
              value={c.max_age}
              onChange={(e) => upCap(i, { max_age: e.target.value })}
              placeholder="14"
            />
            <Pill size="sm" variant="ghost" onClick={() => setCaps(caps.filter((_, n) => n !== i))} disabled={caps.length <= 1}>
              Remove
            </Pill>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span data-tour="season-age-cap-add" style={{ display: "inline-flex" }}>
            <Pill size="sm" variant="ghost" onClick={() => setCaps([...caps, { age_group: "", max_age: "" }])}>
              <Icons.Plus width={14} height={14} /> Add a level
            </Pill>
          </span>
          <span data-tour="season-age-caps-save" style={{ display: "inline-flex" }}>
            <Pill size="sm" variant="accent" disabled={busy} onClick={() => run(() => saveAgeCaps(settings.boardId, caps), "Age caps saved.")}>
              {busy ? "Saving…" : "Save caps"}
            </Pill>
          </span>
        </div>
      </div>
    </div>
  );
}
