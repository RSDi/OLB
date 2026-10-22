"use client";
import { useEffect, useRef, useState } from "react";
import s from "../player-registration/wizard.module.css";
import { ContinueButton, Question, Choice, Summary, Line, ErrorNote } from "../player-registration/wizard-parts";
import { PROGRAMS_INFO_URL, assessmentProblem } from "../../../lib/onboarding/assessment-form";
import { assessmentStepProblem, assessmentStepsFor, type AssessmentStep } from "../../../lib/onboarding/assessment-steps";
import {
  GRADES,
  assessmentRuleLabel,
  assessmentWhen,
  formatDay,
  gradeLabel,
  hasDobRule,
  hasGradeRule,
  type PublicAssessment,
} from "../../../lib/onboarding/assessments";
import { EXPERIENCE, HEARD_FROM, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";

// One assessment as a conversation: one question at a time, same chrome
// and "See the whole form" toggle as player registration. Answers are shared
// with the one-page form, so switching either way keeps them.

export function AssessmentWizard({
  assessment,
  state,
  onChange,
  onSubmit,
  onFullForm,
  honeypot,
  onHoneypot,
}: {
  assessment: PublicAssessment;
  state: WaitlistInput;
  onChange: (next: WaitlistInput) => void;
  onSubmit: () => Promise<string | null>;
  onFullForm: () => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  const [stepId, setStepId] = useState<AssessmentStep>("intro");
  const [backToSummary, setBackToSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const steps = assessmentStepsFor(assessment);
  const at = Math.max(0, steps.indexOf(stepId));
  const first = state.athlete_first.trim() || "your son";
  const when = assessmentWhen(assessment.starts_at);
  const details = assessment.details.trim();

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (wrapRef.current && wrapRef.current.getBoundingClientRect().top < 0) {
      wrapRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const input = card.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=radio]):not([tabindex='-1']), select, textarea");
    (input ?? card.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
  }, [stepId]);

  useEffect(() => {
    if (!error) return;
    cardRef.current?.querySelector("[role=alert]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  const up = (patch: Partial<WaitlistInput>) => onChange({ ...state, ...patch });

  function go(id: AssessmentStep) {
    setError(null);
    setStepId(id);
  }
  function next() {
    if (backToSummary) {
      setBackToSummary(false);
      return go("summary");
    }
    go(steps[Math.min(steps.length - 1, at + 1)]);
  }
  function back() {
    setError(null);
    if (backToSummary) {
      setBackToSummary(false);
      return go("summary");
    }
    if (at > 0) go(steps[at - 1]);
  }
  function change(id: AssessmentStep) {
    setBackToSummary(true);
    go(id);
  }
  function answer(patch: Partial<WaitlistInput>) {
    onChange({ ...state, ...patch });
    window.setTimeout(() => {
      if (backToSummary) {
        setBackToSummary(false);
        go("summary");
      } else {
        go(steps[Math.min(steps.length - 1, steps.indexOf(stepId) + 1)]);
      }
    }, 180);
  }

  function continueWith(e: React.FormEvent) {
    e.preventDefault();
    const problem = assessmentStepProblem(stepId, state, assessment);
    if (problem) return setError(problem);
    next();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = assessmentProblem(state, assessment);
    if (problem) return setError(problem);
    setBusy(true);
    const res = await onSubmit();
    setBusy(false);
    if (res) setError(res);
  }

  const progress = 10 + Math.round((at / Math.max(1, steps.length - 1)) * 90);
  const backLabel = backToSummary ? "Back to review" : "Back";
  const actions = (primary: React.ReactNode, extra?: React.ReactNode) => (
    <>
      <ErrorNote text={error} />
      <div className={s.actions}>
        {(at > 0 || backToSummary) && (
          <button type="button" className={s.back} onClick={back}>
            ← {backLabel}
          </button>
        )}
        {extra}
        {primary}
      </div>
    </>
  );

  const dobHint = hasDobRule(assessment) ? `This assessment is for ${assessmentRuleLabel(assessment)}.` : "His birthday.";

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.top}>
        <span className={s.eyebrow}>{assessment.name}</span>
        <button type="button" className={s.linkBtn} onClick={onFullForm}>
          See the whole form
        </button>
      </div>
      <div className={s.progress} aria-hidden="true">
        <div className={s.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={s.card} ref={cardRef} key={stepId}>
        {stepId === "intro" && (
          <form onSubmit={continueWith}>
            <Question title="Tell us about your son">
              {details || assessment.name}
              {when ? ` ${when}${assessment.place ? ` at ${assessment.place}` : ""}.` : assessment.place ? ` ${assessment.place}.` : " "}
              {" "}
              <a href={PROGRAMS_INFO_URL} target="_blank" rel="noreferrer" className={s.linkBtn}>
                Practice times and payment info
              </a>
              .
            </Question>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "name" && (
          <form onSubmit={continueWith}>
            <Question title="Who's coming to the assessment?">His first and last name.</Question>
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
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "dob" && (
          <form onSubmit={continueWith}>
            <Question title={`When is ${first === "your son" ? "his" : `${first}'s`} birthday?`}>{dobHint}</Question>
            <div className={s.body}>
              <label className={s.field}>
                Birthday
                <input className="olb-input" type="date" value={state.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} />
              </label>
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "grade" && (
          <form onSubmit={continueWith}>
            <Question title={`What grade is ${first === "your son" ? "he" : first} in?`}>
              {hasGradeRule(assessment) ? `This assessment is for ${assessmentRuleLabel(assessment)}.` : "His current grade."}
            </Question>
            <div className={`${s.body} ${s.choices}`}>
              {GRADES.map((g) => (
                <Choice key={g} on={state.grade === String(g)} onClick={() => answer({ grade: String(g) })} label={`${gradeLabel(g)} grade`} />
              ))}
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "homeschooled" && (
          <form onSubmit={continueWith}>
            <Question title={`Is ${first === "your son" ? "he" : first} homeschooled?`} />
            <div className={`${s.body} ${s.choices}`}>
              <Choice on={state.homeschooled === true} onClick={() => answer({ homeschooled: true })} label="Yes" />
              <Choice on={state.homeschooled === false} onClick={() => up({ homeschooled: false })} label="No" />
            </div>
            {state.homeschooled === false && (
              <p className={s.warn}>
                Lightning is a club for homeschooled boys, and our league has homeschool rules. You can still send this, and we&apos;ll
                reply to talk it through.
              </p>
            )}
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "experience" && (
          <form onSubmit={continueWith}>
            <Question title="Has he played basketball before?" />
            <div className={`${s.body} ${s.choices}`}>
              {EXPERIENCE.map((o) => (
                <Choice key={o} on={state.experience === o} onClick={() => answer({ experience: o })} label={o} />
              ))}
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "friends" && (
          <form onSubmit={continueWith}>
            <Question title="Any friends already playing for Lightning?">Optional.</Question>
            <div className={s.body}>
              <label className={s.field}>
                Friends on Lightning
                <input className="olb-input" value={state.friends} onChange={(e) => up({ friends: e.target.value })} />
              </label>
            </div>
            {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
          </form>
        )}

        {stepId === "heard" && (
          <form onSubmit={continueWith}>
            <Question title="How did you hear about us?">Optional.</Question>
            <div className={`${s.body} ${s.choices}`}>
              {HEARD_FROM.map((o) => (
                <Choice key={o} on={state.heard_from === o} onClick={() => answer({ heard_from: o })} label={o} />
              ))}
            </div>
            {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
          </form>
        )}

        {stepId === "you" && (
          <form onSubmit={continueWith}>
            <Question title="And you?">Your first and last name.</Question>
            <div className={s.body}>
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
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "contact" && (
          <form onSubmit={continueWith}>
            <Question title="How can we reach you?">We&apos;ll use this to get in touch about the assessment.</Question>
            <div className={s.body}>
              <label className={s.field}>
                Email
                <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.email} onChange={(e) => up({ email: e.target.value })} />
              </label>
              <label className={s.field}>
                Phone (optional)
                <input className="olb-input" type="tel" autoComplete="tel" value={state.phone} onChange={(e) => up({ phone: e.target.value })} />
              </label>
              <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "notes" && (
          <form onSubmit={continueWith}>
            <Question title="Anything else we should know?">Optional.</Question>
            <div className={s.body}>
              <label className={s.field}>
                Notes
                <textarea className="olb-input" rows={3} value={state.notes} onChange={(e) => up({ notes: e.target.value })} style={{ height: "auto", paddingTop: 10 }} />
              </label>
            </div>
            {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
          </form>
        )}

        {stepId === "summary" && (
          <form onSubmit={submit}>
            <Question title="Ready to send?">Take a last look. Tap Change to fix anything.</Question>
            <div className={s.body}>
              <Summary title={`${state.athlete_first} ${state.athlete_last}`.trim() || "Player"} onChange={() => change("name")}>
                <Line>{state.athlete_dob ? `Born ${formatDay(state.athlete_dob)}` : "Birthday not added"}</Line>
              </Summary>
              {hasGradeRule(assessment) || state.grade ? (
                <Summary title="Grade" onChange={() => change("grade")}>
                  <Line>{parseGradeLabel(state.grade)}</Line>
                </Summary>
              ) : null}
              <Summary title="Homeschooled" onChange={() => change("homeschooled")}>
                <Line>{state.homeschooled === true ? "Yes" : state.homeschooled === false ? "No" : "Not answered"}</Line>
              </Summary>
              <Summary title="Basketball so far" onChange={() => change("experience")}>
                <Line>{state.experience || "Not answered"}</Line>
              </Summary>
              {state.friends.trim() ? (
                <Summary title="Friends on Lightning" onChange={() => change("friends")}>
                  <Line>{state.friends.trim()}</Line>
                </Summary>
              ) : null}
              {state.heard_from ? (
                <Summary title="How you heard" onChange={() => change("heard")}>
                  <Line>{state.heard_from}</Line>
                </Summary>
              ) : null}
              <Summary title="You" onChange={() => change("you")}>
                <Line>{`${state.parent_first} ${state.parent_last}`.trim() || "Name not added"}</Line>
              </Summary>
              <Summary title="Contact" onChange={() => change("contact")}>
                <Line>{[state.email.trim(), state.phone.trim()].filter(Boolean).join(" · ") || "no email yet"}</Line>
              </Summary>
              {state.notes.trim() ? (
                <Summary title="Notes" onChange={() => change("notes")}>
                  <Line>{state.notes.trim()}</Line>
                </Summary>
              ) : null}
            </div>
            {actions(
              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? "Sending…" : "Sign up for an assessment"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function parseGradeLabel(grade: string | undefined): string {
  const n = Number(grade);
  if (!Number.isInteger(n) || n < 1 || n > 12) return "Grade not added";
  return `${gradeLabel(n)} grade`;
}
