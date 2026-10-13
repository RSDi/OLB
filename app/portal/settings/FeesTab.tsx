"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Input, Pill } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { ReminderCard } from "./ReminderCard";
import { compCoachKidsNow, loadFeeSetup, saveFeeSettings, setFinancesEnabled } from "../../../lib/finances/club-actions";
import { formatAmount } from "../../../lib/finances/logic";
import type { TierInput } from "../../../lib/finances/fees";
import type { FinanceSettings } from "../../../lib/finances/club-types";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

interface Draft {
  tiers: TierInput[];
  comp_coach_kids: boolean;
  coach_comp: string;
  fundraising_rate: string;
  default_due_on: string;
}

function draftFrom(s: FinanceSettings): Draft {
  return {
    tiers: s.fee_tiers.map((t) => ({ label: t.label, max_age: t.max_age == null ? "" : String(t.max_age), amount: dollars(t.cents) })),
    comp_coach_kids: s.comp_coach_kids,
    coach_comp: s.coach_comp_cents == null ? "" : dollars(s.coach_comp_cents),
    fundraising_rate: dollars(s.fundraising_rate_cents),
    default_due_on: s.default_due_on ?? "",
  };
}

// Settings → Fees (0131): the season's registration fee tiers, the coach's
// kid comp, what a fundraiser hour earns, the default due date, and the
// switch that shows Budget, Income, Programs, Fundraising and the Snapshot
// on Payments. The Payments permission.
export function FeesTab() {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [pending, setPending] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadFeeSetup>>) => {
    if ("error" in res) return setError(res.error);
    setSettings(res.settings);
    setPending(res.pendingComps);
    setDraft(draftFrom(res.settings));
  }, []);
  const load = useCallback(async () => apply(await loadFeeSetup()), [apply]);
  useEffect(() => {
    let cancelled = false;
    loadFeeSetup().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (error && !draft) return <ErrorBox text={error} />;
  if (!draft || !settings) return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;

  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const upTier = (i: number, patch: Partial<TierInput>) => up({ tiers: draft.tiers.map((t, n) => (n === i ? { ...t, ...patch } : t)) });

  async function run(fn: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.notice) setNotice(res.notice);
    await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        What families are charged this season, and the club&apos;s own books on <Link href="/portal/payments">Finances</Link>.
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="fees-switch">
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            role="switch"
            checked={settings.enabled}
            disabled={busy}
            onChange={(e) => run(() => setFinancesEnabled(e.target.checked))}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Track the club&apos;s books on Finances</span>
            <span style={sub}>
              Adds Budget, Income, Programs, Fundraising and Snapshot to Finances, and the clinic sign-up page. Turn it off and they&apos;re
              hidden again; nothing is lost.
            </span>
          </span>
        </label>
      </div>

      <div className="rsd-card" style={card} data-tour="fees-tiers">
        <h3 style={h3}>Registration fees</h3>
        <p style={sub}>
          The registration form suggests a fee by each player&apos;s age on the season&apos;s cutoff. Leave the age blank on the oldest tier.
          Changing a fee here doesn&apos;t change what families already registered at.
          {!settings.custom_tiers && " These are the form's built-in fees until you save."}
        </p>
        {draft.tiers.map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}>
            <Input label={i === 0 ? "Tier" : undefined} aria-label="Tier" value={t.label} onChange={(e) => upTier(i, { label: e.target.value })} placeholder="8u-12u" />
            <Input label={i === 0 ? "Ages up to" : undefined} aria-label="Ages up to" inputMode="numeric" value={t.max_age} onChange={(e) => upTier(i, { max_age: e.target.value })} placeholder="and up" />
            <Input label={i === 0 ? "Fee" : undefined} aria-label="Fee" inputMode="decimal" value={t.amount} onChange={(e) => upTier(i, { amount: e.target.value })} placeholder="375" />
            <Pill size="sm" variant="ghost" onClick={() => up({ tiers: draft.tiers.filter((_, n) => n !== i) })} disabled={draft.tiers.length <= 1}>
              Remove
            </Pill>
          </div>
        ))}
        <div>
          <Pill size="sm" variant="ghost" onClick={() => up({ tiers: [...draft.tiers, { label: "", max_age: "", amount: "" }] })}>
            + Add a tier
          </Pill>
        </div>
      </div>

      <div className="rsd-card" style={card} data-tour="fees-comp">
        <h3 style={h3}>Coaches&apos; kids</h3>
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.comp_coach_kids}
            onChange={(e) => up({ comp_coach_kids: e.target.checked })}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Comp coaches&apos; kids</span>
            <span style={sub}>
              A player whose parent is a head or assistant coach (Settings → Teams) keeps the registration fee on their account, with a
              &quot;Coach&apos;s kid&quot; credit taking it off. Turn this off for next season and nothing already given changes.
            </span>
          </span>
        </label>
        {draft.comp_coach_kids && (
          <Input
            label="How much to take off"
            help="Blank: the whole registration fee."
            inputMode="decimal"
            value={draft.coach_comp}
            onChange={(e) => up({ coach_comp: e.target.value })}
            placeholder="The whole fee"
          />
        )}
        {settings.comp_coach_kids && pending > 0 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...sub, color: "var(--gw-fg)", fontWeight: 600, flex: "1 1 260px" }}>
              {pending} coach&apos;s {pending === 1 ? "kid has" : "kids have"} a registration fee and no comp yet, probably because the coach was
              put on a team after approval.
            </span>
            <Pill size="sm" variant="accent" onClick={() => run(compCoachKidsNow)} disabled={busy}>
              Comp them now
            </Pill>
          </div>
        )}
      </div>

      <div className="rsd-card" style={card} data-tour="fees-more">
        <h3 style={h3}>Fundraising and due dates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
          <Input
            label="A fundraiser hour earns"
            help={`What one hour at Nelson's Produce adds, now ${formatAmount(settings.fundraising_rate_cents)}. Each fundraiser can have its own rate on the Fundraising tab.`}
            inputMode="decimal"
            value={draft.fundraising_rate}
            onChange={(e) => up({ fundraising_rate: e.target.value })}
          />
          <Input
            label="Balances due by"
            help="Shown on every family's balance unless you give a family its own date on Payments."
            type="date"
            value={draft.default_due_on}
            onChange={(e) => up({ default_due_on: e.target.value })}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }} data-tour="fees-save">
        <Pill size="sm" variant="accent" onClick={() => run(() => saveFeeSettings(draft))} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
      </div>

      <ReminderCard />
    </div>
  );
}
