"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { ClearSearchButton, KpiCard, Pill } from "../../components/ui";
import { addRegistrationFees, setParentBalancesVisible } from "../../../lib/finances/actions";
import { setFamilyDue } from "../../../lib/finances/club-actions";
import {
  balanceState,
  buildAccounts,
  categoryLabel,
  formatAmount,
  formatDollars,
  groupPayments,
  ledgerCsv,
  methodLabel,
  registrationFeeCents,
  sumTotals,
  type Account,
  type LedgerRow,
} from "../../../lib/finances/logic";
import type { ChargeKind, PaymentsData } from "../../../lib/finances/types";
import { AccountDetail } from "./AccountDetail";
import { ChargeDialog } from "./ChargeDialog";
import { PaymentDialog } from "./PaymentDialog";
import { BalanceChip, ErrorNote, SegButton, SegGroup, formatDay } from "./parts";
import { VenmoMatch } from "./VenmoMatch";
import { ComposeSheet } from "../directory/_shared/Messaging";
import { SlackComposeSheet, type SlackApi } from "../directory/_shared/SlackMessaging";
import { checkFinanceSlack, financeSlackStatus, pauseReminders, sendFinanceEmail, sendFinanceSlack } from "../../../lib/finances/message-actions";
import { BALANCE_TOKEN_HELP, fillMoney, moneyFor } from "../../../lib/finances/reminders";
import { playerTarget, type MailTarget } from "../../../lib/teams/family-mail";
import type { FinanceSlackCheck } from "../../../lib/finances/message-actions";
import { SlackLogo } from "../../components/SlackLogo";

type Show = "owes" | "paid" | "all";
type Open = { kind: "payment"; account: Account } | { kind: ChargeKind; account: Account } | null;
// Writing to families (0133): everyone listed, or one family.
type Compose = { via: "email" | "slack"; accounts: Account[] } | null;

const FINANCE_SLACK: SlackApi = {
  status: (from) => financeSlackStatus(from),
  check: (ids, roles, from) => checkFinanceSlack(ids, roles, from),
  send: (ids, roles, body, emails, from) => sendFinanceSlack(ids, roles, body, emails, from),
};

const EMAIL_START = { subject: "Omaha Lightning: your balance", body: "Hi {family} family,\n\n" };

function targetsOf(accounts: Account[]): MailTarget[] {
  return accounts.flatMap((a) =>
    a.players.map((p) =>
      playerTarget({
        id: p.id,
        full_name: p.full_name,
        email: null,
        parents: p.parents.map((x) => ({ relationship: x.relationship, member: x.member ? { full_name: x.member.full_name, email: x.member.email } : null })),
      })
    )
  );
}

