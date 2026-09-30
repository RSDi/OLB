"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { ageFromDob } from "../../../../lib/teams/age";
import { approveRegistration, rejectRegistration } from "../../../../lib/teams/registration-actions";
import type { PendingRegistration } from "../../../../lib/teams/registration-data";
import type { RegistrationParentAnswers } from "../../../../lib/teams/roster-logic";
import { teamLabel } from "../../../../lib/teams/volunteer-options";
import { formatDollars, registrationFeeCents, registrationTier } from "../../../../lib/finances/logic";
import { ContactLine, formatDate, muted } from "../_shared/PlayerParts";
import { ErrorNote, capStyle } from "../../payments/parts";

// The review queue: one card per registration with what the family filled
// in, and Approve / Not this season.
export function RegistrationsReview({ registrations }: { registrations: PendingRegistration[] }) {
  return (
    <>
      <Link
        href="/portal/directory"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", alignSelf: "flex-start" }}
      >
        <Icons.ChevronLeft width={14} height={14} />
        Back to directory
      </Link>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
          {registrations.length === 0
            ? "Nothing waiting"
            : `${registrations.length} waiting, oldest first · from the registration form`}
        </span>
        <a
          href="/player-registration"
          target="_blank"
          rel="noreferrer"
          data-tour="registrations-form-link"
          style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Open the registration form
          <Icons.ChevronRight width={12} height={12} />
        </a>
      </div>

      {registrations.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No new registrations. When a family fills in the registration form, it shows up here.
          </div>
        </div>
      ) : (
        registrations.map((r) => <RegistrationCard key={r.id} reg={r} />)
      )}
    </>
  );
}

