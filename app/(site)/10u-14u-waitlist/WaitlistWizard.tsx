"use client";
import { useEffect, useRef, useState } from "react";
import s from "../player-registration/wizard.module.css";
import { ContinueButton, Question, Choice, Summary, Line, ErrorNote } from "../player-registration/wizard-parts";
import {
  COMPETITIVE_WAITLIST_COPY,
  HOMESCHOOL_HELP,
  PARENT_NA_HELP,
  competitiveWaitlistProblem,
  type CompetitiveParent,
  type CompetitiveWaitlistInput,
} from "../../../lib/onboarding/competitive-waitlist-form";
import { COMPETITIVE_WAITLIST_STEPS, competitiveStepProblem, type CompetitiveWaitlistStep } from "../../../lib/onboarding/competitive-waitlist-steps";

// The 10U–14U competitive waitlist as a conversation: one Cognito question
// group at a time, same chrome and "See the whole form" toggle as player
// registration. Answers are shared with the one-page form.

export function CompetitiveWaitlistWizard({
  state,
  onChange,
  onSubmit,
  onFullForm,
  honeypot,
  onHoneypot,
}: {
  state: CompetitiveWaitlistInput;
  onChange: (next: CompetitiveWaitlistInput) => void;
  onSubmit: () => Promise<string | null>;
  onFullForm: () => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  const [stepId, setStepId] = useState<CompetitiveWaitlistStep>("intro");
  const [backToSummary, setBackToSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const steps = COMPETITIVE_WAITLIST_STEPS;
  const at = Math.max(0, steps.indexOf(stepId));
  const first = state.athlete_first.trim() || "your athlete";

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

  const up = (patch: Partial<CompetitiveWaitlistInput>) => onChange({ ...state, ...patch });
  const upParent = (who: "father" | "mother", patch: Partial<CompetitiveParent>) =>
    onChange({ ...state, [who]: { ...state[who], ...patch } });

  function go(id: CompetitiveWaitlistStep) {
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
  function change(id: CompetitiveWaitlistStep) {
    setBackToSummary(true);
    go(id);
  }
  function answer(patch: Partial<CompetitiveWaitlistInput>) {
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
    const problem = competitiveStepProblem(stepId, state);
    if (problem) return setError(problem);
    next();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = competitiveWaitlistProblem(state);
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

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.top}>
        <span className={s.eyebrow}>10U–14U competitive waitlist</span>
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
            <Question title="10u-14u Competitive Waitlist">{COMPETITIVE_WAITLIST_COPY}</Question>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "name" && (
          <form onSubmit={continueWith}>
            <Question title="Athlete Name" />
            <div className={s.body}>
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
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "birthdate" && (
          <form onSubmit={continueWith}>
            <Question title="Athlete Birthdate" />
            <div className={s.body}>
              <label className={s.field}>
                Athlete Birthdate
                <input className="olb-input" type="date" value={state.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} />
              </label>
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "first-experience" && (
          <form onSubmit={continueWith}>
            <Question title="Is this your first experience with Omaha Lightning Basketball?" />
            <div className={`${s.body} ${s.choices}`}>
              <Choice on={state.first_experience === true} onClick={() => answer({ first_experience: true })} label="Yes" />
              <Choice on={state.first_experience === false} onClick={() => answer({ first_experience: false })} label="No" />
            </div>
            {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
          </form>
        )}

        {stepId === "athlete-contact" && (
          <form onSubmit={continueWith}>
            <Question title="Athlete Phone and Email">Optional.</Question>
            <div className={s.body}>
              <label className={s.field}>
                Athlete Phone
                <input className="olb-input" type="tel" autoComplete="tel" value={state.athlete_phone} onChange={(e) => up({ athlete_phone: e.target.value })} />
              </label>
              <label className={s.field}>
                Athlete Email
                <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.athlete_email} onChange={(e) => up({ athlete_email: e.target.value })} />
              </label>
            </div>
            {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
          </form>
        )}

        {stepId === "homeschooled" && (
          <form onSubmit={continueWith}>
            <Question title={`Is ${first === "your athlete" ? "your athlete" : first} homeschooled?`}>{HOMESCHOOL_HELP}</Question>
            <div className={`${s.body} ${s.choices}`}>
              <Choice on={state.homeschooled === true} onClick={() => answer({ homeschooled: true })} label="Yes" />
              <Choice on={state.homeschooled === false} onClick={() => up({ homeschooled: false })} label="No" />
            </div>
            {state.homeschooled === false && (
              <p className={s.warn}>
                Cognito requires Yes on this question. Lightning is a club for homeschooled boys. You can email{" "}
                <strong>LightningBasketballOmaha@gmail.com</strong> to talk it through.
              </p>
            )}
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "father" && (
          <form onSubmit={continueWith}>
            <Question title="Father's Name">{PARENT_NA_HELP}</Question>
            <div className={s.body}>
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
              <label className={s.field}>
                Father&apos;s Email
                <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.father.email} onChange={(e) => upParent("father", { email: e.target.value })} />
              </label>
              <label className={s.field}>
                Father&apos;s Phone
                <input className="olb-input" type="tel" autoComplete="tel" value={state.father.phone} onChange={(e) => upParent("father", { phone: e.target.value })} />
              </label>
              <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "mother" && (
          <form onSubmit={continueWith}>
            <Question title="Mother's Name">{PARENT_NA_HELP}</Question>
            <div className={s.body}>
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
              <label className={s.field}>
                Mother&apos;s Email
                <input className="olb-input" type="email" inputMode="email" autoComplete="email" value={state.mother.email} onChange={(e) => upParent("mother", { email: e.target.value })} />
              </label>
              <label className={s.field}>
                Mother&apos;s Phone
                <input className="olb-input" type="tel" autoComplete="tel" value={state.mother.phone} onChange={(e) => upParent("mother", { phone: e.target.value })} />
              </label>
            </div>
            {actions(<ContinueButton />)}
          </form>
        )}

        {stepId === "summary" && (
          <form onSubmit={submit}>
            <Question title="Ready to send?">Take a last look. Tap Change to fix anything.</Question>
            <div className={s.body}>
              <Summary title={`${state.athlete_first} ${state.athlete_last}`.trim() || "Athlete Name"} onChange={() => change("name")}>
                <Line>{state.athlete_dob ? `Born ${formatDay(state.athlete_dob)}` : "Birthdate not added"}</Line>
              </Summary>
              <Summary title="First experience with Omaha Lightning Basketball" onChange={() => change("first-experience")}>
                <Line>{state.first_experience === true ? "Yes" : state.first_experience === false ? "No" : "Not answered"}</Line>
              </Summary>
              {(state.athlete_phone.trim() || state.athlete_email.trim()) && (
                <Summary title="Athlete contact" onChange={() => change("athlete-contact")}>
                  <Line>{[state.athlete_phone.trim(), state.athlete_email.trim()].filter(Boolean).join(" · ")}</Line>
                </Summary>
              )}
              <Summary title="Homeschooled" onChange={() => change("homeschooled")}>
                <Line>{state.homeschooled === true ? "Yes" : state.homeschooled === false ? "No" : "Not answered"}</Line>
              </Summary>
              <Summary title="Father" onChange={() => change("father")}>
                <Line>{parentLine(state.father)}</Line>
              </Summary>
              <Summary title="Mother" onChange={() => change("mother")}>
                <Line>{parentLine(state.mother)}</Line>
              </Summary>
            </div>
            {actions(
              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? "Sending…" : "Join the waitlist"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function parentLine(p: CompetitiveParent): string {
  const name = `${p.first} ${p.last}`.trim() || "Name not added";
  const contact = [p.email.trim(), p.phone.trim()].filter(Boolean).join(" · ");
  return contact ? `${name} · ${contact}` : name;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
