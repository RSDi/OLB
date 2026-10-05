"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../../../components/icons";
import { MapLink } from "../../../../components/MapLink";
import { Pill } from "../../../../components/ui";
import { ageFromDob } from "../../../../../lib/teams/age";
import { teamLabel } from "../../../../../lib/teams/volunteer-options";
import { indexRows, rowKey } from "../../../../../lib/requirements/logic";
import type { PlayerRequirement, Requirement } from "../../../../../lib/requirements/types";
import { buildAccounts, formatAmount } from "../../../../../lib/finances/logic";
import type { ChargeKind, PaymentsData } from "../../../../../lib/finances/types";
import type { DirectoryPlayer } from "../../_shared/data";
import { JerseyNumber, TeamDot } from "../../_shared/TeamBanner";
import { ContactLine, ParentBlock, RequirementChips, TeamPicker, formatDate, muted, playerAddress } from "../../_shared/PlayerParts";
import { RequirementDialog } from "../../RequirementDialog";
import { AccountDetail } from "../../../payments/AccountDetail";
import { ChargeDialog } from "../../../payments/ChargeDialog";
import { PaymentDialog } from "../../../payments/PaymentDialog";
import { BalanceChip } from "../../../payments/parts";
import { EditPlayerSheet } from "./EditPlayerSheet";
import { ComposeSheet, SentMessages } from "../../_shared/Messaging";
import { FAMILY_MESSAGE, playerOwnEmail, playerTarget, type SentMessage } from "../../../../../lib/teams/family-mail";
import { sendPlayerMessage } from "../../../../../lib/teams/player-message-actions";

const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

