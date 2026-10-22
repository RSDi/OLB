"use client";
import { useState } from "react";
import s from "../player-registration/wizard.module.css";
import { PROGRAMS_INFO_URL } from "../../../lib/onboarding/assessment-form";
import {
  GRADES,
  assessmentRuleLabel,
  assessmentWhen,
  gradeLabel,
  hasGradeRule,
  type PublicAssessment,
} from "../../../lib/onboarding/assessments";
import { EXPERIENCE, HEARD_FROM, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";

// Everything on one page, for families who'd rather see it all at once. It
// shares its answers with the step-by-step wizard, so switching either way
// keeps what's been filled in. Same toggle wording as player registration.

export default function AssessmentForm({
  assessment,
  state,
  onChange,
  onSubmit,
  onWizard,
  honeypot,
  onHoneypot,
}: {
  assessment: PublicAssessment;
  state: WaitlistInput;
  onChange: (next: WaitlistInput) => void;
  onSubmit: () => Promise<string | null>;
  onWizard: () => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = (patch: Partial<WaitlistInput>) => onChange({ ...state, ...patch });
  const when = assessmentWhen(assessment.starts_at);
  const details = assessment.details.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onSubmit();
    setBusy(false);
    if (res) setError(res);
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
        <button type="button" className={s.linkBtn} onClick={onWizard}>
          ← Back to step by step
        </button>
      </div>
      <form className={s.card} onSubmit={submit}>
        <h2 className={s.question}>Tell us about your son</h2>
        <p className={s.lead}>
          {details || assessment.name}
          {when ? ` ${when}${assessment.place ? ` at ${assessment.place}` : ""}.` : assessment.place ? ` ${assessment.place}.` : " "}
          {" "}
          <a href={PROGRAMS_INFO_URL} target="_blank" rel="noreferrer" className={s.linkBtn}>
            Practice times and payment info
          </a>
          .
        </p>
        <div className={s.body}>
          <div className={s.row2}>
            <label className={s.field}>
              His first name
              <input className="olb-input" autoComplete="off" value={state.athlete_first} onChange={(e) => up({ athlete_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last name
              <input className="olb-input" autoComplete="off" value={state.athlete_last} onChange={(e) => up({ athlete_last: e.target.value })} />
            </label>
          </div>
          <label className={s.field}>
            Birthday
            <input className="olb-input" type="date" value={state.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} />
          </label>
          {hasGradeRule(assessment) && (
            <div>
              <span className={s.sectionLabel}>Grade ({assessmentRuleLabel(assessment)})</span>
              {chips(GRADES.map(String), state.grade ?? "", (v) => up({ grade: v }), "Grade")}
              <p className={s.lead} style={{ marginTop: 8 }}>
                {GRADES.map((g) => gradeLabel(g)).join(" · ")}
              </p>
            </div>
          )}
          <div>
            <span className={s.sectionLabel}>Is he homeschooled?</span>
            <div className={s.chips} role="group" aria-label="Is he homeschooled?">
              <button type="button" className={s.chip} aria-pressed={state.homeschooled === true} onClick={() => up({ homeschooled: true })}>
                Yes
              </button>
              <button type="button" className={s.chip} aria-pressed={state.homeschooled === false} onClick={() => up({ homeschooled: false })}>
                No
              </button>
            </div>
            {state.homeschooled === false && (
              <p className={s.warn}>
                Lightning is a club for homeschooled boys, and our league has homeschool rules. You can still send this, and we&apos;ll
                reply to talk it through.
              </p>
            )}
          </div>
          <div>
            <span className={s.sectionLabel}>Has he played basketball before?</span>
            {chips(EXPERIENCE, state.experience, (v) => up({ experience: v }), "Has he played basketball before?")}
          </div>
          <label className={s.field}>
            Any friends already playing for Lightning? (optional)
            <input className="olb-input" value={state.friends} onChange={(e) => up({ friends: e.target.value })} />
          </label>
          <div>
            <span className={s.sectionLabel}>How did you hear about us? (optional)</span>
            {chips(HEARD_FROM, state.heard_from, (v) => up({ heard_from: v }), "How did you hear about us?")}
          </div>
          <span className={s.sectionLabel} style={{ marginTop: 6 }}>You</span>
          <div className={s.row2}>
            <label className={s.field}>
              Your first name
              <input className="olb-input" autoComplete="given-name" value={state.parent_first} onChange={(e) => up({ parent_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last name
              <input className="olb-input" autoComplete="family-name" value={state.parent_last} onChange={(e) => up({ parent_last: e.target.value })} />
            </label>
          </div>
          <div className={s.row2}>
            <label className={s.field}>
              Email
              <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.email} onChange={(e) => up({ email: e.target.value })} />
            </label>
            <label className={s.field}>
              Phone (optional)
              <input className="olb-input" type="tel" autoComplete="tel" value={state.phone} onChange={(e) => up({ phone: e.target.value })} />
            </label>
          </div>
          <label className={s.field}>
            Anything else we should know? (optional)
            <textarea className="olb-input" rows={3} value={state.notes} onChange={(e) => up({ notes: e.target.value })} style={{ height: "auto", paddingTop: 10 }} />
          </label>
          <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        </div>
        {error && (
          <div className={`olb-alert olb-alert--error ${s.error}`} role="alert">
            {error}
          </div>
        )}
        <div className={s.actions}>
          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? "Sending…" : "Sign up for an assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}
