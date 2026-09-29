"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Textarea } from "../../components/ui";
import { recordPayment } from "../../../lib/finances/actions";
import { formatAmount, parseAmount, splitPayment, type Account } from "../../../lib/finances/logic";
import { PAYMENT_METHODS, REFERENCE_MAX, NOTE_MAX, type PaymentMethod } from "../../../lib/finances/types";
import { ErrorNote, SegButton, SegGroup, Sheet, capStyle, today } from "./parts";

// Money received from a family: one Venmo or check, split across the kids it
// pays for. The split fills each kid's balance in turn; the Treasurer can
// change it.
export function PaymentDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(account.totals.balance > 0 ? (account.totals.balance / 100).toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>(
    account.players.some((p) => /check/i.test(p.payment_method ?? "")) ? "check" : "venmo"
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  // Hand-set shares (dollars as typed), or null to split automatically.
  const [manual, setManual] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmount(amount);
  const auto = useMemo(
    () =>
      splitPayment(
        cents ?? 0,
        account.players.map((p) => ({ player_id: p.id, balance: account.byPlayer.get(p.id)?.balance ?? 0 }))
      ),
    [cents, account]
  );
  const shares = account.players.map((p) => {
    if (manual) return { player_id: p.id, amount_cents: parseAmount(manual[p.id] || "0") };
    return { player_id: p.id, amount_cents: auto.find((s) => s.player_id === p.id)?.amount_cents ?? 0 };
  });
  const sharesTotal = shares.reduce((n, s) => n + (s.amount_cents ?? 0), 0);
  const badShare = shares.some((s) => s.amount_cents == null);
  const multi = account.players.length > 1;

  async function save() {
    setError(null);
    if (cents == null || cents <= 0) return setError("Enter how much they paid, like 375 or 1,150.");
    if (badShare) return setError("Each kid's share must be an amount, like 375.");
    if (sharesTotal !== cents) {
      return setError(`The kids' shares add up to ${formatAmount(sharesTotal)}, not ${formatAmount(cents)}.`);
    }
    setBusy(true);
    const res = await recordPayment({
      splits: shares.map((s) => ({ player_id: s.player_id, amount_cents: s.amount_cents ?? 0 })),
      paid_on: paidOn,
      method,
      reference,
      note,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  }

  return (
    <Sheet eyebrow={`${account.name} family`} title="Record a payment" busy={busy} onClose={onClose}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
        {account.totals.balance > 0
          ? `They owe ${formatAmount(account.totals.balance)}.`
          : account.totals.balance < 0
            ? `They have a credit of ${formatAmount(-account.totals.balance)}.`
            : "They're paid up."}
      </div>

      <Input
        label="Amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="375.00"
        autoFocus
      />
      <Input label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={capStyle}>How they paid</span>
        <SegGroup label="How they paid">
          {PAYMENT_METHODS.map((m) => (
            <SegButton key={m.key} label={m.label} active={method === m.key} onClick={() => setMethod(m.key)} />
          ))}
        </SegGroup>
      </div>

      <Input
        label={method === "check" ? "Check number" : "Reference"}
        help="A check number, or the note on the Venmo, so you can match it later."
        value={reference}
        maxLength={REFERENCE_MAX}
        onChange={(e) => setReference(e.target.value)}
        placeholder={method === "check" ? "1042" : "Optional"}
      />

      {multi && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={capStyle}>Split between the kids</span>
            <button
              type="button"
              onClick={() =>
                setManual(
                  manual
                    ? null
                    : Object.fromEntries(shares.map((s) => [s.player_id, ((s.amount_cents ?? 0) / 100).toFixed(2)]))
                )
              }
              style={{ border: "none", background: "none", padding: 0, color: "var(--rsd-accent)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {manual ? "Split it for me" : "Change the split"}
            </button>
          </div>
          {account.players.map((p) => {
            const share = shares.find((s) => s.player_id === p.id)!;
            const owes = account.byPlayer.get(p.id)?.balance ?? 0;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p.full_name}</span>
                  <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                    {owes > 0 ? `Owes ${formatAmount(owes)}` : owes < 0 ? `Credit ${formatAmount(-owes)}` : "Paid up"}
                  </span>
                </div>
                {manual ? (
                  <input
                    aria-label={`${p.full_name}'s share`}
                    inputMode="decimal"
                    value={manual[p.id] ?? ""}
                    onChange={(e) => setManual({ ...manual, [p.id]: e.target.value })}
                    style={{
                      width: 110,
                      height: 36,
                      padding: "0 10px",
                      borderRadius: 8,
                      border: "1px solid var(--gw-border)",
                      background: "var(--gw-bg)",
                      color: "var(--gw-fg)",
                      fontSize: 14,
                      textAlign: "right",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{formatAmount(share.amount_cents ?? 0)}</span>
                )}
              </div>
            );
          })}
          {manual && cents != null && sharesTotal !== cents && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-error)" }}>
              Shares add up to {formatAmount(sharesTotal)} of {formatAmount(cents)}.
            </span>
          )}
        </div>
      )}

      <Textarea
        label="Note"
        help="The family can see this note on their balance."
        value={note}
        maxLength={NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional"
      />

      {error && <ErrorNote text={error} />}

      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}
