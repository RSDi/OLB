"use client";
import { useState } from "react";
import { parseRoster } from "../../../../lib/teams/parse-roster";
import type { ParseResult } from "../../../../lib/teams/types";
import { importBoard } from "../../../../lib/teams/import-actions";
import { ageLabel } from "../../../../lib/teams/age";

export default function ImportPage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [filename, setFilename] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setNames({});
    setFilename(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
      setResult(parseRoster(rows, { referenceYear: 2026 }));
    } catch {
      setError("Couldn't read that file — make sure it's the Teams .xlsx workbook.");
    }
  }

  async function onConfirm() {
    if (!result) return;
    const teams = result.teams.map((t, i) =>
      names[i]?.trim() ? { ...t, name: names[i].trim(), needs_name: false } : t,
    );
    if (teams.some((t) => t.needs_name)) {
      setError("Please name the highlighted team(s) before importing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await importBoard(teams, filename);
      // Hard navigation guarantees the board re-renders with the fresh import.
      window.location.assign("/portal/teams");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Import failed.");
    }
  }

  return (
    <div className="olb-page" style={{ maxWidth: 920 }}>
      <h1 className="olb-h1" style={{ marginBottom: 6 }}>Import roster</h1>
      <p className="olb-sub" style={{ marginTop: 0 }}>
        Upload the season <strong>Teams .xlsx</strong>. You&apos;ll see a preview before anything is saved.
        Importing replaces this season&apos;s teams and coaches and puts players on their new teams.
        Registered players keep their details and parents; any the sheet leaves out go back to Unassigned.
      </p>

      <div className="olb-card olb-card--pad" style={{ marginTop: 12 }}>
        <input type="file" accept=".xlsx,.xls" onChange={onFile} />
        {filename && <span className="olb-sub" style={{ marginLeft: 10 }}>{filename}</span>}
      </div>

      {error && <div className="olb-alert olb-alert--error" style={{ marginTop: 14 }}>{error}</div>}

      {result && (
        <>
          <div className="olb-statbar" style={{ marginTop: 20 }}>
            <div className="olb-stat"><span className="olb-stat__num">{result.teams.length}</span><span className="olb-stat__lbl">Teams</span></div>
            <div className="olb-stat"><span className="olb-stat__num">{result.totalPlayers}</span><span className="olb-stat__lbl">Players</span></div>
          </div>

          {result.flags.map((f, i) => (
            <div key={i} className="olb-alert olb-alert--error" style={{ marginBottom: 10 }}>⚠ {f}</div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 8 }}>
            {result.teams.map((t, i) => {
              const colorKey = t.color ? t.color.toLowerCase() : undefined;
              return (
                <section key={i} className="olb-col" data-color={colorKey} style={t.needs_name ? { borderColor: "var(--olb-gold-deep)", borderTopColor: "var(--olb-gold)" } : undefined}>
                  <header className="olb-col__head">
                    {t.needs_name ? (
                      <div>
                        <div className="olb-label" style={{ color: "var(--olb-red-deep)" }}>Name this team *</div>
                        <input
                          className="olb-input"
                          placeholder="e.g. 17U Varsity"
                          value={names[i] ?? ""}
                          onChange={(e) => setNames((n) => ({ ...n, [i]: e.target.value }))}
                        />
                      </div>
                    ) : (
                      <div className="olb-col__title">
                        {t.color && <span className="olb-chip" data-color={colorKey}>{t.color}</span>}
                        <span className="olb-col__name">{t.name}</span>
                      </div>
                    )}
                    <div className="olb-col__meta">
                      {[t.grade_label, t.division].filter(Boolean).join(" · ") || "—"}
                      {t.coaches.length > 0 && <> · ★ {t.coaches.join(", ")}</>}
                    </div>
                    <div className="olb-col__count"><span>{t.players.length} players</span></div>
                  </header>
                  <div className="olb-list">
                    {t.players.map((p, j) => (
                      <div key={j} className="olb-player">
                        <div>
                          <div className="olb-player__name">{p.full_name}</div>
                          <div className="olb-player__meta">{[ageLabel(p.dob), p.grade].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                        <span className="olb-player__spacer" />
                        {p.flag && <span className="olb-player__flag" title="Check date of birth">⚠</span>}
                      </div>
                    ))}
                    {t.players.length === 0 && <div className="olb-empty">No players</div>}
                  </div>
                </section>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="olb-btn olb-btn--gold" disabled={busy} onClick={onConfirm}>
              {busy ? "Importing…" : `Import ${result.teams.length} teams · ${result.totalPlayers} players`}
            </button>
            <button className="olb-btn olb-btn--ghost" disabled={busy} onClick={() => { setResult(null); setFilename(""); }}>
              Choose a different file
            </button>
          </div>
        </>
      )}
    </div>
  );
}
