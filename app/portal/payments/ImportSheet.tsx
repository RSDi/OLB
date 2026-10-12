"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../components/ui";
import { ComboSelect } from "../../components/ComboSelect";
import { previewFinanceImport, runFinanceImport, runPaymentCatchUp, runUniformCharges, undoFinanceImport } from "../../../lib/finances/import-actions";
import type { ImportPreview } from "../../../lib/finances/import-sheet";
import { formatAmount } from "../../../lib/finances/logic";
import { ErrorNote, Sheet, capStyle } from "./parts";
import { sub } from "./club-parts";

const selectStyle: React.CSSProperties = {
  height: 36,
  width: 240,
  maxWidth: "100%",
  padding: "0 8px",
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
  fontSize: 13,
};

// Payments → Budget → Import spreadsheet (0131): the Treasurer's season
// spreadsheet in, after a look at what it will add. Nothing is written until
// Import.
export function ImportSheet({ imported, onClose }: { imported: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [workers, setWorkers] = useState<Record<string, string>>({});
  const [postCredits, setPostCredits] = useState(true);
  const [spill, setSpill] = useState(true);
  const [prices, setPrices] = useState({ jersey: "55", shorts: "55" });
  const [uniformNote, setUniformNote] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const form = () => {
    const f = new FormData();
    if (file) f.set("file", file);
    return f;
  };

  async function look(chosen: File) {
    setFile(chosen);
    setBusy(true);
    setError(null);
    const f = new FormData();
    f.set("file", chosen);
    const res = await previewFinanceImport(f).catch(() => ({ error: "That didn't work. Try again." }));
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setPreview(res);
    setTeams(Object.fromEntries(res.teams.map((t) => [t.name, t.match ?? ""])));
    setWorkers(Object.fromEntries(res.workers.map((w) => [w.name, w.match ?? "skip"])));
  }

  async function run() {
    setBusy(true);
    setError(null);
    const res = await runFinanceImport(form(), { teams, workers, postCredits, spill }).catch(() => ({ error: "That didn't work. Try again." }) as { error?: string; notice?: string });
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(res.notice ?? "Imported.");
    router.refresh();
  }

  // Jerseys and shorts from Regular Season, on their own: they can be added
  // after the rest of the spreadsheet is in.
  async function uniforms() {
    setBusy(true);
    setError(null);
    const res = await runUniformCharges(form(), prices).catch(() => ({ error: "That didn't work. Try again." }) as { error?: string; notice?: string });
    setBusy(false);
    if (res.error) return setError(res.error);
    setUniformNote(res.notice ?? "Added.");
    router.refresh();
  }

  async function catchUp() {
    if (!confirm("Record these payments so Payments matches the spreadsheet?")) return;
    setBusy(true);
    setError(null);
    const res = await runPaymentCatchUp(form()).catch(() => ({ error: "That didn't work. Try again." }) as { error?: string; notice?: string });
    setBusy(false);
    if (res.error) return setError(res.error);
    setPaymentNote(res.notice ?? "Recorded.");
    router.refresh();
  }

  async function undo() {
    if (!confirm("Take back everything the spreadsheet import added? Costs, payments, income, sign-ups and shifts you added by hand stay.")) return;
    setBusy(true);
    setError(null);
    const res = await undoFinanceImport();
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(res.notice ?? "Done.");
    router.refresh();
  }

  const c = preview?.counts;
  return (
    <Sheet eyebrow="Budget" title="Import the spreadsheet" busy={busy} onClose={onClose}>
      {done ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{done}</div>
          <div>
            <Pill variant="accent" onClick={onClose}>
              Done
            </Pill>
          </div>
        </>
      ) : !preview ? (
        <>
          <div style={sub}>
            Bring this season&apos;s spreadsheet in: Payables become budget lines with what was paid and the check numbers, Receivables become
            income, the workouts and clinics sheets become programs with their sign-ups, and Nelson&apos;s Produce becomes shifts. You see what it
            will add before anything is saved.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files?.[0] && look(e.target.files[0])}
            style={{ fontSize: 13 }}
          />
          {busy && <div style={sub}>Reading it…</div>}
          {imported && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <span style={capStyle}>Already imported</span>
              <div style={sub}>Took in the wrong file, or want to start over? Undo takes back only what the import added.</div>
              <div>
                <Pill size="sm" variant="ghost" onClick={undo} disabled={busy}>
                  Undo the import
                </Pill>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...sub, fontWeight: 600 }}>
            {preview.file} → the {preview.season} season
          </div>
          {preview.alreadyImported && <ErrorNote text="This season already has an import. Close this, then use Undo the import before bringing it in again." />}
          {c && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
              <span style={capStyle}>What it adds</span>
              <span>
                <strong>{c.lines} costs</strong>: {formatAmount(c.budget)} budgeted, {formatAmount(c.paid)} paid ({c.groups.map((g) => `${g.name} ${g.lines}`).join(", ")})
              </span>
              <span>
                <strong>{c.income} income entries</strong>: {formatAmount(c.incomeIn)} in
              </span>
              {c.programs.map((p) => (
                <span key={p.name}>
                  <strong>{p.name}</strong>
                  {`: ${p.signups} sign-ups, ${p.onRoster} on this season's roster, all marked paid as the sheet says`}
                </span>
              ))}
              {c.shifts > 0 && (
                <span>
                  <strong>{c.shifts} Nelson&apos;s shifts</strong>: {formatAmount(c.toFamilies)} toward registration, {formatAmount(c.toFund)} to Buckets for Bucks
                </span>
              )}
            </div>
          )}

          {preview.teams.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={capStyle}>Teams</span>
              {preview.teams.map((t) => (
                <label key={t.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}>
                  {t.name}
                  <ComboSelect aria-label={`Team for ${t.name}`} value={teams[t.name] ?? ""} onChange={(e) => setTeams({ ...teams, [t.name]: e.target.value })} style={selectStyle}>
                    <option value="">No team (keep the name)</option>
                    {preview.siteTeams.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </ComboSelect>
                </label>
              ))}
            </div>
          )}

          {preview.workers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={capStyle}>Nelson&apos;s toward registration: whose fees</span>
              <div style={sub}>Matched by name. Pick the player each one goes toward first, like a parent with more than one kid: type a first or last name to find them.</div>
              {preview.workers.map((w) => (
                <label key={w.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}>
                  <span>
                    {w.name}{" "}
                    <span style={{ color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                      · {w.shifts} {w.shifts === 1 ? "shift" : "shifts"}, {formatAmount(w.cents)}
                    </span>
                  </span>
                  <ComboSelect aria-label={`Whose fees for ${w.name}`} value={workers[w.name] ?? "skip"} onChange={(e) => setWorkers({ ...workers, [w.name]: e.target.value })} style={selectStyle}>
                    <option value="skip">Leave out</option>
                    <option value="fund">Buckets for Bucks</option>
                    {preview.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </ComboSelect>
                </label>
              ))}
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
                <input type="checkbox" checked={postCredits} onChange={(e) => setPostCredits(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--rsd-accent)" }} />
                <span>
                  Put them on families&apos; accounts as Fundraising credits
                  <span style={{ ...sub, display: "block" }}>
                    Leave this off if you already recorded Nelson&apos;s money on Payments as payments, so it isn&apos;t counted twice.
                  </span>
                </span>
              </label>
              {postCredits && (
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, fontWeight: 600 }}>
                  <input type="checkbox" checked={spill} onChange={(e) => setSpill(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--rsd-accent)" }} />
                  <span>
                    When a player&apos;s fees are paid, the rest goes to their brothers
                    <span style={{ ...sub, display: "block" }}>Sarah Wesner&apos;s shifts go to Luke until he owes nothing, then to Nate.</span>
                  </span>
                </label>
              )}
            </div>
          )}

          {(preview.uniforms.jerseys > 0 || preview.uniforms.shorts > 0 || preview.uniforms.alreadyCharged > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-tour="import-uniforms">
              <span style={capStyle}>Uniforms from Regular Season</span>
              {uniformNote ? (
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{uniformNote}</div>
              ) : preview.uniforms.jerseys + preview.uniforms.shorts === 0 ? (
                <div style={sub}>Every jersey and pair of shorts on the sheet is already on families&apos; accounts.</div>
              ) : (
                <>
                  <div style={sub}>
                    {`${preview.uniforms.jerseys} jerseys and ${preview.uniforms.shorts} shorts ordered for ${preview.uniforms.players} players, each a Uniform charge on their family's account, like "Jersey (AM)".`}
                    {preview.uniforms.alreadyCharged > 0 && ` ${preview.uniforms.alreadyCharged} already charged are left alone.`}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
                      Jersey
                      <input inputMode="decimal" value={prices.jersey} onChange={(e) => setPrices({ ...prices, jersey: e.target.value })} style={{ ...selectStyle, width: 90 }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
                      Shorts
                      <input inputMode="decimal" value={prices.shorts} onChange={(e) => setPrices({ ...prices, shorts: e.target.value })} style={{ ...selectStyle, width: 90 }} />
                    </label>
                    <Pill size="sm" variant={preview.alreadyImported ? "accent" : "light"} onClick={uniforms} disabled={busy}>
                      Add uniform charges
                    </Pill>
                  </div>
                </>
              )}
              {preview.uniforms.unmatched.length > 0 && (
                <div style={sub}>Not on this season&apos;s roster, so left out: {preview.uniforms.unmatched.join(", ")}.</div>
              )}
            </div>
          )}

          {(preview.payments.players > 0 || preview.payments.over.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-tour="import-payments">
              <span style={capStyle}>Match payments to the sheet</span>
              {paymentNote ? (
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{paymentNote}</div>
              ) : preview.payments.players > 0 ? (
                <>
                  <div style={sub}>
                    {`Regular Season shows ${formatAmount(preview.payments.cents)} more paid than Payments, across ${preview.payments.players} players (counting PAID less the Nelson's column, which comes in as Fundraising credits). Record each difference as a payment "From the spreadsheet". Add the uniform charges first so the balances come out right.`}
                  </div>
                  <div>
                    <Pill size="sm" variant="light" onClick={catchUp} disabled={busy}>
                      Record {formatAmount(preview.payments.cents)} in payments
                    </Pill>
                  </div>
                </>
              ) : null}
              {preview.payments.over.length > 0 && (
                <div style={sub}>Payments shows more than the sheet for these, so they&apos;re left alone: {preview.payments.over.join("; ")}.</div>
              )}
            </div>
          )}

          {preview.checks.length > 0 && (
            <details>
              <summary style={{ ...capStyle, cursor: "pointer" }}>Regular Season vs Payments ({preview.checks.length})</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {preview.checks.map((x, i) => (
                  <li key={i} style={sub}>
                    {x}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview.notes.length > 0 && (
            <details>
              <summary style={{ ...capStyle, cursor: "pointer" }}>Left out on purpose ({preview.notes.length})</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {preview.notes.map((x, i) => (
                  <li key={i} style={sub}>
                    {x}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {error && <ErrorNote text={error} />}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
            <Pill variant="accent" onClick={run} disabled={busy || preview.alreadyImported}>
              {busy ? "Importing…" : "Import"}
            </Pill>
            <Pill
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
              disabled={busy}
            >
              Choose another file
            </Pill>
          </div>
        </>
      )}
      {!preview && error && <ErrorNote text={error} />}
    </Sheet>
  );
}
