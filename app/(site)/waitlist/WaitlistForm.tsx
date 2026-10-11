"use client";
import { useState } from "react";
import s from "../player-registration/wizard.module.css";
import { joinWaitlist } from "../../../lib/onboarding/public-actions";
import { EXPERIENCE, HEARD_FROM, emptyWaitlist, waitlistProblem, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";

// One card: their son, homeschooling, basketball so far, how they heard
// about us, and how to reach them.
export default function WaitlistForm() {
  const [w, setW] = useState<WaitlistInput>(emptyWaitlist);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const up = (patch: Partial<WaitlistInput>) => setW((x) => ({ ...x, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = waitlistProblem(w);
    if (problem) return setError(problem);
    setBusy(true);
    const res = await joinWaitlist(w, honeypot).catch(() => ({ error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={`${s.card} ${s.done}`}>
          <h2 className={s.question}>You&apos;re on the waitlist!</h2>
          <p className={s.lead}>
            Thanks for telling us about {w.athlete_first.trim()}. We&apos;ll be in touch within a couple of days, and as soon as we have
            room. Questions? Email <strong>lightningbasketballomaha@gmail.com</strong>.
          </p>
        </div>
      </div>
    );
  }

  const chips = (options: string[], value: string, set: (v: string) => void, label: string) => (
    <div className={s.chips} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className={s.chip} aria-pressed={value === o} onClick={() => set(o)}>
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <div className={s.wrap}>
      <div className={s.top}>
        <span className={s.eyebrow}>Join the waitlist</span>
      </div>
      <form className={s.card} onSubmit={submit}>
        <h2 className={s.question}>Tell us about your son</h2>
        <p className={s.lead}>Our 8u–14u teams fill fast. We fill open spots in the order families join, and we&apos;ll reply within a couple of days.</p>
        <div className={s.body}>
          <div className={s.row2}>
            <label className={s.field}>
              His first name
              <input className="olb-input" autoComplete="off" value={w.athlete_first} onChange={(e) => up({ athlete_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last name
              <input className="olb-input" autoComplete="off" value={w.athlete_last} onChange={(e) => up({ athlete_last: e.target.value })} />
            </label>
          </div>
          <label className={s.field}>
            Birthday
            <input className="olb-input" type="date" value={w.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} />
          </label>
          <div>
            <span className={s.sectionLabel}>Is he homeschooled?</span>
            <div className={s.chips} role="group" aria-label="Is he homeschooled?">
              <button type="button" className={s.chip} aria-pressed={w.homeschooled === true} onClick={() => up({ homeschooled: true })}>
                Yes
              </button>
              <button type="button" className={s.chip} aria-pressed={w.homeschooled === false} onClick={() => up({ homeschooled: false })}>
                No
              </button>
            </div>
            {w.homeschooled === false && (
              <p className={s.warn}>
                Lightning is a club for homeschooled boys, and our league has homeschool rules. You can still send this, and we&apos;ll
                reply to talk it through.
              </p>
            )}
          </div>
          <div>
            <span className={s.sectionLabel}>Has he played basketball before?</span>
            {chips(EXPERIENCE, w.experience, (v) => up({ experience: v }), "Has he played basketball before?")}
          </div>
          <label className={s.field}>
            Any friends already playing for Lightning? (optional)
            <input className="olb-input" value={w.friends} onChange={(e) => up({ friends: e.target.value })} />
          </label>
          <div>
            <span className={s.sectionLabel}>How did you hear about us? (optional)</span>
            {chips(HEARD_FROM, w.heard_from, (v) => up({ heard_from: v }), "How did you hear about us?")}
          </div>
          <span className={s.sectionLabel} style={{ marginTop: 6 }}>You</span>
          <div className={s.row2}>
            <label className={s.field}>
              Your first name
              <input className="olb-input" autoComplete="given-name" value={w.parent_first} onChange={(e) => up({ parent_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last name
              <input className="olb-input" autoComplete="family-name" value={w.parent_last} onChange={(e) => up({ parent_last: e.target.value })} />
            </label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>
              Email
              <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={w.email} onChange={(e) => up({ email: e.target.value })} />
            </label>
            <label className={s.field}>
              Phone (optional)
              <input className="olb-input" type="tel" autoComplete="tel" value={w.phone} onChange={(e) => up({ phone: e.target.value })} />
            </label>
          </div>
          <label className={s.field}>
            Anything else we should know? (optional)
            <textarea className="olb-input" rows={3} value={w.notes} onChange={(e) => up({ notes: e.target.value })} style={{ height: "auto", paddingTop: 10 }} />
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
            {busy ? "Sending…" : "Join the waitlist"}
          </button>
        </div>
      </form>
    </div>
  );
}