// The Treasurer's view: the season's totals, every family's balance, and
// recording what comes in.
export function TreasurerView({
  data,
  openPlayerId = null,
  venmo = false,
  club = false,
  dues = {},
  defaultDue = null,
  paused = [],
}: {
  data: PaymentsData;
  openPlayerId?: string | null;
  venmo?: boolean;
  // Club finances (0131): its charge categories and each family's due date.
  club?: boolean;
  dues?: Record<string, string>;
  defaultDue?: string | null;
  // Players whose family is off the weekly reminder (0133).
  paused?: string[];
}) {
  const router = useRouter();
  const accounts = useMemo(() => buildAccounts(data.players, data.charges, data.payments), [data]);
  // "Open in Payments" from a player page lands here with that family open.
  const linked = openPlayerId ? accounts.find((a) => a.players.some((p) => p.id === openPlayerId))?.key ?? null : null;
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>(linked ? "all" : "owes");
  const [expanded, setExpanded] = useState<string | null>(linked);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [compose, setCompose] = useState<Compose>(null);
  // {balance}, {due_date} and {family} as each family's message will read.
  const moneyAccounts = useMemo(() => accounts.map((a) => ({ playerIds: a.players.map((p) => p.id), balanceCents: a.totals.balance, name: a.name })), [accounts]);
  const moneyText = (text: string, ids: string[]) => fillMoney(text, moneyFor(ids, moneyAccounts, dues, defaultDue));
  const pausedSet = useMemo(() => new Set(paused), [paused]);
  const [error, setError] = useState<string | null>(null);
  // Match Venmo (0130), with the registration workflow.
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    if (linked) document.getElementById(`family-${linked}`)?.scrollIntoView({ block: "start" });
  }, [linked]);
  // The open account, rebuilt from fresh data after a save.
  const openAccount = open ? accounts.find((a) => a.key === open.account.key) ?? open.account : null;
  const season = sumTotals(accounts);
  const owing = accounts.filter((a) => balanceState(a.totals) === "owes");
  const paidUp = accounts.filter((a) => ["paid", "credit"].includes(balanceState(a.totals)));
  const paymentCount = new Set(data.payments.filter((p) => !p.voided_at).map((p) => p.group_id)).size;

  // Registered players still without a registration fee on their account.
  const charged = new Set(
    data.charges.filter((c) => c.category === "registration" && !c.voided_at).map((c) => c.player_id)
  );
  const needFee = data.players.filter((p) => p.registered_at && !charged.has(p.id));
  const needFeeWithTier = needFee.filter((p) => registrationFeeCents(p.registration_fee) != null);

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const shown = accounts.filter((a) => {
    const st = balanceState(a.totals);
    if (show === "owes" && st !== "owes") return false;
    if (show === "paid" && st !== "paid" && st !== "credit") return false;
    if (!q) return true;
    const hay = [
      a.name,
      ...a.players.map((p) => p.full_name),
      ...a.parents.flatMap((pa) => [pa.full_name ?? "", pa.email ?? ""]),
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    return digits.length >= 3 && a.parents.some((pa) => (pa.phone ?? "").replace(/\D/g, "").includes(digits));
  });

  async function toggleParents(visible: boolean) {
    if (
      visible &&
      !confirm(
        "Show every family their balance on the Payments page? Make sure payments are entered first, so nobody sees an amount they've already paid."
      )
    )
      return;
    setBusy("parents");
    setError(null);
    const res = await setParentBalancesVisible(visible);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function addFees() {
    setBusy("fees");
    setError(null);
    setMessage(null);
    const res = await addRegistrationFees();
    setBusy(null);
    if (res.error) return setError(res.error);
    const added = res.added ?? 0;
    const missing = res.missing ?? [];
    setMessage(
      `Added ${added} registration ${added === 1 ? "fee" : "fees"}.` +
        (missing.length > 0
          ? ` No fee tier on the registration for ${missing.join(", ")} — add theirs with Add a charge.`
          : "")
    );
    router.refresh();
  }

  function download() {
    const name = new Map<string, string>();
    const family = new Map<string, string>();
    for (const a of accounts) {
      for (const p of a.players) {
        name.set(p.id, p.full_name);
        family.set(p.id, a.name);
      }
    }
    const rows: LedgerRow[] = [];
    for (const c of data.charges) {
      if (c.voided_at) continue;
      rows.push({
        date: c.entry_date,
        family: family.get(c.player_id) ?? "",
        player: name.get(c.player_id) ?? "",
        type: c.kind === "credit" ? "Credit" : "Charge",
        what: c.description || categoryLabel(c.kind, c.category),
        method: "",
        reference: "",
        amount_cents: c.kind === "credit" ? -c.amount_cents : c.amount_cents,
        note: c.note ?? "",
      });
    }
    for (const g of groupPayments(data.payments)) {
      if (g.voided) continue;
      for (const s of g.splits) {
        rows.push({
          date: g.paid_on,
          family: family.get(s.player_id) ?? "",
          player: name.get(s.player_id) ?? "",
          type: "Payment",
          what: "Payment",
          method: methodLabel(g.method),
          reference: g.reference ?? "",
          amount_cents: -s.amount_cents,
          note: g.note ?? "",
        });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.family.localeCompare(b.family));
    const blob = new Blob([ledgerCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payments-${data.board.season}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Money is wider than a count, so the tile numbers shrink with the
          screen instead of pushing the page wider than a phone. */}
      <div
        className="rsd-kpi-grid"
        data-tour="payments-totals"
        style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}
      >
        <KpiCard label="Charged" value={formatDollars(season.charged)} sub={`${data.players.length} players`} />
        <KpiCard label="Taken off" value={formatDollars(season.credited)} sub="Covered, scholarships and fundraising" />
        <KpiCard label="Paid" value={formatDollars(season.paid)} sub={`${paymentCount} ${paymentCount === 1 ? "payment" : "payments"}`} />
        <KpiCard
          label="Still owed"
          value={formatDollars(Math.max(0, owing.reduce((n, a) => n + a.totals.balance, 0)))}
          sub={`${owing.length} ${owing.length === 1 ? "family" : "families"}`}
          accent={owing.length > 0}
        />
      </div>

      <div
        className="rsd-card"
        data-tour="payments-parents"
        style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", textAlign: "left" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 280px" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Parents can see their balance</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
            {data.board.parent_balances_visible
              ? "On: each family sees what they owe and what they've paid under Payments."
              : "Off: only you see balances. Turn it on once this season's payments are entered."}
          </span>
        </div>
        <SegGroup label="Parents can see their balance">
          <SegButton label="Off" active={!data.board.parent_balances_visible} onClick={() => busy !== "parents" && data.board.parent_balances_visible && toggleParents(false)} />
          <SegButton label="On" active={data.board.parent_balances_visible} onClick={() => busy !== "parents" && !data.board.parent_balances_visible && toggleParents(true)} />
        </SegGroup>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 440 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gw-fg-muted)", display: "flex" }}>
            <Icons.Search width={14} height={14} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search families, players, parents or phones"
            aria-label="Search families"
            style={{
              width: "100%",
              height: 40,
              padding: "0 40px 0 36px",
              borderRadius: 10,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 500,
            }}
          />
          {query && <ClearSearchButton onClear={() => setQuery("")} />}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span data-tour="payments-filter">
            <SegGroup label="Show families">
              <SegButton label={`Owes ${owing.length}`} active={show === "owes"} onClick={() => setShow("owes")} />
              <SegButton label={`Paid up ${paidUp.length}`} active={show === "paid"} onClick={() => setShow("paid")} />
              <SegButton label={`All ${accounts.length}`} active={show === "all"} onClick={() => setShow("all")} />
            </SegGroup>
          </span>
          {club && (
            <span data-tour="payments-message" style={{ display: "inline-flex", gap: 8 }}>
              <Pill size="sm" variant="ghost" onClick={() => setCompose({ via: "email", accounts: shown })} disabled={shown.length === 0}>
                <Icons.Mail width={13} height={13} /> Email families
              </Pill>
              <Pill size="sm" variant="ghost" onClick={() => setCompose({ via: "slack", accounts: shown })} disabled={shown.length === 0}>
                <SlackLogo size={13} /> Slack families
              </Pill>
            </span>
          )}
          <Pill size="sm" variant="ghost" onClick={download}>
            <Icons.Download width={13} height={13} /> Download spreadsheet
          </Pill>
          {venmo && !matching && (
            <Pill size="sm" variant="ghost" onClick={() => setMatching(true)}>
              Match Venmo
            </Pill>
          )}
        </div>
      </div>

      {matching && <VenmoMatch onClose={() => setMatching(false)} />}

      {needFee.length > 0 && (
        <div
          className="rsd-card"
          data-tour="payments-fees"
          style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", textAlign: "left" }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 280px", lineHeight: 1.5 }}>
            {needFee.length} registered {needFee.length === 1 ? "player doesn't" : "players don't"} have a registration
            fee on their account yet.
            {needFeeWithTier.length < needFee.length &&
              ` ${needFee.length - needFeeWithTier.length} ${needFee.length - needFeeWithTier.length === 1 ? "has" : "have"} no fee tier on their registration — add theirs by hand.`}
          </span>
          {needFeeWithTier.length > 0 && (
            <Pill size="sm" variant="accent" onClick={addFees} disabled={busy === "fees"}>
              {busy === "fees" ? "Adding…" : "Add registration fees"}
            </Pill>
          )}
        </div>
      )}

      {message && (
        <div className="rsd-card" role="status" style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
          {message}
        </div>
      )}
      {error && <ErrorNote text={error} />}

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {shown.length} {shown.length === 1 ? "family" : "families"} · {data.board.season} season
      </div>

      {accounts.length === 0 ? (
        <Empty text="No players on this season's roster yet." />
      ) : shown.length === 0 ? (
        <Empty text={show === "owes" && !q ? "Nobody owes anything right now." : "No families match."} />
      ) : (
        <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {shown.map((a, i) => (
            <FamilyRow
              key={a.key}
              account={a}
              border={i < shown.length - 1}
              expanded={expanded === a.key}
              onToggle={() => setExpanded(expanded === a.key ? null : a.key)}
              onOpen={(kind) => setOpen({ kind, account: a } as Open)}
              names={data.names}
              due={club ? { date: a.players.map((p) => dues[p.id]).filter(Boolean).sort()[0] ?? null, fallback: defaultDue } : null}
              messaging={club ? { paused: a.players.some((p) => pausedSet.has(p.id)), onWrite: (via) => setCompose({ via, accounts: [a] }) } : null}
            />
          ))}
        </div>
      )}

      {compose?.via === "email" && (
        <ComposeSheet
          targets={targetsOf(compose.accounts)}
          title={compose.accounts.length === 1 ? "Email the family" : "Email families"}
          eyebrow={compose.accounts.length === 1 ? `${compose.accounts[0].name} family` : `${compose.accounts.length} families listed`}
          note={
            compose.accounts.length === 1
              ? "One email to the family, with what they owe filled in. A copy is kept on each player's page."
              : "One email to each family listed here, with what each one owes filled in. A copy is kept on each player's page."
          }
          subject={EMAIL_START.subject}
          body={EMAIL_START.body}
          messageHelp={BALANCE_TOKEN_HELP}
          fillPreview={(text, players) => moneyText(text, players.map((p) => p.id))}
          onSend={(ids, subject, body, roles) => sendFinanceEmail(ids, subject, body, roles)}
          onClose={() => setCompose(null)}
        />
      )}
      {compose?.via === "slack" && (
        <SlackComposeSheet
          targets={targetsOf(compose.accounts)}
          eyebrow={compose.accounts.length === 1 ? `${compose.accounts[0].name} family` : `${compose.accounts.length} families listed`}
          api={FINANCE_SLACK}
          allowBot
          messageHelp={`{name} becomes each person's first name. ${BALANCE_TOKEN_HELP}`}
          fillPreview={(text, person) => {
            const money = (person as FinanceSlackCheck).money;
            return money ? fillMoney(text, money) : text;
          }}
          onClose={() => setCompose(null)}
        />
      )}

      {open && openAccount && open.kind === "payment" && (
        <PaymentDialog account={openAccount} onClose={() => setOpen(null)} />
      )}
      {open && openAccount && open.kind !== "payment" && (
        <ChargeDialog account={openAccount} kind={open.kind} onClose={() => setOpen(null)} club={club} />
      )}
    </div>
  );
}

