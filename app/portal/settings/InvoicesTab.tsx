"use client";

import { useCallback, useEffect, useState } from "react";
import { CHECK_PAYEE } from "../../../lib/teams/registration-receipt";
import { loadCheckMailingAddress, saveCheckMailingAddress } from "../../../lib/invoicing/check-address-actions";
import { Input, Pill, Textarea } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

// Settings → Invoices: where programs and families mail checks.
export function InvoicesTab() {
  const [payee, setPayee] = useState("");
  const [address, setAddress] = useState("");
  const [envFallback, setEnvFallback] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await loadCheckMailingAddress();
    if ("error" in res) {
      setError(res.error);
      setReady(true);
      return;
    }
    setPayee(res.payee);
    setAddress(res.address);
    setEnvFallback(res.envFallbackLines);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCheckMailingAddress().then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setError(res.error);
        setReady(true);
        return;
      }
      setPayee(res.payee);
      setAddress(res.address);
      setEnvFallback(res.envFallbackLines);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveCheckMailingAddress({ payee, address });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.notice) setNotice(res.notice);
    await load();
  }

  if (!ready) {
    return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;
  }

  const previewLines = address
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const shownAddress = previewLines.length ? previewLines : envFallback;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <p style={{ ...sub, fontSize: 13 }}>
        Where programs and families mail checks. Shows on invoice emails, the invoice page, and registration receipts.
        Leave the address blank and the site uses the server&apos;s leftover env, then &quot;reply for the mailing address.&quot;
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="invoices-check-address">
        <h3 style={h3}>Check mailing address</h3>
        <p style={sub}>Payable to is who the check is made out to. The address is attention, street, and city — one line each.</p>
        <Input
          label="Payable to"
          help="Leave blank to use Omaha Lightning Basketball."
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder={CHECK_PAYEE}
          data-tour="invoices-check-payee"
        />
        <Textarea
          label="Mailing address"
          help="First line can be an attention name. Leave blank to fall back to the server env, then 'reply for the mailing address'."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={"Treasurer\n123 Main St\nOmaha, NE 681xx"}
          rows={5}
          data-tour="invoices-check-lines"
        />
        <div style={{ ...sub, padding: "10px 12px", borderRadius: 8, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
          <div style={{ fontWeight: 700, color: "var(--gw-fg)", marginBottom: 4 }}>On the next invoice</div>
          <div>Payable to {payee.trim() || CHECK_PAYEE}</div>
          <div>
            Mail to:{" "}
            {shownAddress.length ? shownAddress.join(", ") : "Reply for the mailing address"}
            {!previewLines.length && envFallback.length ? " (from the server env until you save an address here)" : ""}
          </div>
        </div>
      </div>

      <div data-tour="invoices-check-save">
        <Pill size="sm" variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
      </div>
    </div>
  );
}