function RegistrationCard({ reg }: { reg: PendingRegistration }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const x = reg.extra;
  const name = `${reg.first_name} ${reg.last_name}`.trim();
  const age = ageFromDob(reg.dob);
  const born = formatDate(reg.dob);
  const cents = registrationFeeCents(x.fee_tier);
  const tier = registrationTier(x.fee_tier);
  const fee = cents != null ? formatDollars(cents) : null;
  const address = [x.address?.line1, x.address?.line2, [x.address?.city, [x.address?.state, x.address?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
  const signedBy = x.printed_name?.trim() || x.signature_name?.trim();
  const facts: [string, string][] = [
    ["Paying by", x.payment_option?.trim() || "Not answered"],
    [
      "Waiver",
      x.waiver_agreed
        ? `Signed${signedBy ? ` by ${signedBy}` : ""}${x.signature_date ? ` · ${formatDate(x.signature_date)}` : ""}`
        : "Not signed",
    ],
    ["Homeschool rules", x.homeschool_affirm === true ? "Meets them" : x.homeschool_affirm === false ? "Doesn't meet them" : "Not answered"],
    [
      "Uniform",
      [
        x.needs_uniform === true ? "Needs a uniform" : x.needs_uniform === false ? "Has one" : "Not answered",
        x.needs_grays === true && "needs grays",
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    ["Directory", x.directory_optin === false ? "Not listed" : "Listed"],
  ];
  const parents = (
    [
      ["Father", x.father],
      ["Mother", x.mother],
    ] as [string, RegistrationParentAnswers | undefined][]
  ).filter(([, p]) => [p?.first, p?.last].some((s) => s?.trim() && !/^n\/?a$/i.test(s.trim())));

  async function run(kind: "approve" | "reject") {
    if (kind === "reject" && !confirm(`Take ${name} off the list for this season? They won't be added to the roster.`)) return;
    setBusy(kind);
    setError(null);
    const res = kind === "approve" ? await approveRegistration(reg.id) : await rejectRegistration(reg.id);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <article className="rsd-card" data-tour="registration-card" style={{ padding: "18px 20px", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--gw-fg)" }}>{name}</h2>
            {x.first_season === true ? (
              <span className="rsd-chip rsd-chip-accent">First season</span>
            ) : x.first_season === false ? (
              <span className="rsd-chip rsd-chip-mute">Returning</span>
            ) : null}
          </div>
          <span style={muted}>
            {[age != null && `Age ${age}`, born && `Born ${born}`, `Registered ${formatDate(reg.created_at.slice(0, 10))}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {address && (
            <span style={{ ...muted, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2 }} />
              {address}
            </span>
          )}
          <ContactLine phone={x.athlete_phone ?? null} email={x.athlete_email ?? null} label="Player" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginLeft: "auto" }}>
          <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: "var(--gw-fg)", fontVariantNumeric: "tabular-nums" }}>
            {fee ?? "No fee picked"}
          </span>
          {fee && <span style={muted}>{tier ? `${tier} registration fee` : "Registration fee"}</span>}
        </div>
      </div>

      {reg.match && <MatchNote reg={reg} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {facts.map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...capStyle, fontSize: 10 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>{value}</span>
          </div>
        ))}
      </div>

      {parents.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--gw-border)",
          }}
        >
          {parents.map(([rel, p]) => {
            const helps = [...(p?.volunteer ?? []), p?.volunteer_other?.trim()].filter(Boolean).join(", ");
            return (
              <div key={rel} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...capStyle, fontSize: 10, minWidth: 52 }}>{rel}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
                    {[p?.first, p?.last].map((s) => s?.trim()).filter(Boolean).join(" ")}
                  </span>
                </div>
                <div style={{ paddingLeft: 60 }}>
                  <ContactLine phone={p?.phone?.trim() || null} email={p?.email?.trim() || null} />
                  {helps && <div style={{ ...muted, marginTop: 2 }}>Can help: {helps}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <ErrorNote text={error} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span data-tour="registration-approve" style={{ display: "inline-flex" }}>
          <Pill variant="accent" onClick={() => run("approve")} disabled={busy !== null}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Pill>
        </span>
        <span data-tour="registration-reject" style={{ display: "inline-flex" }}>
          <Pill variant="ghost" onClick={() => run("reject")} disabled={busy !== null}>
            {busy === "reject" ? "Saving…" : "Not this season"}
          </Pill>
        </span>
        <span style={{ ...muted, flex: "1 1 240px" }}>
          {reg.match?.kind === "same" ? (
            <>
              Approve updates {reg.match.player.full_name} and keeps their team
              {fee ? `, and adds the ${fee} fee to Payments if it isn't there yet.` : "."}
            </>
          ) : (
            <>
              Approve adds {reg.first_name.trim()} under <strong>No team yet</strong>
              {fee ? ` and puts ${fee} on the family's Payments account.` : "."}
            </>
          )}
        </span>
      </div>
    </article>
  );
}

// A player already on the roster by this name: whether Approve updates them
// or adds another (matchRoster, the rule Approve itself uses).
function MatchNote({ reg }: { reg: PendingRegistration }) {
  const m = reg.match!;
  const p = m.player;
  const team = p.team ? teamLabel(p.team) : "no team yet";
  const link = (
    <Link href={`/portal/directory/players/${p.id}`} style={{ color: "inherit", fontWeight: 800 }}>
      {p.full_name}
    </Link>
  );
  return (
    <div
      role="note"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: m.kind === "same" ? "var(--gw-bg)" : "var(--rsd-warn-bg)",
        color: m.kind === "same" ? "var(--gw-fg)" : "var(--rsd-warn)",
        border: `1px solid ${m.kind === "same" ? "var(--gw-border)" : "var(--rsd-warn-line)"}`,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      {m.kind === "same" ? (
        <>
          Already on the roster as {link} ({team}). Approve updates that player with this registration instead of adding
          a second one.
        </>
      ) : (
        <>
          {link} ({team}) is already on the roster, born {formatDate(p.dob)}. This registration says{" "}
          {formatDate(reg.dob) ?? "no birthday"}, so Approve adds a second player. If it&apos;s the same player, fix the
          birthday on their player page first.
        </>
      )}
    </div>
  );
}
