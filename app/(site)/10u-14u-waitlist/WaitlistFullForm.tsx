"use client";
import { useState } from "react";
import s from "../player-registration/wizard.module.css";
import {
  COMPETITIVE_WAITLIST_COPY,
  HOMESCHOOL_HELP,
  PARENT_NA_HELP,
  type CompetitiveParent,
  type CompetitiveWaitlistInput,
} from "../../../lib/onboarding/competitive-waitlist-form";

// Everything on one page, for families who'd rather see it all at once. It
// shares its answers with the step-by-step wizard, so switching either way
// keeps what's been filled in. Same toggle wording as player registration.

export default function CompetitiveWaitlistForm({
  state,
  onChange,
  onSubmit,
  onWizard,
  honeypot,
  onHoneypot,
}: {
  state: CompetitiveWaitlistInput;
  onChange: (next: CompetitiveWaitlistInput) => void;
  onSubmit: () => Promise<string | null>;
  onWizard: () => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = (patch: Partial<CompetitiveWaitlistInput>) => onChange({ ...state, ...patch });
  const upParent = (who: "father" | "mother", patch: Partial<CompetitiveParent>) =>
    onChange({ ...state, [who]: { ...state[who], ...patch } });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onSubmit();
    setBusy(false);
    if (res) setError(res);
  }

  return (
    <div className={s.wrap}>
      <div className={s.top}>
        <button type="button" className={s.linkBtn} onClick={onWizard}>
          ← Back to step by step
        </button>
      </div>
      <form className={s.card} onSubmit={submit}>
        <h2 className={s.question}>10u-14u Competitive Waitlist</h2>
        <p className={s.lead}>{COMPETITIVE_WAITLIST_COPY}</p>
        <div className={s.body}>
          <span className={s.sectionLabel}>Athlete Name</span>
          <div className={s.row2}>
            <label className={s.field}>
              First
              <input className="olb-input" autoComplete="off" value={state.athlete_first} onChange={(e) => up({ athlete_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last
              <input className="olb-input" autoComplete="off" value={state.athlete_last} onChange={(e) => up({ athlete_last: e.target.value })} />
            </label>
          </div>
          <label className={s.field}>
            Athlete Birthdate
            <input className="olb-input" type="date" value={state.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} />
          </label>
          <div>
            <span className={s.sectionLabel}>Is this your first experience with Omaha Lightning Basketball?</span>
            <div className={s.chips} role="group" aria-label="Is this your first experience with Omaha Lightning Basketball?">
              <button type="button" className={s.chip} aria-pressed={state.first_experience === true} onClick={() => up({ first_experience: true })}>
                Yes
              </button>
              <button type="button" className={s.chip} aria-pressed={state.first_experience === false} onClick={() => up({ first_experience: false })}>
                No
              </button>
            </div>
          </div>
          <div className={s.row2}>
            <label className={s.field}>
              Athlete Phone
              <input className="olb-input" type="tel" autoComplete="tel" value={state.athlete_phone} onChange={(e) => up({ athlete_phone: e.target.value })} />
            </label>
            <label className={s.field}>
              Athlete Email
              <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.athlete_email} onChange={(e) => up({ athlete_email: e.target.value })} />
            </label>
          </div>
          <div>
            <span className={s.sectionLabel}>Is your athlete homeschooled?</span>
            <div className={s.chips} role="group" aria-label="Is your athlete homeschooled?">
              <button type="button" className={s.chip} aria-pressed={state.homeschooled === true} onClick={() => up({ homeschooled: true })}>
                Yes
              </button>
              <button type="button" className={s.chip} aria-pressed={state.homeschooled === false} onClick={() => up({ homeschooled: false })}>
                No
              </button>
            </div>
            <p className={s.lead} style={{ marginTop: 8 }}>
              {HOMESCHOOL_HELP}
            </p>
            {state.homeschooled === false && (
              <p className={s.warn}>
                Cognito requires Yes on this question. Lightning is a club for homeschooled boys. You can email{" "}
                <strong>LightningBasketballOmaha@gmail.com</strong> to talk it through.
              </p>
            )}
          </div>
          <span className={s.sectionLabel} style={{ marginTop: 6 }}>
            Father&apos;s Name
          </span>
          <p className={s.lead}>{PARENT_NA_HELP}</p>
          <div className={s.row2}>
            <label className={s.field}>
              First
              <input className="olb-input" autoComplete="off" value={state.father.first} onChange={(e) => upParent("father", { first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last
              <input className="olb-input" autoComplete="off" value={state.father.last} onChange={(e) => upParent("father", { last: e.target.value })} />
            </label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>
              Father&apos;s Email
              <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.father.email} onChange={(e) => upParent("father", { email: e.target.value })} />
            </label>
            <label className={s.field}>
              Father&apos;s Phone
              <input className="olb-input" type="tel" autoComplete="tel" value={state.father.phone} onChange={(e) => upParent("father", { phone: e.target.value })} />
            </label>
          </div>
          <span className={s.sectionLabel} style={{ marginTop: 6 }}>
            Mother&apos;s Name
          </span>
          <p className={s.lead}>{PARENT_NA_HELP}</p>
          <div className={s.row2}>
            <label className={s.field}>
              First
              <input className="olb-input" autoComplete="off" value={state.mother.first} onChange={(e) => upParent("mother", { first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last
              <input className="olb-input" autoComplete="off" value={state.mother.last} onChange={(e) => upParent("mother", { last: e.target.value })} />
            </label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>
              Mother&apos;s Email
              <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.mother.email} onChange={(e) => upParent("mother", { email: e.target.value })} />
            </label>
            <label className={s.field}>
              Mother&apos;s Phone
              <input className="olb-input" type="tel" autoComplete="tel" value={state.mother.phone} onChange={(e) => upParent("mother", { phone: e.target.value })} />
            </label>
          </div>
          <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
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
