"use client";
// Pieces the club finances tabs (0131) share: the tab bar, budget bars, the
// busy/error/notice plumbing and small form bits.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAmount } from "../../../lib/finances/logic";
import { overBudget, type Spend } from "../../../lib/finances/club-logic";
import { EXPENSE_METHODS } from "../../../lib/finances/club-types";
import { SegButton, SegGroup, capStyle } from "./parts";
import { usePageHelp } from "../../components/PageHelp";

export type PaymentsTab = "families" | "budget" | "income" | "programs" | "fundraising" | "snapshot" | "balance";

const TABS: Record<PaymentsTab, { label: string; tour: string }> = {
  families: { label: "Families", tour: "payments-tab-families" },
  budget: { label: "Budget", tour: "payments-tab-budget" },
  income: { label: "Income", tour: "payments-tab-income" },
  programs: { label: "Programs", tour: "payments-tab-programs" },
  fundraising: { label: "Fundraising", tour: "payments-tab-fundraising" },
  snapshot: { label: "Snapshot", tour: "payments-tab-snapshot" },
  balance: { label: "Your balance", tour: "payments-tab-balance" },
};

// The User Guide section for each tab, so the top-bar "i" (and its "Show me
// around") match the open tab. Families and Your balance keep the page's own.
const TAB_HELP: Partial<Record<PaymentsTab, string>> = {
  budget: "payments-budget",
  income: "payments-income",
  programs: "payments-programs",
  fundraising: "payments-fundraising",
  snapshot: "payments-snapshot",
};

// Payments' tabs, as links so each has its own address.
export function PaymentsTabs({ tabs, active }: { tabs: PaymentsTab[]; active: PaymentsTab }) {
  usePageHelp(TAB_HELP[active] ?? null);
  // On a phone the tabs scroll sideways: keep the open one in view.
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => current.current?.scrollIntoView({ block: "nearest", inline: "nearest" }), [active]);
  return (
    <nav aria-label="Payments" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid var(--gw-border)", marginBottom: 4 }}>
      {tabs.map((t) => (
        <Link
          key={t}
          href={t === tabs[0] ? "/portal/payments" : `/portal/payments?tab=${t}`}
          ref={t === active ? current : undefined}
          aria-current={t === active ? "page" : undefined}
          data-tour={TABS[t].tour}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            textDecoration: "none",
            color: t === active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
            borderBottom: `2px solid ${t === active ? "var(--rsd-accent)" : "transparent"}`,
            marginBottom: -1,
          }}
        >
          {TABS[t].label}
        </Link>
      ))}
    </nav>
  );
}

// "$1,250.00 of $2,300.00" with a bar; red past the budget.
export function SpendBar({ spend, compact = false }: { spend: Spend; compact?: boolean }) {
  const over = overBudget(spend);
  const pct = spend.budget > 0 ? Math.min(100, Math.round((spend.paid / spend.budget) * 100)) : spend.paid > 0 ? 100 : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: compact ? 120 : 160, alignItems: "flex-end" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", color: over ? "var(--gw-error)" : "var(--gw-fg)" }}>
        {formatAmount(spend.paid)}
        <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}>{spend.budget > 0 ? ` of ${formatAmount(spend.budget)}` : " · no budget"}</span>
      </span>
      <div aria-hidden style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--gw-border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: over ? "var(--gw-error)" : spend.budget > 0 ? "var(--rsd-accent)" : "var(--gw-fg-faint)" }} />
      </div>
    </div>
  );
}

// Runs a server action with busy, error and notice states, and refreshes
// the page's data after.
export function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // False when it failed; otherwise what it said, for a sheet that closes.
  async function act(fn: () => Promise<{ error?: string; notice?: string }>, done?: string): Promise<false | { notice: string | null }> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn().catch(() => ({ error: "Something went wrong. Try again." }) as { error?: string; notice?: string });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return false;
    }
    setNotice(res.notice ?? done ?? null);
    router.refresh();
    return { notice: res.notice ?? done ?? null };
  }
  return { busy, error, notice, setError, setNotice, act };
}

export function Notice({ text }: { text: string }) {
  return (
    <div className="rsd-card" role="status" style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
      {text}
    </div>
  );
}

export function MethodPicker({ value, onChange, label = "How it was paid" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={capStyle}>{label}</span>
      <SegGroup label={label}>
        {EXPENSE_METHODS.map((m) => (
          <SegButton key={m.key} label={m.label} active={value === m.key} onClick={() => onChange(m.key)} />
        ))}
      </SegGroup>
    </div>
  );
}

export const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

export const linkBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  color: "var(--rsd-accent)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

export function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ padding: "36px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

// A plain <select> styled like the app's inputs, with a label.
export function PickField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={capStyle}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 42, padding: "0 10px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 14 }}
      >
        {children}
      </select>
    </label>
  );
}
