"use client";
import { useMemo } from "react";
import { balanceState, buildAccounts, formatAmount } from "../../../lib/finances/logic";
import { PAYMENT_INSTRUCTIONS, type PaymentsData } from "../../../lib/finances/types";
import { AccountDetail } from "./AccountDetail";
import { capStyle } from "./parts";

// A parent's own balance: what's owed for their kids, what's been paid, and
// how to pay. Read-only.
export function FamilyView({ data }: { data: PaymentsData }) {
  const accounts = useMemo(() => buildAccounts(data.players, data.charges, data.payments), [data]);

  if (accounts.every((a) => a.charges.length === 0 && a.payments.length === 0)) {
    return (
      <Card>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Nothing on your account yet</span>
        <span style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
          Your {data.board.season} fees will show here once the Treasurer adds them.
        </span>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      {accounts.map((a) => {
        const st = balanceState(a.totals);
        return (
          <div key={a.key} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <span style={capStyle}>
                {a.players.map((p) => p.full_name.split(/\s+/)[0]).join(", ")} · {data.board.season}
              </span>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
                {st === "owes"
                  ? `${formatAmount(a.totals.balance)} due`
                  : st === "credit"
                    ? `${formatAmount(-a.totals.balance)} credit`
                    : "Paid in full"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                {formatAmount(a.totals.charged - a.totals.credited)} for the season · {formatAmount(a.totals.paid)} paid
                {st === "paid" && " · thank you!"}
              </span>
            </Card>

            {st === "owes" && (
              <Card>
                <span style={{ fontSize: 14, fontWeight: 700 }}>How to pay</span>
                <span style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
                  Venmo{" "}
                  <a href={PAYMENT_INSTRUCTIONS.venmoUrl} target="_blank" rel="noreferrer" style={{ color: "var(--rsd-accent)", fontWeight: 700 }}>
                    {PAYMENT_INSTRUCTIONS.venmoHandle}
                  </a>{" "}
                  and put your player&apos;s name in the note, or pay by check. It shows here once the Treasurer records
                  it. Questions about your balance? Email{" "}
                  <a href={`mailto:${PAYMENT_INSTRUCTIONS.email}`} style={{ color: "var(--rsd-accent)", fontWeight: 700 }}>
                    {PAYMENT_INSTRUCTIONS.email}
                  </a>
                  .
                </span>
              </Card>
            )}

            <Card>
              <AccountDetail account={a} canManage={false} />
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rsd-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  );
}
