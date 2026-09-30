"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import s from "./wizard.module.css";
import SignaturePad from "./SignaturePad";
import { NCHC_TEXT, US_STATES, WAIVER_INTRO, WAIVER_ITEMS } from "./content";
import { VOLUNTEER_OPTIONS } from "../../../lib/teams/volunteer-options";
import {
  AGE_CUTOFF_LABEL,
  FEE_TIERS,
  MAX_PLAYERS,
  PAYMENT_OPTIONS,
  SEASON_LABEL,
  emptyRegistration,
  fromPrefill,
  isHighSchoolTier,
  kidFirst,
  kidsNames,
  looksLikeEmail,
  newKid,
  registrationProblem,
  suggestedTier,
  tierParts,
  type FamilyAnswers,
  type FamilyPrefill,
  type KidAnswers,
  type RegistrationState,
} from "../../../lib/teams/registration-form";
import { ComboSelect } from "../../components/ComboSelect";

export interface WizardApi {
  sendCode: (email: string, honeypot: string) => Promise<{ sent: boolean; error?: string }>;
  checkCode: (
    email: string,
    code: string
  ) => Promise<{ ok: true; family: FamilyPrefill | null } | { ok: false; error: string }>;
}

type Stage = "email" | "code" | "who" | "steps";
type Mode = "returning" | "new";
type Parent = "father" | "mother";

