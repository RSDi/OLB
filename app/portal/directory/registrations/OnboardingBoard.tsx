"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, Pill, Textarea } from "../../../components/ui";
import { ErrorNote, capStyle } from "../../payments/parts";
import { muted } from "../_shared/PlayerParts";
import { announceTeams, sendHeldEmail, skipHeldEmail } from "../../../../lib/onboarding/actions";
import { AUTOMATIONS } from "../../../../lib/onboarding/automations";
import type { BoardCard, HeldEmail, OnboardingBoard as Board } from "../../../../lib/onboarding/board-data";

// The registration workflow's tab on the Registrations page (0130): every
// family from the waitlist to a team in one view, what each still has to do
// ($ fee, H handbook, S Slack, U uniform sizes), families who've gone quiet,
// and the emails waiting for someone to press Send.
export function OnboardingBoard({ board }: { board: Board | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; notice?: string } | null>(null);

  if (!board || !board.enabled) {
    return (
      <div className="rsd-card" style={{ padding: "32px 24px", textAlign: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>The registration workflow is off</div>
        <div style={{ ...muted, fontSize: 13 }}>
          Turn it on in <Link href="/portal/settings?tab=registration_automations">Settings → Registration Automations</Link> to see families
          here from the waitlist to their team.
        </div>
      </div>
    );
  }

  async function announce() {
    if (!confirm("Email every family whose players are all on a team? Families already told about the same team aren't emailed again.")) return;
    setBusy(true);
    setMessage(null);
    const res = await announceTeams();
    setBusy(false);
    setMessage(res);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {board.paused && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--gw-error-bg)", fontSize: 13, fontWeight: 600 }}>
          Automatic emails are paused in Settings → Registration Automations.
        </div>
      )}

      {board.held.length > 0 && <HeldEmails emails={board.held} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...muted, fontSize: 13 }}>
          <strong style={{ color: "var(--gw-fg)" }}>$</strong> fee paid · <strong style={{ color: "var(--gw-fg)" }}>H</strong> handbook signed ·{" "}
          <strong style={{ color: "var(--gw-fg)" }}>S</strong> on Slack · <strong style={{ color: "var(--gw-fg)" }}>U</strong> uniform sizes in. Red is still open.
        </span>
        <span style={{ flex: 1 }} />
        <Link href="/portal/directory/uniforms" style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
          Uniforms
        </Link>
        <span data-tour="onboarding-announce" style={{ display: "inline-flex" }}>
          <Pill size="sm" variant="dark" onClick={announce} disabled={busy}>
            {busy ? "Announcing…" : "Announce teams"}
          </Pill>
        </span>
      </div>
      {message?.error && <ErrorNote text={message.error} />}
      {message?.notice && <span style={{ ...muted, fontWeight: 700, color: "var(--gw-fg)" }}>{message.notice}</span>}

      <div data-tour="onboarding-board" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(170px, 1fr))", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {board.columns.map((col) => (
          <div key={col.key} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <div style={{ ...capStyle, fontSize: 10.5, display: "flex", justifyContent: "space-between" }}>
              <span>{col.label}</span>
              <span>{col.cards.length}</span>
            </div>
            {col.cards.length === 0 && <div style={{ ...muted, padding: "8px 2px" }}>Nobody here</div>}
            {col.cards.map((c) => (
              <Card key={c.id} card={c} />
            ))}
          </div>
        ))}
      </div>

      {board.quiet.length > 0 && (
        <div className="rsd-card" style={{ gap: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Gone quiet</div>
          <div style={muted}>Nothing heard in two weeks or more. A quick personal note usually does it.</div>
          {board.quiet.map((c) => (
            <div key={`q-${c.id}`} style={{ display: "flex", gap: "2px 8px", alignItems: "baseline", flexWrap: "wrap", fontSize: 13 }}>
              <strong>{c.title}</strong>
              <span style={muted}>{c.meta}</span>
              {c.href && (
                <Link href={c.href} style={{ fontSize: 12, fontWeight: 700 }}>
                  Follow up
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ card }: { card: BoardCard }) {
  const body = (
    <div className="rsd-card" style={{ padding: "9px 10px", gap: 4, borderColor: card.quiet ? "var(--gw-error)" : undefined }}>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{card.title}</div>
      <div style={{ ...muted, fontSize: 11.5, lineHeight: 1.4 }}>{card.meta}</div>
      {card.dots && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }} aria-label="Fee, handbook, Slack, uniform sizes">
          <Dot on={card.dots.fee} label="$" />
          <Dot on={card.dots.handbook} label="H" />
          <Dot on={card.dots.slack} label="S" />
          {card.dots.sizes !== null && <Dot on={card.dots.sizes} label="U" />}
        </div>
      )}
    </div>
  );
  return card.href ? (
    <Link href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
      {body}
    </Link>
  ) : (
    body
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={on ? "Done" : "Still open"}
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        display: "grid",
        placeItems: "center",
        fontSize: 10,
        fontWeight: 800,
        background: on ? "var(--gw-success-bg)" : "var(--gw-error-bg)",
        color: on ? "var(--gw-success)" : "var(--gw-error)",
      }}
    >
      {label}
    </span>
  );
}

// Emails held under "Ask me first", and any that didn't go through: read,
// change the words if you like, then Send or Skip.
function HeldEmails({ emails }: { emails: HeldEmail[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = (kind: string) => AUTOMATIONS.find((a) => a.key === kind)?.label ?? kind;

  async function act(id: string, fn: () => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) return setError(res.error);
    setOpenId(null);
    setEdit(null);
    router.refresh();
  }

  async function sendAll() {
    const waiting = emails.filter((e) => e.status === "waiting");
    if (!confirm(`Send all ${waiting.length} waiting emails as they are?`)) return;
    for (const e of waiting) await act(e.id, () => sendHeldEmail(e.id));
  }

  return (
    <div className="rsd-card" data-tour="onboarding-held" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Waiting for you · {emails.length}</div>
          <div style={muted}>Emails set to Ask me first. Nothing goes out until you press Send.</div>
        </div>
        {emails.filter((e) => e.status === "waiting").length > 1 && (
          <Pill size="sm" variant="ghost" onClick={sendAll} disabled={busy !== null}>
            Send all
          </Pill>
        )}
      </div>
      {error && (
        <div style={{ padding: "0 16px 12px" }}>
          <ErrorNote text={error} />
        </div>
      )}
      {emails.map((e) => (
        <div key={e.id} style={{ borderTop: "1px solid var(--gw-border)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={`rsd-chip ${e.status === "failed" ? "rsd-chip-mute" : "rsd-chip-accent"}`}>{e.status === "failed" ? "Didn't go through" : label(e.kind)}</span>
            <button
              type="button"
              onClick={() => {
                setOpenId(openId === e.id ? null : e.id);
                setEdit(null);
              }}
              style={{ border: "none", background: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", cursor: "pointer", textAlign: "left", flex: "1 1 200px", minWidth: 0 }}
            >
              {e.subject}
              <span style={{ ...muted, display: "block", overflowWrap: "anywhere" }}>To {e.to.join(", ")}</span>
            </button>
            <Pill size="sm" variant="accent" onClick={() => act(e.id, () => sendHeldEmail(e.id, openId === e.id && edit ? edit : undefined))} disabled={busy !== null}>
              {busy === e.id ? "Sending…" : e.status === "failed" ? "Try again" : "Send"}
            </Pill>
            <Pill size="sm" variant="ghost" onClick={() => act(e.id, () => skipHeldEmail(e.id))} disabled={busy !== null}>
              Skip
            </Pill>
          </div>
          {openId === e.id &&
            (edit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Input label="Subject" value={edit.subject} maxLength={200} onChange={(ev) => setEdit({ ...edit, subject: ev.target.value })} />
                <Textarea label="Email" rows={10} value={edit.body} onChange={(ev) => setEdit({ ...edit, body: ev.target.value })} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {e.error && <span style={{ ...muted, color: "var(--gw-error)" }}>{e.error}</span>}
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.55, border: "1px solid var(--gw-border)", borderRadius: 10, padding: "10px 12px", background: "var(--gw-bg)" }}>{e.body}</div>
                <button
                  type="button"
                  onClick={() => setEdit({ subject: e.subject, body: e.body })}
                  style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, textDecoration: "underline", cursor: "pointer", color: "var(--gw-fg)" }}
                >
                  Change the words
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