// A player's own page: the Directory card's details, links to their parents'
// and siblings' pages, requirements for the board, and the family's balance
// for the Treasurer (who can record from here) or the player's own parents.
// The Registrations grant also gets the team picker and Edit player, and it
// and the board get Email family.
export function PlayerDetail({
  player: p,
  siblings,
  isStaff,
  requirements,
  requirementRows,
  payments,
  canManageFinances,
  teams,
  canEmail,
  messages,
}: {
  player: DirectoryPlayer;
  siblings: DirectoryPlayer[];
  isStaff: boolean;
  requirements: Requirement[];
  requirementRows: PlayerRequirement[];
  // The family's charges and payments, when this viewer may see them.
  payments: PaymentsData | null;
  canManageFinances: boolean;
  // The season's teams, for the Registrations grant; null for everyone else.
  teams: { id: string; name: string; age_group: string | null }[] | null;
  // The board and the Registrations grant: Email family, and what was sent.
  canEmail: boolean;
  messages: SentMessage[];
}) {
  const [openReq, setOpenReq] = useState<Requirement | null>(null);
  const [editing, setEditing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [openMoney, setOpenMoney] = useState<"payment" | ChargeKind | null>(null);
  const rows = useMemo(() => indexRows(requirementRows), [requirementRows]);
  const account = useMemo(
    () =>
      payments ? buildAccounts(payments.players, payments.charges, payments.payments).find((a) => a.players.some((x) => x.id === p.id)) ?? null : null,
    [payments, p.id]
  );

  const age = ageFromDob(p.dob);
  const born = formatDate(p.dob);
  const addr = playerAddress(p);
  // Left off when it's a parent's: it shows with them below.
  const ownEmail = playerOwnEmail(p);
  const facts = [
    age != null && `Age ${age}`,
    born && `Born ${born}`,
    (p.age_group ?? p.team?.age_group) && `${p.age_group ?? p.team?.age_group}`,
  ].filter(Boolean);
  const staffFacts = [
    p.registration_fee && `Fee: ${p.registration_fee}`,
    // The form's chosen payment option, not a confirmed payment.
    p.payment_method && `Paying by ${p.payment_method}`,
    p.shirt_size && `Shirt: ${p.shirt_size}`,
    p.waiver_signed && p.waiver_signed_on && `Waiver signed ${formatDate(p.waiver_signed_on)}`,
  ].filter(Boolean);

  return (
    <>
      <Link
        href="/portal/directory"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", alignSelf: "flex-start" }}
      >
        <Icons.ChevronLeft width={14} height={14} />
        Back to directory
      </Link>

      <div className="rsd-card" data-tour="player-card" style={{ padding: "20px 22px", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {p.jersey_number != null && <JerseyNumber n={p.jersey_number} size={36} />}
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, lineHeight: 1.15, color: "var(--gw-fg)" }}>{p.full_name}</h1>
          {p.team ? (
            <Link href={`/portal/directory/teams/${p.team.id}`} className="rsd-chip rsd-chip-mute" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TeamDot color={p.team.color} size={8} />
              {teamLabel(p.team)}
            </Link>
          ) : (
            <span className="rsd-chip rsd-chip-mute">No team yet</span>
          )}
          {p.new_to_program && <span className="rsd-chip rsd-chip-accent">New</span>}
          {isStaff && !p.waiver_signed && <span className="rsd-chip rsd-chip-error">No waiver</span>}
          {!p.directory_optin && <span className="rsd-chip rsd-chip-mute">Not in directory</span>}
          {(canEmail || teams) && (
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
              {canEmail && (
                <span data-tour="player-email" style={{ display: "inline-flex" }}>
                  <Pill size="sm" variant="light" onClick={() => setEmailing(true)}>
                    <Icons.Mail width={13} height={13} /> Email family
                  </Pill>
                </span>
              )}
              {teams && (
                <span data-tour="player-edit" style={{ display: "inline-flex" }}>
                  <Pill size="sm" variant="dark" onClick={() => setEditing(true)}>
                    Edit player
                  </Pill>
                </span>
              )}
            </span>
          )}
        </div>
        {facts.length > 0 && <div style={{ ...muted, fontSize: 13 }}>{facts.join(" · ")}</div>}
        {addr && (
          <MapLink
            address={addr}
            icon={<Icons.MapPin width={13} height={13} style={{ flexShrink: 0, marginTop: 2, color: "var(--gw-fg-muted)" }} />}
            style={{ ...muted, fontSize: 13, color: "var(--gw-fg)", display: "flex", gap: 6, alignItems: "flex-start", alignSelf: "flex-start" }}
          />
        )}
        {(p.phone || ownEmail) && <ContactLine phone={p.phone} email={ownEmail} label="Player" />}
        {isStaff && staffFacts.length > 0 && <div style={muted}>{staffFacts.join(" · ")}</div>}
        {isStaff && requirements.length > 0 && (
          <RequirementChips player={p} requirements={requirements} rows={rows} onOpen={setOpenReq} />
        )}
        {teams && <TeamPicker player={p} teams={teams} />}
      </div>

      <div className="rsd-card" data-tour="player-parents" style={{ padding: "16px 20px", gap: 12 }}>
        <span style={cap}>{p.parents.length === 1 ? "Parent" : "Parents"}</span>
        {p.parents.length === 0 ? (
          <div style={muted}>No parent info on the registration.</div>
        ) : (
          p.parents.map((pa) => <ParentBlock key={pa.member!.id} parent={pa} isStaff={isStaff} />)
        )}
        {siblings.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", borderTop: "1px solid var(--gw-border)", paddingTop: 12 }}>
            <span style={{ ...cap, minWidth: 80 }}>{siblings.length === 1 ? "Sibling" : "Siblings"}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {siblings.map((s) => (
                <Link
                  key={s.id}
                  href={`/portal/directory/players/${s.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 100,
                    background: "var(--rsd-accent-bg)",
                    color: "var(--rsd-accent)",
                    border: "1px solid var(--rsd-accent-line)",
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {s.full_name}
                  {s.team && <span style={{ opacity: 0.75 }}>{teamLabel(s.team)}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {canEmail && messages.length > 0 && (
        <div className="rsd-card" style={{ padding: "14px 20px" }}>
          <SentMessages messages={messages} />
        </div>
      )}

      {account && (
        <div className="rsd-card" data-tour="player-payments" style={{ padding: "16px 20px", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={cap}>{account.players.length > 1 ? `${account.name} family payments` : "Payments"}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                {formatAmount(account.totals.charged - account.totals.credited)} due · {formatAmount(account.totals.paid)} paid
              </span>
            </div>
            <BalanceChip totals={account.totals} />
          </div>
          {canManageFinances && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Pill size="sm" variant="accent" onClick={() => setOpenMoney("payment")}>
                <Icons.Plus width={13} height={13} /> Record payment
              </Pill>
              <Pill size="sm" variant="light" onClick={() => setOpenMoney("charge")}>
                Add a charge
              </Pill>
              <Pill size="sm" variant="light" onClick={() => setOpenMoney("credit")}>
                Take off an amount
              </Pill>
              <Link
                href={`/portal/payments?family=${p.id}`}
                style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                Open in Payments
                <Icons.ChevronRight width={12} height={12} />
              </Link>
            </div>
          )}
          <AccountDetail account={account} canManage={canManageFinances} names={payments?.names ?? {}} />
        </div>
      )}

      {openReq && (
        <RequirementDialog
          player={p}
          requirement={openReq}
          row={rows.get(rowKey(p.id, openReq.id)) ?? null}
          onClose={() => setOpenReq(null)}
        />
      )}
      {editing && <EditPlayerSheet player={p} onClose={() => setEditing(false)} />}
      {emailing && (
        <ComposeSheet
          targets={[playerTarget(p)]}
          title="Email the family"
          eyebrow={p.full_name}
          note="Sent from the club's email address. Replies go to the club's Gmail. A copy is kept on this page."
          subject=""
          body={FAMILY_MESSAGE}
          onSend={sendPlayerMessage}
          onClose={() => setEmailing(false)}
        />
      )}
      {account && openMoney === "payment" && <PaymentDialog account={account} onClose={() => setOpenMoney(null)} />}
      {account && (openMoney === "charge" || openMoney === "credit") && (
        <ChargeDialog account={account} kind={openMoney} onClose={() => setOpenMoney(null)} />
      )}
    </>
  );
}