// The registration as a conversation: an email (and a code, so we know it's
// theirs), then what we already know for a returning family to look over,
// or every question in turn for a new one. Several players on one email are
// registered together. "See the whole form" swaps to the one-page form with
// the same answers.
export function RegistrationWizard({
  state,
  onChange,
  api,
  onSubmit,
  onFullForm,
  onVerified,
  honeypot,
  onHoneypot,
}: {
  state: RegistrationState;
  onChange: (next: RegistrationState) => void;
  api: WizardApi;
  onSubmit: () => Promise<string | null>;
  onFullForm: () => void;
  onVerified: (email: string) => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("email");
  const [mode, setMode] = useState<Mode>("new");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [family, setFamily] = useState<FamilyPrefill | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [added, setAdded] = useState(0);
  const [you, setYou] = useState<Parent | null>(null);
  const [stepId, setStepId] = useState("");
  const [backToSummary, setBackToSummary] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const f = state.family;
  const kids = state.kids;
  const fromFile = new Set(family?.players.map((p) => p.key) ?? []);
  const steps = buildSteps(mode, state, fromFile);
  const at = Math.max(0, steps.indexOf(stepId));

  // A new step: back to the top of the card, with the first box ready to type
  // in (or the question, for a screen reader).
  const focusKey = `${stage}:${stepId}`;
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (wrapRef.current && wrapRef.current.getBoundingClientRect().top < 0) {
      wrapRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const input = card.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=radio]):not([tabindex='-1']), select");
    (input ?? card.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
  }, [focusKey]);

  const up = (patch: Partial<FamilyAnswers>) => onChange({ ...state, family: { ...f, ...patch } });
  const upKid = (key: string, patch: Partial<KidAnswers>) =>
    onChange({ ...state, kids: kids.map((k) => (k.key === key ? { ...k, ...patch } : k)) });

  function go(id: string) {
    setError(null);
    setEditing(null);
    setStepId(id);
  }
  function next(after?: RegistrationState) {
    const list = after ? buildSteps(mode, after, fromFile) : steps;
    if (backToSummary) {
      setBackToSummary(false);
      return go("summary");
    }
    const i = list.indexOf(stepId);
    go(list[Math.min(list.length - 1, i + 1)]);
  }
  function back() {
    setError(null);
    if (backToSummary) {
      setBackToSummary(false);
      return go("summary");
    }
    if (at > 0) return go(steps[at - 1]);
    if (mode === "returning") return setStage("who");
    setStage(email ? "code" : "email");
  }
  function change(id: string) {
    setBackToSummary(true);
    go(id);
  }
  // A single answer moves straight on, after a beat to show it was picked.
  function answer(patch: () => RegistrationState) {
    const nextState = patch();
    onChange(nextState);
    window.setTimeout(() => next(nextState), 180);
  }

  // ── Email and code ───────────────────────────────────────────────────
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    if (!looksLikeEmail(email)) return setError("That email doesn't look right. Check it for typos.");
    setBusy(true);
    const res = await api.sendCode(email.trim(), honeypot);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.sent) {
      setCode("");
      setStage("code");
    } else {
      startNew("We couldn't send a code just now, so let's fill it in together.");
    }
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await api.checkCode(email.trim(), code);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onVerified(email.trim().toLowerCase());
    if (res.family && res.family.players.length > 0) {
      setFamily(res.family);
      setPicked(res.family.players.filter((p) => !p.registeredThisSeason).map((p) => p.key));
      setAdded(0);
      setStage("who");
    } else {
      startNew(null);
    }
  }

  function startNew(message: string | null) {
    setMode("new");
    setFamily(null);
    setNotice(message);
    const fresh = emptyRegistration();
    onChange(fresh);
    setStage("steps");
    setStepId(`name:${fresh.kids[0].key}`);
  }

  function startReturning() {
    if (!family) return;
    const extra = Array.from({ length: added }, () => newKid({ athlete_last: family.players[0]?.last ?? "" }));
    const filled = fromPrefill(family, picked, extra);
    // The checked email belongs on the parent it came from.
    const rel = family.relationship;
    if ((rel === "father" || rel === "mother") && !filled.family[`${rel}_email`]) filled.family[`${rel}_email`] = email.trim();
    onChange(filled);
    setMode("returning");
    setStage("steps");
    const list = buildSteps("returning", filled, new Set(family.players.map((p) => p.key)));
    setStepId(list[0]);
  }

  // ── Submit ───────────────────────────────────────────────────────────
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = registrationProblem(state);
    if (problem) return setError(problem);
    setBusy(true);
    const res = await onSubmit();
    setBusy(false);
    if (res) setError(res);
  }

  // ── Layout ───────────────────────────────────────────────────────────
  const progress =
    stage === "email" ? 3 : stage === "code" ? 6 : stage === "who" ? 9 : 10 + Math.round((at / Math.max(1, steps.length - 1)) * 90);

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.top}>
        <span className={s.eyebrow}>{SEASON_LABEL} Registration</span>
        <button type="button" className={s.linkBtn} onClick={onFullForm}>
          See the whole form
        </button>
      </div>
      <div className={s.progress} aria-hidden="true">
        <div className={s.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={s.card} ref={cardRef} key={focusKey}>
        {stage === "email" && (
          <form onSubmit={sendCode}>
            <Question title="Let's get your player registered">
              Start with your email. If you&apos;ve registered with us before, we&apos;ll fill in what we already know,
              so it only takes a minute.
            </Question>
            <div className={s.body}>
              <label className={s.field}>
                Your email
                <input
                  className="olb-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <p className={s.note}>We&apos;ll email you a 6-digit code to make sure it&apos;s you. Nobody sees your family&apos;s details without it.</p>
              <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            </div>
            <ErrorNote text={error} />
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? "Sending…" : "Continue"}
              </button>
            </div>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={checkCode}>
            <Question title="Check your email">
              We sent a 6-digit code to <strong>{email.trim()}</strong>. It works for 10 minutes.
            </Question>
            <div className={s.body}>
              <label className={s.field}>
                Code
                <input
                  className={`olb-input ${s.codeInput}`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={9}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                />
              </label>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <button type="button" className={s.linkBtn} onClick={() => sendCode()} disabled={busy}>
                  Send a new code
                </button>
                <button type="button" className={s.linkBtn} onClick={() => { setStage("email"); setError(null); }}>
                  Use a different email
                </button>
                <button type="button" className={s.linkBtn} onClick={() => startNew("No problem. We'll ask you everything instead.")}>
                  Can&apos;t find it? Continue without it
                </button>
              </div>
            </div>
            <ErrorNote text={error} />
            <div className={s.actions}>
              <button type="button" className={s.back} onClick={() => setStage("email")}>
                ← Back
              </button>
              <button type="submit" className={s.primary} disabled={busy || code.replace(/\D/g, "").length !== 6}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </div>
          </form>
        )}

        {stage === "who" && family && (
          <form onSubmit={(e) => { e.preventDefault(); startReturning(); }}>
            <Question title={`Welcome back${family.firstName ? `, ${family.firstName}` : ""}!`}>
              {family.players.length > 1
                ? `We found ${family.players.length} players in your family. Who's playing in ${SEASON_LABEL}?`
                : `Is ${family.players[0].first} playing in ${SEASON_LABEL}?`}
            </Question>
            <div className={`${s.body} ${s.choices}`}>
              {family.players.map((p) => {
                const on = picked.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={s.choice}
                    onClick={() => setPicked((list) => (on ? list.filter((k) => k !== p.key) : [...list, p.key]))}
                  >
                    <span>
                      {p.first} {p.last}
                      <span className={s.choiceSub}>
                        {[p.dob && `Born ${formatDay(p.dob)}`, p.registeredThisSeason && (on ? "Already registered, so this updates their details" : `Already registered for ${SEASON_LABEL}`)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Tick />
                  </button>
                );
              })}
              {Array.from({ length: added }, (_, i) => (
                <div key={i} className={s.choice} aria-checked="true" role="checkbox">
                  <span>
                    A brother or sister
                    <span className={s.choiceSub}>You&apos;ll add their details next</span>
                  </span>
                  <button type="button" className={s.linkBtn} onClick={() => setAdded((n) => n - 1)}>
                    Remove
                  </button>
                </div>
              ))}
              {picked.length + added < MAX_PLAYERS && (
                <button type="button" className={s.choice} onClick={() => setAdded((n) => n + 1)}>
                  <span>
                    + Add a brother or sister
                    <span className={s.choiceSub}>Someone who isn&apos;t listed here</span>
                  </span>
                </button>
              )}
            </div>
            <div className={s.actions}>
              <button type="button" className={s.back} onClick={() => startNew(null)}>
                Start fresh instead
              </button>
              <button type="submit" className={s.primary} disabled={picked.length + added === 0}>
                Continue
              </button>
            </div>
          </form>
        )}

        {stage === "steps" && (
          <Step
            id={stepId}
            mode={mode}
            state={state}
            fromFile={fromFile}
            you={you}
            email={email.trim()}
            notice={at === 0 ? notice : null}
            editing={editing}
            setEditing={setEditing}
            up={up}
            upKid={upKid}
            onChange={onChange}
            setYou={setYou}
            next={next}
            answer={answer}
            go={go}
            change={change}
            back={back}
            busy={busy}
            error={error}
            setError={setError}
            submit={submit}
            backLabel={backToSummary ? "Back to review" : "Back"}
          />
        )}
      </div>

      {stage === "email" && (
        <p className="olb-sub" style={{ textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          This registration is for current Lightning players and their brothers and sisters. New to Lightning? Join the
          waitlist on our <Link href="/programs">Programs</Link> page. Questions? Email{" "}
          <strong>lightningbasketballomaha@gmail.com</strong>.
        </p>
      )}
    </div>
  );
}

// ─── Which steps, in what order ─────────────────────────────────────────────

function buildSteps(mode: Mode, st: RegistrationState, fromFile: Set<string>): string[] {
  const out: string[] = [];
  const kidSteps = (k: KidAnswers) => [`name:${k.key}`, `dob:${k.key}`, `first:${k.key}`];
  if (mode === "new") {
    for (const k of st.kids) out.push(...kidSteps(k));
    out.push("more", "home", "contact", "you", "you-details", "other-parent");
  } else {
    if (st.kids.some((k) => fromFile.has(k.key))) out.push("review-kids");
    for (const k of st.kids) if (!fromFile.has(k.key)) out.push(...kidSteps(k));
    out.push("review-home", "review-parents");
  }
  out.push("fees", "uniform");
  if (st.kids.some((k) => isHighSchoolTier(k.fee_tier))) out.push("grays");
  out.push("homeschool");
  if (st.family.father_first.trim()) out.push("help-father");
  if (st.family.mother_first.trim()) out.push("help-mother");
  out.push("directory", "waiver", "donation", "payment", "summary");
  return out;
}

// ─── One step ───────────────────────────────────────────────────────────────

interface StepProps {
  id: string;
  mode: Mode;
  state: RegistrationState;
  fromFile: Set<string>;
  you: Parent | null;
  email: string;
  notice: string | null;
  editing: string | null;
  setEditing: (v: string | null) => void;
  up: (patch: Partial<FamilyAnswers>) => void;
  upKid: (key: string, patch: Partial<KidAnswers>) => void;
  onChange: (next: RegistrationState) => void;
  setYou: (p: Parent) => void;
  next: (after?: RegistrationState) => void;
  answer: (patch: () => RegistrationState) => void;
  go: (id: string) => void;
  change: (id: string) => void;
  back: () => void;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  submit: (e: React.FormEvent) => void;
  backLabel: string;
}

function Step(p: StepProps) {
  const { id, state, up, upKid, next } = p;
  const f = state.family;
  const kids = state.kids;
  const many = kids.length > 1;
  const names = kidsNames(kids);
  const [kind, kidKey] = id.split(":");
  const kid = kids.find((k) => k.key === kidKey);
  const other: Parent = p.you === "father" ? "mother" : "father";
  const continueWith = (ok: boolean, message: string) => (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return p.setError(message);
    next();
  };
  const actions = (primary: React.ReactNode, extra?: React.ReactNode) => (
    <>
      <ErrorNote text={p.error} />
      <div className={s.actions}>
        <button type="button" className={s.back} onClick={p.back}>
          ← {p.backLabel}
        </button>
        {extra}
        {primary}
      </div>
    </>
  );
  const notice = p.notice ? <p className={s.note}>{p.notice}</p> : null;

  // ── A player: name, birthday, first season ──
  if (kind === "name" && kid) {
    const index = kids.indexOf(kid);
    return (
      <form onSubmit={continueWith(!!kid.athlete_first.trim() && !!kid.athlete_last.trim(), "Please add a first and last name.")}>
        <Question title={index === 0 ? "Let's start with your player. Who's playing?" : "Who else is playing?"}>
          Their first and last name.
        </Question>
        <div className={s.body}>
          {notice}
          <div className={s.row2}>
            <label className={s.field}>
              First name
              <input className="olb-input" autoComplete="off" value={kid.athlete_first} onChange={(e) => upKid(kid.key, { athlete_first: e.target.value })} />
            </label>
            <label className={s.field}>
              Last name
              <input className="olb-input" autoComplete="off" value={kid.athlete_last} onChange={(e) => upKid(kid.key, { athlete_last: e.target.value })} />
            </label>
          </div>
        </div>
        {actions(<ContinueButton />, index > 0 && (
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              const rest = kids.filter((k) => k.key !== kid.key);
              p.onChange({ ...state, kids: rest });
              p.go(p.mode === "new" ? "more" : "review-home");
            }}
          >
            Remove
          </button>
        ))}
      </form>
    );
  }

  if (kind === "dob" && kid) {
    return (
      <form onSubmit={continueWith(!!kid.athlete_dob, "Please add a birthday.")}>
        <Question title={`When is ${kidFirst(kid)}'s birthday?`}>Teams go by age on {AGE_CUTOFF_LABEL}.</Question>
        <div className={s.body}>
          <label className={s.field}>
            Birthday
            <input
              className="olb-input"
              type="date"
              value={kid.athlete_dob}
              onChange={(e) => {
                const dob = e.target.value;
                const tier = suggestedTier(dob);
                upKid(kid.key, { athlete_dob: dob, ...(tier ? { fee_tier: tier } : {}) });
              }}
            />
          </label>
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "first" && kid) {
    const set = (v: boolean) =>
      p.answer(() => ({ ...state, kids: kids.map((k) => (k.key === kid.key ? { ...k, first_season: v } : k)) }));
    return (
      <form onSubmit={continueWith(kid.first_season !== null, "Please pick one.")}>
        <Question title={`Is this ${kidFirst(kid)}'s first season with Lightning?`} />
        <div className={`${s.body} ${s.choices}`}>
          <Choice on={kid.first_season === true} onClick={() => set(true)} label="Yes, it's our first season" />
          <Choice on={kid.first_season === false} onClick={() => set(false)} label={`No, ${kidFirst(kid)} has played before`} />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "more") {
    const add = () => {
      const k = newKid({ athlete_last: kids[0]?.athlete_last ?? "" });
      p.onChange({ ...state, kids: [...kids, k] });
      p.go(`name:${k.key}`);
    };
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title="Registering a brother or sister too?">You can do them all at once.</Question>
        <div className={`${s.body} ${s.choices}`}>
          {kids.length < MAX_PLAYERS && <Choice on={false} onClick={add} label="Yes, add another player" />}
          <Choice on={false} onClick={() => next()} label={`No, just ${names}`} />
        </div>
        {actions(null)}
      </form>
    );
  }

  // ── Home and contact ──
  if (kind === "home" || (kind === "review-home" && p.editing === "home")) {
    const ok = !!f.address_line1.trim() && !!f.city.trim() && !!f.state && !!f.zip.trim();
    return (
      <form onSubmit={continueWith(ok, "Please fill in the street, city, state and zip.")}>
        <Question title="What's your home address?" />
        <div className={s.body}>
          <AddressFields f={f} up={up} />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "review-home") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title="Do you still live here?" />
        <div className={s.body}>
          <Summary title="Home" onChange={() => p.setEditing("home")}>
            <Line>{addressLines(f)}</Line>
          </Summary>
        </div>
        {actions(<ContinueButton label="Yes, still here" />)}
      </form>
    );
  }

  if (kind === "contact") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title={many ? `Do ${names} have a phone or email of their own?` : `Does ${names} have a phone or email of their own?`}>
          Optional. Older players often like team messages to come straight to them.
        </Question>
        <div className={s.body}>
          {kids.map((k) => (
            <div key={k.key} className={s.row2}>
              <label className={s.field}>
                {many ? `${kidFirst(k)}'s phone` : "Phone"}
                <input className="olb-input" type="tel" autoComplete="off" value={k.athlete_phone} onChange={(e) => upKid(k.key, { athlete_phone: e.target.value })} />
              </label>
              <label className={s.field}>
                {many ? `${kidFirst(k)}'s email` : "Email"}
                <input className="olb-input" type="email" autoComplete="off" value={k.athlete_email} onChange={(e) => upKid(k.key, { athlete_email: e.target.value })} />
              </label>
            </div>
          ))}
        </div>
        {actions(<ContinueButton />, <button type="button" className={s.secondary} onClick={() => next()}>Skip</button>)}
      </form>
    );
  }

  // ── Parents, for a new family ──
  if (kind === "you") {
    const pick = (who: Parent) => {
      p.setYou(who);
      p.answer(() => ({
        ...state,
        family: { ...f, [`${who}_email`]: f[`${who}_email`] || p.email },
      }));
    };
    return (
      <form onSubmit={continueWith(!!p.you, "Please pick one.")}>
        <Question title={`Are you ${names}'s mom or dad?`}>A guardian? Pick the one that fits best.</Question>
        <div className={`${s.body} ${s.choices}`}>
          <Choice on={p.you === "mother"} onClick={() => pick("mother")} label="Mom" />
          <Choice on={p.you === "father"} onClick={() => pick("father")} label="Dad" />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "you-details" && p.you) {
    const who = p.you;
    const ok = !!f[`${who}_first`].trim() && !!f[`${who}_last`].trim();
    return (
      <form onSubmit={continueWith(ok, "Please add your first and last name.")}>
        <Question title="Nice to meet you! What's your name?">And the best phone number for team news.</Question>
        <div className={s.body}>
          <ParentFields who={who} f={f} up={up} />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "other-parent" && p.you) {
    const word = other === "mother" ? "mom" : "dad";
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title={`And ${names}'s ${word}?`}>So we can reach either of you.</Question>
        <div className={s.body}>
          <ParentFields who={other} f={f} up={up} withEmail />
        </div>
        {actions(
          <ContinueButton />,
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              up({ [`${other}_first`]: "", [`${other}_last`]: "", [`${other}_email`]: "", [`${other}_phone`]: "" } as Partial<FamilyAnswers>);
              next();
            }}
          >
            Skip, it&apos;s just me
          </button>
        )}
      </form>
    );
  }

  // ── Looking over what we have, for a returning family ──
  if (kind === "review-kids") {
    const onFile = kids.filter((k) => p.fromFile.has(k.key));
    const editingKid = onFile.find((k) => p.editing === k.key);
    const ok = onFile.every((k) => k.athlete_first.trim() && k.athlete_last.trim() && k.athlete_dob);
    return (
      <form onSubmit={continueWith(ok, "Each player needs a first and last name and a birthday.")}>
        <Question title={onFile.length > 1 ? "Are these still right?" : "Is this still right?"}>
          Here&apos;s what we have. Tap Change to fix anything.
        </Question>
        <div className={s.body}>
          {onFile.map((k) =>
            editingKid?.key === k.key ? (
              <div key={k.key} className={s.summary}>
                <div className={s.row2}>
                  <label className={s.field}>
                    First name
                    <input className="olb-input" value={k.athlete_first} onChange={(e) => upKid(k.key, { athlete_first: e.target.value })} />
                  </label>
                  <label className={s.field}>
                    Last name
                    <input className="olb-input" value={k.athlete_last} onChange={(e) => upKid(k.key, { athlete_last: e.target.value })} />
                  </label>
                </div>
                <label className={s.field}>
                  Birthday
                  <input
                    className="olb-input"
                    type="date"
                    value={k.athlete_dob}
                    onChange={(e) => upKid(k.key, { athlete_dob: e.target.value, fee_tier: suggestedTier(e.target.value) ?? k.fee_tier })}
                  />
                </label>
                <div className={s.row2}>
                  <label className={s.field}>
                    Their phone
                    <input className="olb-input" type="tel" value={k.athlete_phone} onChange={(e) => upKid(k.key, { athlete_phone: e.target.value })} />
                  </label>
                  <label className={s.field}>
                    Their email
                    <input className="olb-input" type="email" value={k.athlete_email} onChange={(e) => upKid(k.key, { athlete_email: e.target.value })} />
                  </label>
                </div>
                <button type="button" className={s.linkBtn} style={{ alignSelf: "flex-start" }} onClick={() => p.setEditing(null)}>
                  Done
                </button>
              </div>
            ) : (
              <Summary key={k.key} title={`${k.athlete_first} ${k.athlete_last}`.trim()} onChange={() => p.setEditing(k.key)}>
                <Line>{k.athlete_dob ? `Born ${formatDay(k.athlete_dob)}` : "No birthday on file"}</Line>
                {(k.athlete_phone || k.athlete_email) && <Line>{[k.athlete_phone, k.athlete_email].filter(Boolean).join(" · ")}</Line>}
              </Summary>
            )
          )}
        </div>
        {actions(<ContinueButton label="Yes, that's right" />)}
      </form>
    );
  }

  if (kind === "review-parents") {
    const card = (who: Parent) => {
      const label = who === "father" ? "Dad" : "Mom";
      if (p.editing === who) {
        return (
          <div key={who} className={s.summary}>
            <span className={s.summaryTitle}>{label}</span>
            <ParentFields who={who} f={f} up={up} withEmail />
            <button type="button" className={s.linkBtn} style={{ alignSelf: "flex-start" }} onClick={() => p.setEditing(null)}>
              Done
            </button>
          </div>
        );
      }
      const name = `${f[`${who}_first`]} ${f[`${who}_last`]}`.trim();
      if (!name) {
        return (
          <button key={who} type="button" className={s.choice} onClick={() => p.setEditing(who)}>
            <span>+ Add {label === "Dad" ? "a dad" : "a mom"} or guardian</span>
          </button>
        );
      }
      return (
        <Summary key={who} title={`${label}: ${name}`} onChange={() => p.setEditing(who)}>
          <Line>{[f[`${who}_phone`], f[`${who}_email`]].filter(Boolean).join(" · ") || "No phone or email on file"}</Line>
        </Summary>
      );
    };
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title="Is this still the best way to reach you?" />
        <div className={s.body}>
          {card("father")}
          {card("mother")}
        </div>
        {actions(<ContinueButton label="Yes, looks right" />)}
      </form>
    );
  }

  // ── Fees, uniforms, eligibility (per player) ──
  if (kind === "fees") {
    const total = kids.reduce((n, k) => n + (tierParts(k.fee_tier)?.dollars ?? 0), 0);
    const ok = kids.every((k) => k.fee_tier);
    const setTier = (k: KidAnswers, tier: string) => upKid(k.key, { fee_tier: tier, ...(isHighSchoolTier(tier) ? {} : { needs_grays: null }) });
    const single = !many ? kids[0] : null;
    const singleParts = single ? tierParts(single.fee_tier) : null;
    return (
      <form onSubmit={continueWith(ok, "Please pick a fee for each player.")}>
        {single && singleParts && p.editing !== single.key ? (
          <Question title={`${kidFirst(single)} plays ${singleParts.label} this season`}>
            Based on {kidFirst(single)}&apos;s age on {AGE_CUTOFF_LABEL}, the registration fee is <strong>${singleParts.dollars}</strong>.
          </Question>
        ) : (
          <Question title={many ? "Here are this season's fees" : `Which fee is right for ${kidFirst(kids[0])}?`}>
            Fees go by age on {AGE_CUTOFF_LABEL}. Playing up? Pick the older group.
          </Question>
        )}
        <div className={s.body}>
          <div>
            {kids.map((k) => {
              const parts = tierParts(k.fee_tier);
              if (!many && parts && p.editing !== k.key) return null;
              return (
                <div key={k.key} className={s.kidRow}>
                  <span className={s.kidName}>
                    {many && `${kidFirst(k)} · `}
                    {parts ? `${parts.label} · $${parts.dollars}` : "Pick a fee"}
                  </span>
                  {p.editing === k.key || !parts ? (
                    <ComboSelect className="olb-select" aria-label={`Fee for ${kidFirst(k)}`} value={k.fee_tier} onChange={(e) => setTier(k, e.target.value)} style={{ maxWidth: 220, height: 44 }}>
                      <option value="">Pick one</option>
                      {FEE_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </ComboSelect>
                  ) : (
                    <button type="button" className={s.linkBtn} onClick={() => p.setEditing(k.key)}>
                      Change
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {many && (
            <div className={s.total}>
              <span>Total</span>
              <span className={s.big}>${total}</span>
            </div>
          )}
        </div>
        {actions(
          <ContinueButton label={single && p.editing !== single.key ? "Sounds right" : "Continue"} />,
          single && singleParts && p.editing !== single.key && (
            <button type="button" className={s.secondary} onClick={() => p.setEditing(single.key)}>
              Pick another
            </button>
          )
        )}
      </form>
    );
  }

  if (kind === "uniform") {
    return (
      <PerKid
        {...p}
        list={kids}
        field="needs_uniform"
        title={many ? "Who needs a new black and white uniform?" : `Does ${names} need a new black and white uniform?`}
        lead={many ? "Tap Yes for anyone who's outgrown theirs or is new." : "The home and away jerseys and shorts."}
        yes="Yes, needs one"
        no="No, still fits"
      />
    );
  }

  if (kind === "grays") {
    const hs = kids.filter((k) => isHighSchoolTier(k.fee_tier));
    return (
      <PerKid
        {...p}
        list={hs}
        field="needs_grays"
        title={hs.length > 1 ? "High school players also wear grays. Who needs them?" : `High school players also wear grays. Does ${kidFirst(hs[0])} need the gray alternate uniform?`}
        lead="The gray alternate uniform is for high school teams only."
        yes="Yes, needs grays"
        no="No, has them"
      />
    );
  }

  if (kind === "homeschool") {
    return (
      <PerKid
        {...p}
        list={kids}
        field="homeschool_affirm"
        title={many ? `Do ${names} meet the NCHC homeschool rules?` : `Does ${names} meet the NCHC homeschool eligibility rules?`}
        lead="Lightning plays in the NCHC, which has rules about homeschooling, grades and playing on other teams."
        yes="Yes"
        no="No"
        extra={
          <>
            <details>
              <summary className={s.linkBtn} style={{ display: "inline" }}>Read the NCHC rules</summary>
              <div className={s.note} style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{NCHC_TEXT}</div>
            </details>
            {kids.some((k) => k.homeschool_affirm === false) && (
              <p className={s.warn}>
                Please email <strong>lightningbasketballomaha@gmail.com</strong> before the season starts so we can talk it
                through. You can still finish registering.
              </p>
            )}
          </>
        }
      />
    );
  }

  // ── Helping out ──
  if (kind === "help-father" || kind === "help-mother") {
    const who: Parent = kind === "help-father" ? "father" : "mother";
    const picked = f[`${who}_volunteer`];
    const toggle = (v: string) =>
      up({ [`${who}_volunteer`]: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] } as Partial<FamilyAnswers>);
    const first = f[`${who}_first`].trim();
    const isYou = (p.mode === "new" && p.you === who) || (p.email && f[`${who}_email`].toLowerCase() === p.email.toLowerCase());
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title={isYou ? "Would you like to help out this season?" : `Would ${first} like to help out this season?`}>
          Tap anything that sounds good and we&apos;ll send more information. Every team needs coaches, a team parent and a
          scorekeeper.
        </Question>
        <div className={s.body}>
          <div className={s.chips}>
            {VOLUNTEER_OPTIONS.map((v) => (
              <button key={v} type="button" className={s.chip} aria-pressed={picked.includes(v)} onClick={() => toggle(v)}>
                {v}
              </button>
            ))}
          </div>
          <label className={s.field}>
            Something else
            <input className="olb-input" value={f[`${who}_volunteer_other`]} onChange={(e) => up({ [`${who}_volunteer_other`]: e.target.value } as Partial<FamilyAnswers>)} placeholder="Optional" />
          </label>
        </div>
        {actions(
          <ContinueButton />,
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              up({ [`${who}_volunteer`]: [], [`${who}_volunteer_other`]: "" } as Partial<FamilyAnswers>);
              next();
            }}
          >
            Not this season
          </button>
        )}
      </form>
    );
  }

  // ── The rest, for the whole family ──
  if (kind === "directory") {
    const set = (v: boolean) => p.answer(() => ({ ...state, family: { ...f, directory_optin: v } }));
    return (
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <Question title="Add your family to the Lightning Directory?">
          Other Lightning families can find your phone and email to plan carpools and team get-togethers.
        </Question>
        <div className={`${s.body} ${s.choices}`}>
          <Choice on={f.directory_optin === true} onClick={() => set(true)} label="Yes, add us" />
          <Choice on={f.directory_optin === false} onClick={() => set(false)} label="No thanks" />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "waiver") {
    const signed = f.signature_mode === "draw" ? !!f.signature_image : !!f.signature_name.trim();
    const ok = f.waiver_agreed && !!f.printed_name.trim() && signed;
    const guess = [f[`${p.you ?? "mother"}_first`], f[`${p.you ?? "mother"}_last`]].map((x) => x.trim()).filter(Boolean).join(" ");
    return (
      <form
        onSubmit={continueWith(
          ok,
          !f.waiver_agreed ? "Please check the box to agree to the waiver." : !f.printed_name.trim() ? "Please print your name." : "Please sign: draw your signature or type your name."
        )}
      >
        <Question title="The accident waiver">A parent or guardian signs once for {many ? "all your players" : names}.</Question>
        <div className={s.body}>
          <label className={s.field}>
            Parent or guardian&apos;s full name
            <input
              className="olb-input"
              value={f.printed_name}
              onChange={(e) => up({ printed_name: e.target.value })}
              onFocus={() => !f.printed_name && guess && up({ printed_name: guess })}
              placeholder={guess || "Full name"}
            />
          </label>
          <div className={s.waiver}>
            <p style={{ margin: "0 0 10px" }}>
              I, <strong style={{ color: "var(--olb-ink)" }}>{f.printed_name.trim() || "__________________"}</strong>, {WAIVER_INTRO}
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {WAIVER_ITEMS.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={f.waiver_agreed} onChange={(e) => up({ waiver_agreed: e.target.checked })} />
            I have read and agree to the Accident Waiver.
          </label>
          <div>
            <span className={s.sectionLabel}>Signature</span>
            <SignaturePad
              mode={f.signature_mode}
              typedName={f.signature_name}
              image={f.signature_image}
              onMode={(m) => up({ signature_mode: m })}
              onTyped={(v) => up({ signature_name: v })}
              onDraw={(d) => up({ signature_image: d })}
            />
          </div>
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "donation") {
    const set = (v: boolean) => p.answer(() => ({ ...state, family: { ...f, donation_interest: v } }));
    return (
      <form onSubmit={continueWith(f.donation_interest !== null, "Please pick one.")}>
        <Question title="Would you consider a donation to Lightning?">
          No commitment. We&apos;ll send you information about supporting the program.
        </Question>
        <div className={`${s.body} ${s.choices}`}>
          <Choice on={f.donation_interest === true} onClick={() => set(true)} label="Yes, tell me more" />
          <Choice on={f.donation_interest === false} onClick={() => set(false)} label="Not right now" />
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "payment") {
    const total = kids.reduce((n, k) => n + (tierParts(k.fee_tier)?.dollars ?? 0), 0);
    const set = (v: string) => p.answer(() => ({ ...state, family: { ...f, payment_option: v } }));
    return (
      <form onSubmit={continueWith(!!f.payment_option, "Please pick how you'll pay.")}>
        <Question title={`How will you pay the $${total}?`}>
          You don&apos;t pay today. The Treasurer will confirm what you owe once {many ? "your players are" : `${names} is`} on a team.
        </Question>
        <div className={`${s.body} ${s.choices}`}>
          {PAYMENT_OPTIONS.map((o) => (
            <Choice
              key={o}
              on={f.payment_option === o}
              onClick={() => set(o)}
              label={o}
              sub={o === "Venmo" ? "To @OmahaLightning-Basketball, with your player's name in the note" : "Made out to Omaha Lightning Basketball"}
            />
          ))}
        </div>
        {actions(<ContinueButton />)}
      </form>
    );
  }

  if (kind === "summary") {
    const total = kids.reduce((n, k) => n + (tierParts(k.fee_tier)?.dollars ?? 0), 0);
    const yn = (v: boolean | null, yes: string, no: string) => (v === true ? yes : v === false ? no : "Not answered");
    const helping = (who: Parent) => [...f[`${who}_volunteer`], f[`${who}_volunteer_other`].trim()].filter(Boolean).join(", ");
    const parentLine = (who: Parent) => {
      const name = `${f[`${who}_first`]} ${f[`${who}_last`]}`.trim();
      if (!name) return null;
      const help = helping(who);
      return (
        <Line key={who}>
          <strong>{name}</strong> · {[f[`${who}_phone`], f[`${who}_email`]].filter(Boolean).join(" · ") || "no phone or email"}
          {help && <><br />Can help: {help}</>}
        </Line>
      );
    };
    const where = (a: string, b: string) => (p.mode === "new" ? a : b);
    return (
      <form onSubmit={p.submit}>
        <Question title="Ready to send?">Take a last look. Tap Change to fix anything.</Question>
        <div className={s.body}>
          {kids.map((k) => {
            const parts = tierParts(k.fee_tier);
            return (
              <Summary key={k.key} title={`${k.athlete_first} ${k.athlete_last}`.trim() || "Player"} onChange={() => p.change(p.fromFile.has(k.key) ? "review-kids" : `name:${k.key}`)}>
                <Line>
                  {[k.athlete_dob && `Born ${formatDay(k.athlete_dob)}`, parts && `${parts.label} · $${parts.dollars}`, k.first_season === true && "First season"]
                    .filter(Boolean)
                    .join(" · ")}
                </Line>
                <Line>
                  {[
                    yn(k.needs_uniform, "Needs a uniform", "Has a uniform"),
                    isHighSchoolTier(k.fee_tier) && yn(k.needs_grays, "needs grays", "has grays"),
                    yn(k.homeschool_affirm, "meets NCHC rules", "doesn't meet NCHC rules"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Line>
              </Summary>
            );
          })}
          <Summary title="Home" onChange={() => p.change(where("home", "review-home"))}>
            <Line>{addressLines(f)}</Line>
          </Summary>
          <Summary title="Parents" onChange={() => p.change(where("you-details", "review-parents"))}>
            {parentLine("father")}
            {parentLine("mother")}
          </Summary>
          <Summary title="Directory" onChange={() => p.change("directory")}>
            <Line>{f.directory_optin ? "Yes, add your family" : "Not listed"}</Line>
          </Summary>
          <Summary title="Waiver" onChange={() => p.change("waiver")}>
            <Line>{f.waiver_agreed && f.printed_name.trim() ? `Agreed and signed by ${f.printed_name.trim()}` : "Not signed yet"}</Line>
          </Summary>
          <Summary title="Paying" onChange={() => p.change("payment")}>
            <Line>
              {f.payment_option || "Not picked"} · ${total}
              {f.donation_interest === true && " · open to donating"}
            </Line>
          </Summary>
        </div>
        {actions(
          <button type="submit" className={s.primary} disabled={p.busy}>
            {p.busy ? "Sending…" : `Register ${names}`}
          </button>
        )}
      </form>
    );
  }

  return (
    <div>
      <Question title="Let's keep going" />
      {actions(<button type="button" className={s.primary} onClick={() => p.go("summary")}>Continue</button>)}
    </div>
  );
}

// A yes/no asked about each player: big answers for one player (moving
// straight on), a row each for several.
function PerKid({
  list,
  field,
  title,
  lead,
  yes,
  no,
  extra,
  state,
  upKid,
  answer,
  next,
  setError,
  error,
  back,
  backLabel,
}: StepProps & {
  list: KidAnswers[];
  field: "needs_uniform" | "needs_grays" | "homeschool_affirm";
  title: string;
  lead: string;
  yes: string;
  no: string;
  extra?: React.ReactNode;
}) {
  const ok = list.every((k) => k[field] !== null);
  const single = list.length === 1 ? list[0] : null;
  const set = (k: KidAnswers, v: boolean) =>
    single && field !== "homeschool_affirm"
      ? answer(() => ({ ...state, kids: state.kids.map((x) => (x.key === k.key ? { ...x, [field]: v } : x)) }))
      : upKid(k.key, { [field]: v });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return setError(single ? "Please pick one." : "Please answer for each player.");
        next();
      }}
    >
      <Question title={title}>{lead}</Question>
      <div className={s.body}>
        {single ? (
          <div className={s.choices}>
            <Choice on={single[field] === true} onClick={() => set(single, true)} label={yes} />
            <Choice on={single[field] === false} onClick={() => set(single, false)} label={no} />
          </div>
        ) : (
          <div>
            {list.map((k) => (
              <div key={k.key} className={s.kidRow}>
                <span className={s.kidName}>{kidFirst(k)}</span>
                <div className={s.seg} role="group" aria-label={`${title} ${kidFirst(k)}`}>
                  <button type="button" aria-pressed={k[field] === true} onClick={() => set(k, true)}>
                    Yes
                  </button>
                  <button type="button" aria-pressed={k[field] === false} onClick={() => set(k, false)}>
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {extra}
      </div>
      <ErrorNote text={error} />
      <div className={s.actions}>
        <button type="button" className={s.back} onClick={back}>
          ← {backLabel}
        </button>
        <button type="submit" className={s.primary}>
          Continue
        </button>
      </div>
    </form>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function ContinueButton({ label = "Continue" }: { label?: string }) {
  return (
    <button type="submit" className={s.primary}>
      {label}
    </button>
  );
}

function Question({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <h2 className={s.question} tabIndex={-1}>
        {title}
      </h2>
      {children && <p className={s.lead}>{children}</p>}
    </>
  );
}

function Choice({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" className={s.choice} aria-pressed={on} onClick={onClick}>
      <span>
        {label}
        {sub && <span className={s.choiceSub}>{sub}</span>}
      </span>
      <Tick />
    </button>
  );
}

function Tick() {
  return (
    <span className={s.tick} aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function Summary({ title, onChange, children }: { title: string; onChange: () => void; children: React.ReactNode }) {
  return (
    <div className={s.summary}>
      <div className={s.summaryHead}>
        <span className={s.summaryTitle}>{title}</span>
        <button type="button" className={s.linkBtn} onClick={onChange}>
          Change
        </button>
      </div>
      {children}
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <span className={s.summaryLine}>{children}</span>;
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className={`olb-alert olb-alert--error ${s.error}`} role="alert">
      {text}
    </div>
  );
}

function AddressFields({ f, up }: { f: FamilyAnswers; up: (patch: Partial<FamilyAnswers>) => void }) {
  return (
    <>
      <label className={s.field}>
        Street address
        <input className="olb-input" autoComplete="address-line1" value={f.address_line1} onChange={(e) => up({ address_line1: e.target.value })} />
      </label>
      <label className={s.field}>
        Apartment, suite (optional)
        <input className="olb-input" autoComplete="address-line2" value={f.address_line2} onChange={(e) => up({ address_line2: e.target.value })} />
      </label>
      <div className={s.row3}>
        <label className={s.field}>
          City
          <input className="olb-input" autoComplete="address-level2" value={f.city} onChange={(e) => up({ city: e.target.value })} />
        </label>
        <label className={s.field}>
          State
          <ComboSelect className="olb-select" autoComplete="address-level1" value={f.state} onChange={(e) => up({ state: e.target.value })}>
            <option value="">State</option>
            {US_STATES.map(([abbr, name]) => (
              <option key={abbr} value={abbr}>
                {name}
              </option>
            ))}
          </ComboSelect>
        </label>
        <label className={s.field}>
          Zip
          <input className="olb-input" inputMode="numeric" autoComplete="postal-code" value={f.zip} onChange={(e) => up({ zip: e.target.value })} />
        </label>
      </div>
    </>
  );
}

function ParentFields({ who, f, up, withEmail = true }: { who: Parent; f: FamilyAnswers; up: (patch: Partial<FamilyAnswers>) => void; withEmail?: boolean }) {
  const set = (k: "first" | "last" | "email" | "phone", v: string) => up({ [`${who}_${k}`]: v } as Partial<FamilyAnswers>);
  return (
    <>
      <div className={s.row2}>
        <label className={s.field}>
          First name
          <input className="olb-input" value={f[`${who}_first`]} onChange={(e) => set("first", e.target.value)} />
        </label>
        <label className={s.field}>
          Last name
          <input className="olb-input" value={f[`${who}_last`]} onChange={(e) => set("last", e.target.value)} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={s.field}>
          Phone
          <input className="olb-input" type="tel" autoComplete="off" value={f[`${who}_phone`]} onChange={(e) => set("phone", e.target.value)} />
        </label>
        {withEmail && (
          <label className={s.field}>
            Email
            <input className="olb-input" type="email" autoComplete="off" value={f[`${who}_email`]} onChange={(e) => set("email", e.target.value)} />
          </label>
        )}
      </div>
    </>
  );
}

function addressLines(f: FamilyAnswers): string {
  const cityLine = [f.city, [f.state, f.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [f.address_line1, f.address_line2, cityLine].filter((x) => x.trim()).join(", ") || "No address yet";
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
