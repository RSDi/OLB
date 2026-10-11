"use client";
import { useState } from "react";
import s from "../../player-registration/wizard.module.css";
import { signUpForProgram } from "../../../../lib/finances/program-actions";
import { MAX_SIGNUP_KIDS, newSignupKid, priceFor, signupProblem, type SignupInput, type SignupKid } from "../../../../lib/finances/program-signup";
import { formatAmount } from "../../../../lib/finances/logic";
import { PAYMENT_INSTRUCTIONS } from "../../../../lib/finances/types";
import type { ProgramLevel } from "../../../../lib/finances/club-types";

interface PublicProgram {
  id: string;
  name: string;
  schedule: string | null;
  location: string | null;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  levels: ProgramLevel[];
}

let seq = 0;
const nextKey = () => `k${++seq}`;
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

function day(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// One card: the program, each player, and the parent. Payment instructions
// on the thank-you.
export default function SignupForm({ program, full }: { program: PublicProgram; full: boolean }) {
  const [f, setF] = useState<SignupInput>({ parent_name: "", email: "", phone: "", note: "", kids: [newSignupKid(nextKey())] });
  const [honeypot, setHoneypot] = useState("");
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ total: number; onAccount: number } | null>(null);
  const up = (patch: Partial<SignupInput>) => setF((x) => ({ ...x, ...patch }));
  const upKid = (k: string, patch: Partial<SignupKid>) => setF((x) => ({ ...x, kids: x.kids.map((kid) => (kid.key === k ? { ...kid, ...patch } : kid)) }));
  const many = program.levels.length > 1;
  const total = f.kids.reduce((n, k) => n + priceFor(program.levels, k.level).cents, 0);
  const when = [program.starts_on && `${day(program.starts_on)}${program.ends_on ? ` – ${day(program.ends_on)}` : ""}`, program.schedule, program.location].filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = signupProblem(f, program.levels);
    if (problem) return setError(problem);
    setBusy(true);
    const res = await signUpForProgram(program.id, f, key, honeypot).catch(() => ({ error: "Something went wrong. Please try again." }) as { error?: string; total?: number; onAccount?: number });
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone({ total: res.total ?? total, onAccount: res.onAccount ?? 0 });
    window.scrollTo({ top: 0 });
  }

  if (done) {
    const toPay = done.total - done.onAccount;
    return (
      <div className={s.wrap}>
        <div className={`${s.card} ${s.done}`}>
          <h2 className={s.question}>You&apos;re signed up!</h2>
          <p className={s.lead}>
            Thanks! {f.kids.map((k) => k.first.trim()).join(" and ")} {f.kids.length === 1 ? "is" : "are"} in for {program.name}.
            {done.onAccount > 0 && ` ${formatAmount(done.onAccount)} is on your Lightning account under Payments.`}
            {toPay > 0 && (
              <>
                {" "}
                Please send {formatAmount(toPay)} by Venmo to{" "}
                <a href={PAYMENT_INSTRUCTIONS.venmoUrl} target="_blank" rel="noreferrer">
                  <strong>{PAYMENT_INSTRUCTIONS.venmoHandle}</strong>
                </a>{" "}
                with your player&apos;s name in the note, or bring a check to the first session.
              </>
            )}{" "}
            Questions? Email <strong>{PAYMENT_INSTRUCTIONS.email}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.top}>
        <span className={s.eyebrow}>Sign up</span>
      </div>
      <form className={s.card} onSubmit={submit}>
        <h2 className={s.question}>{program.name}</h2>
        {when.length > 0 && <p className={s.lead}>{when.join(" · ")}</p>}
        {program.description && <p className={s.lead} style={{ whiteSpace: "pre-line" }}>{program.description}</p>}
        <p className={s.lead}>
          <strong>{program.levels.map((l) => `${many ? `${l.label}: ` : ""}${formatAmount(l.cents)}`).join(" · ")}</strong>
        </p>
        {full ? (
          <div className={`olb-alert olb-alert--error ${s.error}`} role="alert">
            It&apos;s full. Email <strong>{PAYMENT_INSTRUCTIONS.email}</strong> to ask about a spot.
          </div>
        ) : (
          <>
            <div className={s.body}>
              {f.kids.map((k, i) => (
                <div key={k.key} style={{ display: "flex", flexDirection: "column", gap: 12, ...(i > 0 ? { borderTop: "1px solid var(--olb-stroke)", paddingTop: 14 } : {}) }}>
                  <span className={s.sectionLabel}>
                    {f.kids.length > 1 ? `Player ${i + 1}` : "Your player"}
                    {f.kids.length > 1 && (
                      <button type="button" className={s.linkBtn} style={{ marginLeft: 10 }} onClick={() => up({ kids: f.kids.filter((x) => x.key !== k.key) })}>
                        Remove
                      </button>
                    )}
                  </span>
                  <div className={s.row2}>
                    <label className={s.field}>
                      First name
                      <input className="olb-input" autoComplete="off" value={k.first} onChange={(e) => upKid(k.key, { first: e.target.value })} />
                    </label>
                    <label className={s.field}>
                      Last name
                      <input className="olb-input" autoComplete="off" value={k.last} onChange={(e) => upKid(k.key, { last: e.target.value })} />
                    </label>
                  </div>
                  <label className={s.field}>
                    Birthday
                    <input className="olb-input" type="date" value={k.dob} onChange={(e) => upKid(k.key, { dob: e.target.value })} />
                  </label>
                  {many && (
                    <div className={s.chips} role="group" aria-label={`Group for ${k.first || "your player"}`}>
                      {program.levels.map((l) => (
                        <button key={l.label} type="button" className={s.chip} aria-pressed={k.level === l.label} onClick={() => upKid(k.key, { level: l.label })}>
                          {l.label} · {formatAmount(l.cents)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {f.kids.length < MAX_SIGNUP_KIDS && (
                <button type="button" className={s.linkBtn} onClick={() => up({ kids: [...f.kids, { ...newSignupKid(nextKey()), last: f.kids[0]?.last ?? "" }] })}>
                  + Add a brother
                </button>
              )}
              <span className={s.sectionLabel} style={{ marginTop: 6 }}>
                You
              </span>
              <label className={s.field}>
                Your name
                <input className="olb-input" autoComplete="name" value={f.parent_name} onChange={(e) => up({ parent_name: e.target.value })} />
              </label>
              <div className={s.row2}>
                <label className={s.field}>
                  Email
                  <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => up({ email: e.target.value })} />
                </label>
                <label className={s.field}>
                  Phone (optional)
                  <input className="olb-input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => up({ phone: e.target.value })} />
                </label>
              </div>
              <label className={s.field}>
                Anything we should know? (optional)
                <textarea className="olb-input" rows={3} value={f.note} onChange={(e) => up({ note: e.target.value })} style={{ height: "auto", paddingTop: 10 }} />
              </label>
              <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            </div>
            {error && (
              <div className={`olb-alert olb-alert--error ${s.error}`} role="alert">
                {error}
              </div>
            )}
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? "Sending…" : total ? `Sign up · ${formatAmount(total)}` : "Sign up"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
