"use client";
import { useState } from "react";
import { RegistrationWizard, type WizardApi } from "./RegistrationWizard";
import RegistrationForm from "./RegistrationForm";
import s from "./wizard.module.css";
import {
  createRegistrations,
  startRegistrationEmail,
  verifyRegistrationEmail,
} from "../../../lib/teams/registration-actions";
import {
  SEASON_LABEL,
  emptyRegistration,
  kidsNames,
  registrationProblem,
  toInputs,
  type RegistrationState,
} from "../../../lib/teams/registration-form";

const LIVE_API: WizardApi = { sendCode: startRegistrationEmail, checkCode: verifyRegistrationEmail };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The registration page: the step-by-step wizard to start, or the whole form
// on one page. Both edit the same answers, so switching keeps them.
export default function RegistrationFlow({
  api = LIVE_API,
  save = createRegistrations,
}: {
  // Swappable for trying the page without a server.
  api?: WizardApi;
  save?: typeof createRegistrations;
}) {
  const [state, setState] = useState<RegistrationState>(emptyRegistration);
  const [view, setView] = useState<"wizard" | "form">("wizard");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [done, setDone] = useState<{ names: string; count: number } | null>(null);
  const [round, setRound] = useState(0);

  async function submit(): Promise<string | null> {
    const problem = registrationProblem(state);
    if (problem) return problem;
    const res = await save(toInputs(state, todayISO()), honeypot, verifiedEmail);
    if (res) return res;
    setDone({ names: kidsNames(state.kids), count: state.kids.length });
    window.scrollTo({ top: 0 });
    return null;
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={`${s.card} ${s.done}`}>
          <div className={s.doneMark} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className={s.question}>You&apos;re registered!</h2>
          <p className={s.lead}>
            {done.names} {done.count > 1 ? "are" : "is"} on the list for {SEASON_LABEL}. A coach will look over the
            registration and follow up about team placement and payment. Questions? Email{" "}
            <strong>lightningbasketballomaha@gmail.com</strong>.
          </p>
          <div className={s.actions} style={{ justifyContent: "center" }}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => {
                setState(emptyRegistration());
                setVerifiedEmail(null);
                setView("wizard");
                setRound((n) => n + 1);
                setDone(null);
              }}
            >
              Register another player
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* The wizard stays mounted behind the full form, so switching back
          returns to the same step. */}
      <div hidden={view !== "wizard"}>
        <RegistrationWizard
          key={round}
          state={state}
          onChange={setState}
          api={api}
          onSubmit={submit}
          onFullForm={() => {
            setView("form");
            window.scrollTo({ top: 0 });
          }}
          onVerified={setVerifiedEmail}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
        />
      </div>
      {view === "form" && (
        <RegistrationForm
          state={state}
          onChange={setState}
          onSubmit={submit}
          onWizard={() => {
            setView("wizard");
            window.scrollTo({ top: 0 });
          }}
          honeypot={honeypot}
          onHoneypot={setHoneypot}
          today={todayISO()}
        />
      )}
    </>
  );
}
