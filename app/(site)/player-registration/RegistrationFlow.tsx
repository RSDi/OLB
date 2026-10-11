"use client";
import { useState } from "react";
import { RegistrationWizard, type WizardApi } from "./RegistrationWizard";
import RegistrationForm from "./RegistrationForm";
import s from "./wizard.module.css";
import {
  checklistLinkFor,
  createRegistrations,
  startRegistrationEmail,
  verifyRegistrationEmail,
} from "../../../lib/teams/registration-actions";
import {
  SEASON_LABEL,
  emptyRegistration,
  kidsNames,
  newKid,
  registrationProblem,
  suggestedTier,
  toInputs,
  type RegistrationState,
} from "../../../lib/teams/registration-form";
import { DEFAULT_FEE_TIERS, type FeeTier } from "../../../lib/finances/fees";
import { FeeTiersProvider } from "./fee-tiers";
import { emptyExtras, extrasProblem, inputExtras, type ExtrasState, type FormExtras } from "../../../lib/onboarding/form-extras";

// A spot offered from the waitlist (0130): the player and the parent's email
// to start from, and the link's secret, sent back with the registration.
export interface OfferSeed {
  token: string;
  first: string;
  last: string;
  dob: string | null;
  email: string | null;
  expires: string;
}

function newSubmissionKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

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
  config = null,
  offer = null,
  feeTiers = DEFAULT_FEE_TIERS,
}: {
  // Swappable for trying the page without a server.
  api?: WizardApi;
  save?: typeof createRegistrations;
  // The registration workflow's extra questions (0130); null while it's off.
  config?: FormExtras | null;
  offer?: OfferSeed | null;
  // The season's fee tiers (Settings → Fees, 0131).
  feeTiers?: FeeTier[];
}) {
  const seed = offer
    ? () => {
        const fresh = emptyRegistration();
        fresh.kids = [newKid({ athlete_first: offer.first, athlete_last: offer.last, athlete_dob: offer.dob ?? "", first_season: true, fee_tier: suggestedTier(offer.dob, feeTiers) ?? "" })];
        return fresh;
      }
    : undefined;
  const [state, setState] = useState<RegistrationState>(seed ?? emptyRegistration);
  const [extras, setExtras] = useState<ExtrasState>(emptyExtras);
  // One key per registration, so sending twice saves it once.
  const [submissionKey, setSubmissionKey] = useState(newSubmissionKey);
  const [checklist, setChecklist] = useState<string | null>(null);
  const [view, setView] = useState<"wizard" | "form">("wizard");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [done, setDone] = useState<{ names: string; count: number } | null>(null);
  const [round, setRound] = useState(0);

  async function submit(): Promise<string | null> {
    const problem = registrationProblem(state) ?? extrasProblem(state.kids, extras, config);
    if (problem) return problem;
    const res = await save(toInputs(state, todayISO()), honeypot, verifiedEmail, {
      submissionKey,
      offerToken: offer?.token,
      extras: config ? state.kids.map((k) => inputExtras(k, extras, config)) : undefined,
    });
    if (res) return res;
    setChecklist(config ? await checklistLinkFor(submissionKey).catch(() => null) : null);
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
          {checklist && (
            <p className={s.lead}>
              Everything left to do is on your family&apos;s checklist. We&apos;ll email you the link too.
            </p>
          )}
          <div className={s.actions} style={{ justifyContent: "center" }}>
            {checklist && (
              <a className={s.primary} href={checklist} style={{ textDecoration: "none" }}>
                Open your checklist
              </a>
            )}
            <button
              type="button"
              className={s.secondary}
              onClick={() => {
                setState(emptyRegistration());
                setExtras(emptyExtras());
                setSubmissionKey(newSubmissionKey());
                setChecklist(null);
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
    <FeeTiersProvider tiers={feeTiers}>
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
          config={config}
          extras={extras}
          onExtras={setExtras}
          seed={round === 0 ? seed : undefined}
          startEmail={round === 0 ? offer?.email ?? undefined : undefined}
          banner={round === 0 && offer ? `We're holding a spot for ${offer.first} until ${offer.expires}. Start with your email and we'll walk you through it.` : null}
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
          config={config}
          extras={extras}
          onExtras={setExtras}
        />
      )}
    </FeeTiersProvider>
  );
}
