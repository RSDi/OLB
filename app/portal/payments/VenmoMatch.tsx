"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../components/ui";
import { ErrorNote, capStyle } from "./parts";
import { readVenmoStatement, recordVenmoPayments, type VenmoRow } from "../../../lib/onboarding/venmo-actions";
import { formatDollars } from "../../../lib/finances/logic";

const muted: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 };

// Match Venmo (0130): upload the statement Venmo emails or lets you
// download (CSV), check whose each payment is, and record them together.
export function VenmoMatch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<(VenmoRow & { pick: boolean })[] | null>(null);
  const [players, setPlayers] = useState<{ id: string; full_name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const name = (id: string) => players.find((p) => p.id === id)?.full_name ?? "Someone";

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await readVenmoStatement(await file.text());
    setBusy(false);
    if (res.error) return setError(res.error);
    setPlayers(res.players ?? []);
    setRows((res.rows ?? []).map((r) => ({ ...r, pick: !r.already && r.playerIds.length > 0 })));
  }

  async function record() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.pick && r.playerIds.length > 0);
    setBusy(true);
    setError(null);
    const res = await recordVenmoPayments(chosen.map(({ payment, playerIds }) => ({ payment, playerIds })));
    setBusy(false);
    if (res.error) setError(res.error);
    setNotice(`Recorded ${res.recorded ?? 0} ${res.recorded === 1 ? "payment" : "payments"}.`);
    setRows(null);
    router.refresh();
  }

  const update = (i: number, patch: Partial<VenmoRow & { pick: boolean }>) => setRows((list) => list!.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const picked = rows?.filter((r) => r.pick && r.playerIds.length > 0) ?? [];

  // A row's controls, shared by the desktop table and the phone cards
  // (`tap` gives the phone version 36px tap targets).
  type Row = VenmoRow & { pick: boolean };
  const pickBox = (r: Row, i: number) => (
    <input type="checkbox" aria-label="Record this one" checked={r.pick} disabled={r.already} onChange={(e) => update(i, { pick: e.target.checked })} />
  );
  const whose = (r: Row, i: number, tap: boolean) =>
    r.already ? (
      <span style={muted}>Already recorded</span>
    ) : (
      <div style={{ display: "flex", gap: tap ? 6 : 4, flexWrap: "wrap", alignItems: "center" }}>
        {r.playerIds.map((id) => (
          <span key={id} className="rsd-chip rsd-chip-accent" style={tap ? { display: "inline-flex", gap: 0, padding: "0 0 0 10px", minHeight: 36 } : { display: "inline-flex", gap: 4 }}>
            {name(id)}
            <button
              type="button"
              aria-label={`Not ${name(id)}`}
              onClick={() => update(i, { playerIds: r.playerIds.filter((x) => x !== id) })}
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontWeight: 800, ...(tap ? { minWidth: 36, minHeight: 36, color: "inherit" } : {}) }}
            >
              ×
            </button>
          </span>
        ))}
        <select
          aria-label="Add a player"
          value=""
          onChange={(e) => e.target.value && update(i, { playerIds: [...r.playerIds, e.target.value], pick: true })}
          style={{ height: tap ? 36 : 28, fontSize: 12, borderRadius: 6, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", ...(tap ? { maxWidth: "100%" } : {}) }}
        >
          <option value="">{r.playerIds.length ? "+ player" : "Pick a player"}</option>
          {players
            .filter((p) => !r.playerIds.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
        </select>
      </div>
    );

  return (
    <div className="rsd-card" data-tour="payments-venmo" style={{ gap: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Match Venmo</div>
          <div style={muted}>
            In Venmo, open Statements and download one as a CSV. We read the money that came in and guess whose it is from the player names in the
            note. Nothing is recorded until you press Record.
          </div>
        </div>
        <Pill size="sm" variant="ghost" onClick={onClose}>
          Close
        </Pill>
      </div>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0])} disabled={busy} />
      </label>
      {error && <ErrorNote text={error} />}
      {notice && <span style={{ ...muted, fontWeight: 700, color: "var(--gw-fg)" }}>{notice}</span>}
      {rows && rows.length === 0 && <span style={muted}>No money came in on that statement.</span>}
      {rows && rows.length > 0 && (
        <>
          {/* Phones: one card per payment; the table below is for wider screens. */}
          <div className="gw-mobile-cards" style={{ gap: 0 }}>
            {rows.map((r, i) => (
              <div
                key={r.payment.id}
                style={{ display: "flex", gap: 6, padding: "10px 0", borderTop: "1px solid var(--gw-border)", opacity: r.already ? 0.55 : 1, fontSize: 13 }}
              >
                <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, flexShrink: 0, margin: "-4px 0 0 -8px" }}>
                  {pickBox(r, i)}
                </label>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, overflowWrap: "anywhere" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{r.payment.from}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatDollars(r.payment.amount_cents)}</span>
                  </div>
                  <span style={muted}>{r.payment.date}</span>
                  {r.payment.note && <span>{r.payment.note}</span>}
                  {whose(r, i, true)}
                </div>
              </div>
            ))}
          </div>
          <div className="gw-desktop-table" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  {["", "Date", "From", "Note", "Amount", "Whose"].map((h) => (
                    <th key={h} style={{ ...capStyle, fontSize: 10, textAlign: h === "Amount" ? "right" : "left", padding: "6px 8px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.payment.id} style={{ borderTop: "1px solid var(--gw-border)", opacity: r.already ? 0.55 : 1 }}>
                    <td style={{ padding: "6px 8px" }}>{pickBox(r, i)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.payment.date}</td>
                    <td style={{ padding: "6px 8px" }}>{r.payment.from}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 260 }}>{r.payment.note}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDollars(r.payment.amount_cents)}</td>
                    <td style={{ padding: "6px 8px", minWidth: 200 }}>{whose(r, i, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Pill size="sm" variant="accent" onClick={record} disabled={busy || picked.length === 0}>
              {busy ? "Recording…" : `Record ${picked.length} ${picked.length === 1 ? "payment" : "payments"}`}
            </Pill>
            <span style={muted}>Split across siblings by what each owes, like Record payment.</span>
          </div>
        </>
      )}
    </div>
  );
}