function FamilyRow({
  account: a,
  border,
  expanded,
  onToggle,
  onOpen,
  names,
  due,
  messaging = null,
}: {
  account: Account;
  border: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (kind: "payment" | ChargeKind) => void;
  names: Record<string, string>;
  // Club finances (0131): the family's own due date, else the season's.
  due: { date: string | null; fallback: string | null } | null;
  // Writing to the family, and whether they're off the weekly reminder (0133).
  messaging?: { paused: boolean; onWrite: (via: "email" | "slack") => void } | null;
}) {
  const kids = a.players
    .map((p) => {
      const where = p.team?.name ?? p.age_group;
      return where ? `${p.full_name} (${where})` : p.full_name;
    })
    .join(", ");
  const parents = a.parents.map((pa) => pa.full_name).filter(Boolean).join(" & ");

  return (
    <div id={`family-${a.key}`} style={{ borderBottom: border ? "1px solid var(--gw-border)" : "none", scrollMarginTop: 16 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-tour="payments-family"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          border: "none",
          background: expanded ? "var(--gw-bg)" : "transparent",
          color: "var(--gw-fg)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{kids}</span>
          {parents && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-faint)" }}>{parents}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 1, maxWidth: "45%" }}>
          <BalanceChip totals={a.totals} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--gw-fg-muted)", textAlign: "right" }}>
            {formatAmount(a.totals.charged - a.totals.credited)} due · {formatAmount(a.totals.paid)} paid
            {due && balanceState(a.totals) === "owes" && (due.date ?? due.fallback) ? ` · by ${formatDay((due.date ?? due.fallback)!)}` : ""}
          </span>
        </div>
        <span style={{ color: "var(--gw-fg-muted)", display: "flex", flexShrink: 0 }}>
          {expanded ? <Icons.ChevronUp width={16} height={16} /> : <Icons.ChevronDown width={16} height={16} />}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 14, background: "var(--gw-bg)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="payments-actions">
            <Pill size="sm" variant="accent" onClick={() => onOpen("payment")}>
              <Icons.Plus width={13} height={13} /> Record payment
            </Pill>
            <Pill size="sm" variant="light" onClick={() => onOpen("charge")}>
              Add a charge
            </Pill>
            <Pill size="sm" variant="light" onClick={() => onOpen("credit")}>
              Take off an amount
            </Pill>
          </div>
          {a.parents.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", display: "flex", flexDirection: "column", gap: 2, overflowWrap: "anywhere" }}>
              {a.parents.map((pa) => (
                <span key={pa.id}>
                  <Link
                    href={`/portal/directory/${pa.id}`}
                    data-tour="payments-parent-link"
                    style={{ color: "var(--gw-fg)", fontWeight: 700, textDecoration: "none" }}
                  >
                    {pa.full_name ?? pa.email ?? "Parent"}
                  </Link>
                  {[pa.email, pa.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}
                </span>
              ))}
            </div>
          )}
          {due && <DueDate account={a} date={due.date} fallback={due.fallback} />}
          {messaging && <FamilyMessaging account={a} paused={messaging.paused} onWrite={messaging.onWrite} />}
          <AccountDetail account={a} canManage names={names} />
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
    </div>
  );
}

// The family's due date (0131): their own, or the season's from Settings → Fees.
function DueDate({ account, date, fallback }: { account: Account; date: string | null; fallback: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(next: string) {
    setBusy(true);
    setError(null);
    const res = await setFamilyDue(
      account.players.map((p) => p.id),
      next
    );
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, fontWeight: 600 }} data-tour="payments-due">
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        Due by
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)", color: "var(--gw-fg)", fontSize: 13 }}
        />
      </label>
      {value !== (date ?? "") && (
        <Pill size="sm" variant="accent" onClick={() => save(value)} disabled={busy}>
          Save date
        </Pill>
      )}
      {date && value === date && (
        <Pill size="sm" variant="ghost" onClick={() => save("")} disabled={busy}>
          Use the season&apos;s date
        </Pill>
      )}
      {!date && <span style={{ color: "var(--gw-fg-muted)" }}>{fallback ? `The season's date: ${formatDay(fallback)}` : "No season date set (Settings → Fees)"}</span>}
      {error && <span style={{ color: "var(--gw-error)" }}>{error}</span>}
    </div>
  );
}

// Email or Slack the family, and take them off the weekly reminder (a
// payment plan, say) or put them back on.
function FamilyMessaging({ account, paused, onWrite }: { account: Account; paused: boolean; onWrite: (via: "email" | "slack") => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await pauseReminders(
      account.players.map((p) => p.id),
      !paused
    ).catch(() => ({ error: "That didn't work. Try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-tour="payments-family-message">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill size="sm" variant="light" onClick={() => onWrite("email")}>
          <Icons.Mail width={13} height={13} /> Email family
        </Pill>
        <Pill size="sm" variant="light" onClick={() => onWrite("slack")}>
          <SlackLogo size={13} /> Slack family
        </Pill>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
          <input type="checkbox" checked={!paused} disabled={busy} onChange={toggle} />
          Weekly reminder
          {paused && <span className="rsd-chip rsd-chip-mute">Paused</span>}
        </label>
      </div>
      {error && <ErrorNote text={error} />}
    </div>
  );
}
