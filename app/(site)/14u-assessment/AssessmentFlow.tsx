"use client";
import { useState } from "react";
import { AssessmentWizard } from "./AssessmentWizard";
import AssessmentForm from "./AssessmentForm";
import s from "../player-registration/wizard.module.css";
import { join14uAssessment } from "../../../lib/onboarding/public-actions";
import { assessmentProblem } from "../../../lib/onboarding/assessment-form";
import { emptyWaitlist, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";

// The assessment page: the step-by-step wizard to start, or the whole form
// on one page. Both edit the same answers, so switching keeps them. The
// wizard stays mounted behind the full form, so switching back returns to
// the same step — same pattern as player registration.

export default function AssessmentFlow({
  save = join14uAssessment,
}: {
  save?: typeof join14uAssessment;
} = {}) {
  const [state, setState] = useState<WaitlistInput>(emptyWaitlist);
  const [honeypot, setHoneypot] = useState("");
  const [view, setView] = useState<"wizard" | "form">("wizard");
  const [done, setDone] = useState(false);

  async function submit(): Promise<string | null> {
    const problem = assessmentProblem(state);
    if (problem) return problem;
    const res = await save(state, honeypot).catch(() => ({ error: "Something went wrong. Please try again." }));
    if (res.error) return res.error;
    setDone(true);
    window.scrollTo({ top: 0 });
    return null;
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={`${s.card} ${s.done}`}>
          <h2 className={s.question}>You&apos;re signed up for an assessment</h2>
          <p className={s.lead}>
            Thanks for telling us about {state.athlete_first.trim()}. We&apos;ll be in touch about next steps. Questions? Email{" "}
            <strong>lightningbasketballomaha@gmail.com</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div hidden={view !== "wizard"}>
        <AssessmentWizard
          state={state}
          onChange={setState}
          onSubmit={submit}
          onFullForm={() => {
            setView("form");
            window.scrollTo({ top: 0 });
          }}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
        />
      </div>
      {view === "form" && (
        <AssessmentForm
          state={state}
          onChange={setState}
          onSubmit={submit}
          onWizard={() => {
            setView("wizard");
            window.scrollTo({ top: 0 });
          }}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
        />
      )}
    </>
  );
}
