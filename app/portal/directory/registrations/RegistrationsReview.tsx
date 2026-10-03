"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { MapLink } from "../../../components/MapLink";
import { Input, Pill, Textarea } from "../../../components/ui";
import { ageFromDob } from "../../../../lib/teams/age";
import {
  approveRegistration,
  moveRegistrationToWaiting,
  removeRegistration,
  sendRegistrationMessage,
  setRegistrationContacted,
  updateRegistrationNote,
  waitlistRegistration,
} from "../../../../lib/teams/registration-actions";
import type { PendingRegistration, RegistrationTab } from "../../../../lib/teams/registration-data";
import type { RegistrationParentAnswers } from "../../../../lib/teams/roster-logic";
import { teamLabel } from "../../../../lib/teams/volunteer-options";
import {
  DEFAULT_MESSAGE,
  DEFAULT_SUBJECT,
  allEmails,
  familyEmails,
  groupFamilies,
  mailtoHref,
  waitlistCsv,
} from "../../../../lib/teams/waitlist";
import { formatDollars, registrationFeeCents, registrationTier } from "../../../../lib/finances/logic";
import { ContactLine, formatDate, muted } from "../_shared/PlayerParts";
import { ErrorNote, Sheet, capStyle } from "../../payments/parts";

const TABS: { key: RegistrationTab; label: string }[] = [
  { key: "waiting", label: "Waiting" },
  { key: "waitlist", label: "Waitlist" },
  { key: "approved", label: "Approved" },
];

// Registrations from the public form, in three tabs: Waiting to be reviewed
// (Approve, or Waitlist), the Waitlist (families to reach and approve when a
// spot opens), and Approved, a history.
export function RegistrationsReview({
  tab,
  counts,
  registrations,
}: {
  tab: RegistrationTab;
  counts: Record<RegistrationTab, number>;
  registrations: PendingRegistration[];
}) {
  const [compose, setCompose] = useState<PendingRegistration[] | null>(null);

  return (
    <>
      <Link
        href="/portal/directory"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", alignSelf: "flex-start" }}
      >
        <Icons.ChevronLeft width={14} height={14} />
        Back to directory
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div
          role="tablist"
          aria-label="Registrations"
          data-tour="registrations-tabs"
          style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)", flexWrap: "wrap" }}
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "waiting" ? "/portal/directory/registrations" : `/portal/directory/registrations?tab=${t.key}`}
              scroll={false}
              role="tab"
              aria-selected={tab === t.key}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: tab === t.key ? "var(--gw-bg-elev)" : "transparent",
                boxShadow: tab === t.key ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                color: tab === t.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
              <span style={{ fontWeight: 600, opacity: 0.65 }}>{counts[t.key]}</span>
            </Link>
          ))}
        </div>
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

      {tab === "waitlist" && registrations.length > 0 && <WaitlistTools registrations={registrations} onMessageAll={() => setCompose(registrations)} />}

      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
        {tab === "waiting" && (registrations.length === 0 ? "Nothing waiting" : `${registrations.length} waiting, oldest first`)}
        {tab === "waitlist" &&
          (registrations.length === 0 ? "Nobody on the waitlist" : `${registrations.length} on the waitlist, in the order they registered`)}
        {tab === "approved" && (registrations.length === 0 ? "None approved yet" : `${registrations.length} approved, newest first`)}
      </span>

      {registrations.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {tab === "waiting"
              ? "No new registrations. When a family fills in the registration form, it shows up here."
              : tab === "waitlist"
                ? "When you put a registration on the waitlist, it shows up here so you can reach the family and approve them later."
                : "Registrations you approve are listed here."}
          </div>
        </div>
      ) : tab === "approved" ? (
        <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {registrations.map((r, i) => (
            <ApprovedRow key={r.id} reg={r} border={i < registrations.length - 1} />
          ))}
        </div>
      ) : (
        registrations.map((r) => <RegistrationCard key={r.id} reg={r} tab={tab} onMessage={() => setCompose([r])} />)
      )}

      {compose && <ComposeSheet targets={compose} everyone={compose.length > 1} onClose={() => setCompose(null)} />}
    </>
  );
}

