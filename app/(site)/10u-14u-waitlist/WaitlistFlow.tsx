"use client";
import { useState } from "react";
import { CompetitiveWaitlistWizard } from "./WaitlistWizard";
import CompetitiveWaitlistForm from "./WaitlistFullForm";
import s from "../player-registration/wizard.module.css";
import {
  COMPETITIVE_WAITLIST_API,
  PRODUCTION_WRITE_BLOCKED,
  competitiveWaitlistProblem,
  emptyCompetitiveWaitlist,
  friendlyCompetitiveClientError,
  type CompetitiveWaitlistInput,
} from "../../../lib/onboarding/competitive-waitlist-form";

// The waitlist page: the step-by-step wizard to start, or the whole form
// on one page. Both edit the same answers, so switching keeps them. The
// wizard stays mounted behind the full form, so switching back returns to
// the same step — same pattern as player registration.
//
// Submit goes through POST /api/10u-14u-waitlist (JSON), not a Server Action,
// so a blocked preview Server Action can't hide the real error.

export default function CompetitiveWaitlistFlow({
  save,
}: {
  save?: (input: CompetitiveWaitlistInput, honeypot: string) => Promise<{ error?: string }>;
} = {}) {
  const [state, setState] = useState<CompetitiveWaitlistInput>(emptyCompetitiveWaitlist);
  const [honeypot, setHoneypot] = useState("");
  const [view, setView] = useState<"wizard" | "form">("wizard");
  const [done, setDone] = useState(false);

  async function submit(): Promise<string | null> {
    const problem = competitiveWaitlistProblem(state);
    if (problem) return problem;
    try {
      if (save) {
        const res = await save(state, honeypot);
        if (res.error) return res.error;
      } else {
        const res = await fetch(COMPETITIVE_WAITLIST_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: state, honeypot }),
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
          return data.error || friendlyCompetitiveClientError(new Error(`HTTP ${res.status}`));
        }
      }
      setDone(true);
      window.scrollTo({ top: 0 });
      return null;
    } catch (err) {
      return friendlyCompetitiveClientError(err);
    }
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={`${s.card} ${s.done}`}>
          <h2 className={s.question}>You&apos;re on the waitlist!</h2>
          <p className={s.lead}>
            Thanks for telling us about {state.athlete_first.trim()}. We&apos;ll contact you when space is available. Questions? Email{" "}
            <strong>lightningbasketballomaha@gmail.com</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div hidden={view !== "wizard"}>
        <CompetitiveWaitlistWizard
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
        <CompetitiveWaitlistForm
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
