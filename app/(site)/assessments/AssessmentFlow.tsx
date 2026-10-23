"use client";
import { useState } from "react";
import { AssessmentWizard } from "./AssessmentWizard";
import AssessmentForm from "./AssessmentForm";
import s from "../player-registration/wizard.module.css";
import { assessmentProblem, friendlyAssessmentClientError } from "../../../lib/onboarding/assessment-form";
import { type PublicAssessment } from "../../../lib/onboarding/assessments";
import { PRODUCTION_WRITE_BLOCKED } from "../../../lib/onboarding/preview-only";
import { emptyWaitlist, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";
import type { ProgramCopy } from "../../../lib/website/programs";

// The assessment page: the step-by-step wizard to start, or the whole form
// on one page. Both edit the same answers, so switching keeps them. The
// wizard stays mounted behind the full form, so switching back returns to
// the same step — same pattern as player registration.
//
// Submit goes through POST /api/assessments (JSON), not a Server Action.
// Next.js rejects some preview Server Action POSTs (Origin vs forwarded
// host) as "Invalid Server Actions request", which used to show only
// "Something went wrong. Please try again."

export default function AssessmentFlow({
  assessment,
  initial,
  save,
  programInfo,
}: {
  assessment: PublicAssessment;
  initial?: Partial<WaitlistInput>;
  save?: (input: WaitlistInput, honeypot: string) => Promise<{ error?: string }>;
  programInfo?: ProgramCopy | null;
}) {
  const [state, setState] = useState<WaitlistInput>({ ...emptyWaitlist(), ...initial });
  const [honeypot, setHoneypot] = useState("");
  const [view, setView] = useState<"wizard" | "form">("wizard");
  const [done, setDone] = useState(false);

  async function submit(): Promise<string | null> {
    const problem = assessmentProblem(state, assessment);
    if (problem) return problem;
    try {
      if (save) {
        const res = await save(state, honeypot);
        if (res.error) return res.error;
      } else {
        const res = await fetch("/api/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: state, honeypot, slug: assessment.slug }),
        });
        let data: { error?: string } = {};
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          data = {};
        }
        if (res.status === 401 || res.status === 403) {
          return data.error || PRODUCTION_WRITE_BLOCKED;
        }
        if (!res.ok || data.error) {
          return data.error || friendlyAssessmentClientError(new Error(`HTTP ${res.status}`));
        }
      }
      setDone(true);
      window.scrollTo({ top: 0 });
      return null;
    } catch (err) {
      return friendlyAssessmentClientError(err);
    }
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
          assessment={assessment}
          state={state}
          onChange={setState}
          onSubmit={submit}
          onFullForm={() => {
            setView("form");
            window.scrollTo({ top: 0 });
          }}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
          programInfo={programInfo}
        />
      </div>
      {view === "form" && (
        <AssessmentForm
          assessment={assessment}
          state={state}
          onChange={setState}
          onSubmit={submit}
          onWizard={() => {
            setView("wizard");
            window.scrollTo({ top: 0 });
          }}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
          programInfo={programInfo}
        />
      )}
    </>
  );
}