// ─── Waitlist: tools for the whole list ─────────────────────────────────────

function WaitlistTools({ registrations, onMessageAll }: { registrations: PendingRegistration[]; onMessageAll: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const emails = allEmails(registrations);

  async function copy() {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(`Copied ${emails.length} ${emails.length === 1 ? "email" : "emails"}. Paste them into Bcc.`);
    } catch {
      setCopied("Couldn't copy here. Try Download spreadsheet instead.");
    }
  }

  function download() {
    const blob = new Blob([waitlistCsv(registrations)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-tour="waitlist-tools" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Pill size="sm" variant="accent" onClick={onMessageAll} disabled={emails.length === 0}>
        <Icons.Mail width={13} height={13} /> Message everyone
      </Pill>
      <Pill size="sm" variant="light" onClick={copy} disabled={emails.length === 0}>
        Copy all emails
      </Pill>
      <Pill size="sm" variant="light" onClick={download}>
        Download spreadsheet
      </Pill>
      {copied && <span style={{ ...muted, fontWeight: 600 }}>{copied}</span>}
    </div>
  );
}

// ─── One registration ───────────────────────────────────────────────────────

function RegistrationCard({ reg, tab, onMessage }: { reg: PendingRegistration; tab: RegistrationTab; onMessage: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(reg.notes ?? "");

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
  const emails = familyEmails(reg);

  async function run(key: string, fn: () => Promise<{ error?: string }>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else {
      setNoting(false);
      router.refresh();
    }
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
            {x.email_confirmed && (
              <span className="rsd-chip rsd-chip-mute" title={`The family typed back the code we emailed to ${x.email_confirmed}`}>
                Email confirmed
              </span>
            )}
          </div>
          <span style={muted}>
            {[age != null && `Age ${age}`, born && `Born ${born}`, `Registered ${formatDate(reg.created_at.slice(0, 10))}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {address && (
            <MapLink
              address={address}
              icon={<Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2, color: "var(--gw-fg-muted)" }} />}
              style={{ ...muted, color: "var(--gw-fg)", display: "flex", gap: 6, alignItems: "flex-start", alignSelf: "flex-start" }}
            />
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

      {tab === "waitlist" && (
        <WaitlistStatus
          reg={reg}
          note={note}
          setNote={setNote}
          editing={noting}
          setEditing={setNoting}
          busy={busy}
          onSaveNote={() => run("note", () => updateRegistrationNote(reg.id, note))}
          onContacted={(v) => run("contacted", () => setRegistrationContacted(reg.id, v))}
        />
      )}

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

      {tab === "waitlist" && reg.messages.length > 0 && <Messages reg={reg} />}

      {error && <ErrorNote text={error} />}

      {tab === "waiting" && noting && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
          <Textarea
            label="Note for the waitlist (optional)"
            help="Why they're waiting, for whoever reads the waitlist. Families don't see it."
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 14u is full. First in line if a spot opens."
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="dark" onClick={() => run("waitlist", () => waitlistRegistration(reg.id, note))} disabled={busy !== null}>
              {busy === "waitlist" ? "Saving…" : "Add to waitlist"}
            </Pill>
            <Pill variant="ghost" onClick={() => setNoting(false)} disabled={busy !== null}>
              Cancel
            </Pill>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span data-tour="registration-approve" style={{ display: "inline-flex" }}>
          <Pill variant="accent" onClick={() => run("approve", () => approveRegistration(reg.id))} disabled={busy !== null}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Pill>
        </span>
        {tab === "waiting" && !noting && (
          <span data-tour="registration-waitlist" style={{ display: "inline-flex" }}>
            <Pill variant="ghost" onClick={() => setNoting(true)} disabled={busy !== null}>
              Waitlist
            </Pill>
          </span>
        )}
        {tab === "waitlist" && (
          <>
            <span data-tour="waitlist-message" style={{ display: "inline-flex" }}>
              <Pill variant="dark" onClick={onMessage} disabled={busy !== null || emails.length === 0}>
                <Icons.Mail width={13} height={13} /> Send a message
              </Pill>
            </span>
            {emails.length > 0 && (
              <a
                href={mailtoHref(emails, `Omaha Lightning registration for ${name}`)}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Email from my app
              </a>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => run("back", () => moveRegistrationToWaiting(reg.id))}
              disabled={busy !== null}
              style={linkButton}
            >
              {busy === "back" ? "Moving…" : "Move back to Waiting"}
            </button>
            <button
              type="button"
              onClick={() =>
                run("remove", () => removeRegistration(reg.id), `Remove ${name}'s registration? It won't show on any tab. Use this for tests and families who withdrew.`)
              }
              disabled={busy !== null}
              style={{ ...linkButton, color: "var(--gw-error)" }}
            >
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
        {tab === "waiting" && (
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
        )}
      </div>
    </article>
  );
}

const linkButton: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

// When it went on the waitlist and why, and whether someone's reached out.
function WaitlistStatus({
  reg,
  note,
  setNote,
  editing,
  setEditing,
  busy,
  onSaveNote,
  onContacted,
}: {
  reg: PendingRegistration;
  note: string;
  setNote: (v: string) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
  busy: string | null;
  onSaveNote: () => void;
  onContacted: (v: boolean) => void;
}) {
  const since = reg.reviewed_at ? formatDate(reg.reviewed_at.slice(0, 10)) : null;
  const contacted = !!reg.contacted_at;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--gw-bg)",
        border: "1px solid var(--gw-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg)" }}>
          On the waitlist{since ? ` since ${since}` : ""}
          {reg.reviewed_by_name ? ` · by ${reg.reviewed_by_name}` : ""}
        </span>
        <label data-tour="waitlist-contacted" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={contacted} disabled={busy !== null} onChange={(e) => onContacted(e.target.checked)} />
          {contacted
            ? `Contacted ${formatDate(reg.contacted_at!.slice(0, 10))}${reg.contacted_by_name ? ` by ${reg.contacted_by_name}` : ""}`
            : "Contacted"}
        </label>
      </div>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="Why they're waiting" />
          <div style={{ display: "flex", gap: 8 }}>
            <Pill size="sm" variant="dark" onClick={onSaveNote} disabled={busy !== null}>
              {busy === "note" ? "Saving…" : "Save note"}
            </Pill>
            <Pill
              size="sm"
              variant="ghost"
              onClick={() => {
                setNote(reg.notes ?? "");
                setEditing(false);
              }}
              disabled={busy !== null}
            >
              Cancel
            </Pill>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...muted, fontSize: 12.5, color: reg.notes ? "var(--gw-fg)" : "var(--gw-fg-muted)", whiteSpace: "pre-wrap" }}>
            {reg.notes || "No note."}
          </span>
          <button type="button" onClick={() => setEditing(true)} style={linkButton}>
            {reg.notes ? "Edit note" : "Add a note"}
          </button>
        </div>
      )}
    </div>
  );
}

// Emails sent to the family from this page, newest first.
function Messages({ reg }: { reg: PendingRegistration }) {
  return (
    <details style={{ borderTop: "1px solid var(--gw-border)", paddingTop: 12 }}>
      <summary style={{ ...capStyle, fontSize: 10, cursor: "pointer" }}>Messages sent ({reg.messages.length})</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
        {reg.messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{m.subject}</span>
            <span style={muted}>
              {new Date(m.sent_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {m.sent_by_name ? ` · by ${m.sent_by_name}` : ""} · to {m.sent_to.join(", ")}
            </span>
            <div style={{ ...muted, whiteSpace: "pre-wrap", lineHeight: 1.55, padding: "8px 10px", borderRadius: 8, background: "var(--gw-bg)" }}>{m.body}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

// ─── Writing to families ────────────────────────────────────────────────────

function ComposeSheet({ targets, everyone, onClose }: { targets: PendingRegistration[]; everyone: boolean; onClose: () => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { groups, noEmail } = groupFamilies(targets);
  const families = groups.length;
  const title = everyone ? "Message everyone on the waitlist" : "Send a message";
  const eyebrow = everyone ? `${families} ${families === 1 ? "family" : "families"}` : `${targets[0].first_name} ${targets[0].last_name}`.trim();

  async function send() {
    setBusy(true);
    setError(null);
    const res = await sendRegistrationMessage(
      targets.map((t) => t.id),
      subject,
      body
    );
    setBusy(false);
    if (res.error && !res.sent) return setError(res.error);
    const skipped = res.skipped?.length ? ` No email on file for ${res.skipped.join(", ")}.` : "";
    setDone(`Sent to ${res.sent} ${res.sent === 1 ? "family" : "families"}.${skipped}${res.error ? ` ${res.error}` : ""}`);
    router.refresh();
  }

  return (
    <Sheet eyebrow={eyebrow} title={title} busy={busy} onClose={onClose}>
      {done ? (
        <>
          <div role="status" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
            {done}
          </div>
          <Pill variant="accent" onClick={onClose}>
            Done
          </Pill>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.55 }}>
            Sent from the club&apos;s email address, one email per family. Replies go to the club&apos;s Gmail. A copy is kept on
            each registration, and they&apos;re marked contacted.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={capStyle}>To</span>
            {groups.map((g) => (
              <span key={g.emails.join()} style={{ fontSize: 13, color: "var(--gw-fg)", overflowWrap: "anywhere" }}>
                <strong>{g.registrations.map((r) => r.first_name).join(" & ")}</strong> · {g.emails.join(", ")}
              </span>
            ))}
            {noEmail.length > 0 && (
              <span style={{ fontSize: 12.5, color: "var(--gw-error)", fontWeight: 600 }}>
                No email on file for {noEmail.map((r) => `${r.first_name} ${r.last_name}`.trim()).join(", ")}, so they won&apos;t get it.
              </span>
            )}
          </div>
          <Input label="Subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          <Textarea
            label="Message"
            help="{player} becomes each family's player names."
            value={body}
            rows={11}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <ErrorNote text={error} />}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
            <Pill variant="accent" onClick={send} disabled={busy || families === 0 || !subject.trim() || !body.trim()}>
              {busy ? "Sending…" : families === 1 ? "Send" : `Send to ${families} families`}
            </Pill>
            <Pill variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Pill>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ─── Approved: a history ────────────────────────────────────────────────────

function ApprovedRow({ reg, border }: { reg: PendingRegistration; border: boolean }) {
  const name = `${reg.first_name} ${reg.last_name}`.trim();
  const tier = registrationTier(reg.extra.fee_tier);
  const team = reg.player?.team ? teamLabel(reg.player.team) : reg.player ? "No team yet" : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "4px 16px",
        flexWrap: "wrap",
        padding: "12px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        {reg.player ? (
          <Link href={`/portal/directory/players/${reg.player.id}`} style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}>
            {name}
          </Link>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700 }}>{name}</span>
        )}
        {team && <span className="rsd-chip rsd-chip-mute">{team}</span>}
        {tier && <span style={muted}>{tier}</span>}
      </div>
      <span style={muted}>
        {[
          reg.reviewed_at && `Approved ${formatDate(reg.reviewed_at.slice(0, 10))}${reg.reviewed_by_name ? ` by ${reg.reviewed_by_name}` : ""}`,
          `Registered ${formatDate(reg.created_at.slice(0, 10))}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
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
