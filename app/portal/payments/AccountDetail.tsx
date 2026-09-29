"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { voidCharge, voidPayment } from "../../../lib/finances/actions";
import { formatAmount, groupPayments, methodLabel, type Account } from "../../../lib/finances/logic";
import { BalanceChip, ErrorNote, capStyle, formatDay } from "./parts";

// What's on one family's account: each kid's charges and credits, and the
// payments. The Treasurer (canManage) also sees who entered each line, voided
// lines on request, and a Void button. Parents see their own, read-only.
export function AccountDetail({
  account,
  canManage,
  names = {},
}: {
  account: Account;
  canManage: boolean;
  names?: Record<string, string>;
}) {
  const router = useRouter();
  const [showVoided, setShowVoided] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerName = new Map(account.players.map((p) => [p.id, p.full_name]));
  const multi = account.players.length > 1;
  const firstName = (id: string) => (playerName.get(id) ?? "").split(/\s+/)[0];
  const groups = groupPayments(account.payments);
  const voidedCount = account.charges.filter((c) => c.voided_at).length + groups.filter((g) => g.voided).length;
  const charges = account.charges.filter((c) => showVoided || !c.voided_at);
  const payments = groups.filter((g) => showVoided || !g.voided);

  async function run(key: string, confirmText: string, fn: () => Promise<{ error?: string }>) {
    if (!confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Each kid's standing; the name opens their player page. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {account.players.map((p) => {
          const t = account.byPlayer.get(p.id)!;
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
              }}
            >
              <Link
                href={`/portal/directory/players/${p.id}`}
                data-tour="payments-player-link"
                style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
              >
                {p.full_name}
              </Link>
              <BalanceChip totals={t} />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={capStyle}>Charges and credits</span>
        {charges.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Nothing charged yet.</span>
        ) : (
          <div>
            {charges.map((c) => (
              <Line
                key={c.id}
                voided={!!c.voided_at}
                title={c.description}
                facts={[formatDay(c.entry_date), multi && firstName(c.player_id)]}
                note={c.note}
                by={canManage && c.created_by && names[c.created_by] ? `Added by ${names[c.created_by]}` : null}
                amount={c.kind === "credit" ? `−${formatAmount(c.amount_cents)}` : formatAmount(c.amount_cents)}
                onVoid={
                  canManage && !c.voided_at
                    ? () =>
                        run(c.id, `Void "${c.description}" for ${playerName.get(c.player_id)}? It stays in the history, crossed out.`, () =>
                          voidCharge(c.id)
                        )
                    : undefined
                }
                busy={busy === c.id}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={capStyle}>Payments</span>
        {payments.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>No payments yet.</span>
        ) : (
          <div>
            {payments.map((g) => (
              <Line
                key={g.group_id}
                voided={g.voided}
                title={`${methodLabel(g.method)}${g.reference ? ` · ${g.method === "check" ? "#" : ""}${g.reference}` : ""}`}
                facts={[
                  formatDay(g.paid_on),
                  multi && g.splits.map((sp) => `${firstName(sp.player_id)} ${formatAmount(sp.amount_cents)}`).join(", "),
                ]}
                note={g.note}
                by={canManage && g.recorded_by && names[g.recorded_by] ? `Recorded by ${names[g.recorded_by]}` : null}
                amount={formatAmount(g.amount_cents)}
                onVoid={
                  canManage && !g.voided
                    ? () =>
                        run(
                          g.group_id,
                          `Void this ${formatAmount(g.amount_cents)} ${methodLabel(g.method)} payment? It stays in the history, crossed out.`,
                          () => voidPayment(g.group_id)
                        )
                    : undefined
                }
                busy={busy === g.group_id}
              />
            ))}
          </div>
        )}
      </div>

      {canManage && voidedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowVoided((v) => !v)}
          style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, color: "var(--gw-fg-muted)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {showVoided ? "Hide voided" : `Show voided (${voidedCount})`}
        </button>
      )}

      {error && <ErrorNote text={error} />}
    </div>
  );
}

// One charge, credit or payment: what it is on the left (wrapping on a
// phone), the amount and Void on the right.
function Line({
  voided,
  title,
  facts,
  note,
  by,
  amount,
  onVoid,
  busy,
}: {
  voided: boolean;
  title: string;
  facts: (string | false | null | undefined)[];
  note: string | null;
  by: string | null;
  amount: string;
  onVoid?: () => void;
  busy: boolean;
}) {
  const crossed: React.CSSProperties = voided ? { textDecoration: "line-through", color: "var(--gw-fg-muted)" } : {};
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--gw-border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, ...crossed }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>
          {title}
          {voided && " (voided)"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{facts.filter(Boolean).join(" · ")}</span>
        {note && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{note}</span>}
        {by && <span style={{ fontSize: 11, color: "var(--gw-fg-faint)" }}>{by}</span>}
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", ...crossed }}>{amount}</span>
      {onVoid && <VoidButton busy={busy} onClick={onVoid} />}
    </div>
  );
}

function VoidButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: "var(--gw-fg-muted)",
        borderRadius: 100,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {busy ? "…" : "Void"}
    </button>
  );
}
