"use client";
import { useState } from "react";
import Link from "next/link";
import SignaturePad from "./SignaturePad";
import { NCHC_TEXT, US_STATES, WAIVER_INTRO, WAIVER_ITEMS } from "./content";
import { VOLUNTEER_OPTIONS } from "../../../lib/teams/volunteer-options";
import {
  AGE_CUTOFF_LABEL,
  FEE_TIERS,
  MAX_PLAYERS,
  PAYMENT_OPTIONS,
  isHighSchoolTier,
  kidFirst,
  newKid,
  suggestedTier,
  type FamilyAnswers,
  type KidAnswers,
  type RegistrationState,
} from "../../../lib/teams/registration-form";
import { ComboSelect } from "../../components/ComboSelect";

const radioLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" };
const cbLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" };
const qLabel: React.CSSProperties = { fontWeight: 700, fontSize: 14, display: "block" };

function YesNo({ value, onChange, name }: { value: boolean | null; onChange: (v: boolean) => void; name: string }) {
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
      <label style={radioLbl}><input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} /> Yes</label>
      <label style={radioLbl}><input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} /> No</label>
    </div>
  );
}

// Everything on one page, for families who'd rather see it all at once. It
// shares its answers with the step-by-step wizard, so switching either way
// keeps what's been filled in.
export default function RegistrationForm({
  state,
  onChange,
  onSubmit,
  onWizard,
  honeypot,
  onHoneypot,
  today,
}: {
  state: RegistrationState;
  onChange: (next: RegistrationState) => void;
  onSubmit: () => Promise<string | null>;
  onWizard: () => void;
  honeypot: string;
  onHoneypot: (v: string) => void;
  today: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = state.family;
  const many = state.kids.length > 1;

  const up = (patch: Partial<FamilyAnswers>) => onChange({ ...state, family: { ...f, ...patch } });
  const upKid = (key: string, patch: Partial<KidAnswers>) =>
    onChange({ ...state, kids: state.kids.map((k) => (k.key === key ? { ...k, ...patch } : k)) });
  const toggleVol = (key: "father_volunteer" | "mother_volunteer", v: string) =>
    up({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });
  const addKid = () =>
    onChange({ ...state, kids: [...state.kids, newKid({ athlete_last: state.kids[0]?.athlete_last ?? "" })] });
  const removeKid = (key: string) => onChange({ ...state, kids: state.kids.filter((k) => k.key !== key) });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onSubmit();
    setBusy(false);
    if (res) setError(res);
  }

  return (
    <div className="olb-page" style={{ maxWidth: 720 }}>
      <button type="button" onClick={onWizard} className="olb-sub" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
        ← Back to step by step
      </button>
      <h1 className="olb-h1" style={{ marginTop: 12, marginBottom: 8 }}>2026-27 Omaha Lightning Basketball Registration</h1>
      <p className="olb-sub" style={{ marginTop: 0 }}>
        This registration is for current Lightning players and their brothers and sisters. New to Lightning? Join the
        waitlist on our <Link href="/programs">Programs</Link> page. Questions? Email{" "}
        <strong>lightningbasketballomaha@gmail.com</strong>.
      </p>

      <form onSubmit={submit} className="olb-card olb-card--pad" style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 14 }}>
        {state.kids.map((k, i) => (
          <KidFields
            key={k.key}
            kid={k}
            index={i}
            many={many}
            onChange={(patch) => upKid(k.key, patch)}
            onRemove={many ? () => removeKid(k.key) : undefined}
          />
        ))}
        {state.kids.length < MAX_PLAYERS && (
          <button type="button" className="olb-btn olb-btn--ghost" onClick={addKid} style={{ alignSelf: "flex-start" }}>
            + Add a brother or sister
          </button>
        )}
        <details style={{ marginTop: -8 }}>
          <summary className="olb-sub" style={{ cursor: "pointer", fontWeight: 600 }}>See the NCHC eligibility guidelines</summary>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "var(--olb-muted)", marginTop: 8, lineHeight: 1.5 }}>{NCHC_TEXT}</div>
        </details>

        {/* Address */}
        <div style={{ borderTop: "1px solid var(--olb-stroke)", paddingTop: 18 }}>
          <span style={qLabel}>Address *</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <input className="olb-input" placeholder="Address Line 1" required value={f.address_line1} onChange={(e) => up({ address_line1: e.target.value })} />
            <input className="olb-input" placeholder="Address Line 2" value={f.address_line2} onChange={(e) => up({ address_line2: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input className="olb-input" placeholder="City" required value={f.city} onChange={(e) => up({ city: e.target.value })} />
              <ComboSelect className="olb-select" required value={f.state} onChange={(e) => up({ state: e.target.value })} aria-label="State">
                <option value="">State</option>
                {US_STATES.map(([abbr, name]) => <option key={abbr} value={abbr}>{name}</option>)}
              </ComboSelect>
              <input className="olb-input" placeholder="Zip Code" required value={f.zip} onChange={(e) => up({ zip: e.target.value })} />
            </div>
          </div>
        </div>

        <div>
          <span style={qLabel}>Would you like to be added to the Omaha Lightning Directory?</span>
          <YesNo name="directory" value={f.directory_optin} onChange={(v) => up({ directory_optin: v })} />
          <span className="olb-sub" style={{ fontSize: 12 }}>Find friends and organize carpools more easily!</span>
        </div>

        <ParentBlock title="Father" prefix="father" f={f} onField={up} onToggle={(v) => toggleVol("father_volunteer", v)} />
        <ParentBlock title="Mother" prefix="mother" f={f} onField={up} onToggle={(v) => toggleVol("mother_volunteer", v)} />

        {/* Accident Waiver */}
        <div>
          <span style={qLabel}>Accident Waiver *</span>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--olb-stroke)", borderRadius: 9, padding: "14px 16px", marginTop: 6, background: "var(--olb-surface-2)" }}>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--olb-muted)", lineHeight: 1.6 }}>I, <strong style={{ color: "var(--olb-ink)" }}>{f.printed_name.trim() || "__________________"}</strong>, {WAIVER_INTRO}</p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {WAIVER_ITEMS.map((t, i) => (
                <li key={i} style={{ fontSize: 12.5, color: "var(--olb-muted)", lineHeight: 1.6 }}>{t}</li>
              ))}
            </ol>
          </div>
          <label style={{ ...cbLbl, marginTop: 10, fontSize: 14 }}>
            <input type="checkbox" checked={f.waiver_agreed} onChange={(e) => up({ waiver_agreed: e.target.checked })} />
            I have read and agree to the Accident Waiver above.
          </label>
          <div style={{ marginTop: 12 }}>
            <span style={qLabel}>Parent or Guardian signature (if athlete under 18) *</span>
            <label className="olb-field" style={{ marginTop: 6, maxWidth: 340, display: "block" }}>
              <span className="olb-label">Printed name</span>
              <input className="olb-input" value={f.printed_name} onChange={(e) => up({ printed_name: e.target.value })} placeholder="Parent / guardian full name" />
            </label>
            <SignaturePad
              mode={f.signature_mode}
              typedName={f.signature_name}
              image={f.signature_image}
              onMode={(m) => up({ signature_mode: m })}
              onTyped={(v) => up({ signature_name: v })}
              onDraw={(d) => up({ signature_image: d })}
            />
            <span className="olb-sub" style={{ fontSize: 12, marginTop: 8, display: "block" }}>Date: {today}</span>
          </div>
        </div>

        <div>
          <span style={qLabel}>Would you consider supporting Omaha Lightning Basketball with a donation?</span>
          <YesNo name="donation" value={f.donation_interest} onChange={(v) => up({ donation_interest: v })} />
        </div>

        <div>
          <span style={qLabel}>Payment Options *</span>
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            {PAYMENT_OPTIONS.map((p) => (
              <label key={p} style={radioLbl}>
                <input type="radio" name="payment" checked={f.payment_option === p} onChange={() => up({ payment_option: p })} /> {p}
              </label>
            ))}
          </div>
        </div>

        {/* honeypot */}
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => onHoneypot(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

        {error && <div className="olb-alert olb-alert--error" role="alert">{error}</div>}

        <button type="submit" disabled={busy} className="olb-btn olb-btn--gold" style={{ alignSelf: "flex-start", minWidth: 140 }}>
          {busy ? "Submitting…" : many ? `Register all ${state.kids.length}` : "Submit"}
        </button>
      </form>
    </div>
  );
}

// One player's questions: who they are, eligibility, uniforms and their fee.
function KidFields({
  kid: k,
  index,
  many,
  onChange,
  onRemove,
}: {
  kid: KidAnswers;
  index: number;
  many: boolean;
  onChange: (patch: Partial<KidAnswers>) => void;
  onRemove?: () => void;
}) {
  const suggestion = suggestedTier(k.athlete_dob);
  const n = (field: string) => `${field}-${k.key}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, ...(index > 0 ? { borderTop: "1px solid var(--olb-stroke)", paddingTop: 18 } : {}) }}>
      {many && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="olb-eyebrow">Player {index + 1}{k.athlete_first.trim() ? ` · ${kidFirst(k)}` : ""}</span>
          {onRemove && (
            <button type="button" className="olb-btn olb-btn--ghost olb-btn--sm" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
      <div>
        <span style={qLabel}>Athlete Name *</span>
        <div className="olb-grid-2" style={{ marginTop: 6 }}>
          <input className="olb-input" placeholder="First" required value={k.athlete_first} onChange={(e) => onChange({ athlete_first: e.target.value })} />
          <input className="olb-input" placeholder="Last" required value={k.athlete_last} onChange={(e) => onChange({ athlete_last: e.target.value })} />
        </div>
      </div>

      <div className="olb-grid-2">
        <div>
          <span style={qLabel}>Athlete Birthdate *</span>
          <input
            type="date"
            className="olb-input"
            required
            value={k.athlete_dob}
            onChange={(e) => {
              const dob = e.target.value;
              const tier = suggestedTier(dob);
              // Pick the fee for their age, unless one was already chosen by hand.
              onChange({ athlete_dob: dob, ...(tier && (!k.fee_tier || k.fee_tier === suggestion) ? { fee_tier: tier } : {}) });
            }}
            style={{ marginTop: 6 }}
          />
        </div>
        <div>
          <span style={qLabel}>Is this their first season with Omaha Lightning Basketball?</span>
          <YesNo name={n("first")} value={k.first_season} onChange={(v) => onChange({ first_season: v })} />
        </div>
      </div>

      <div className="olb-grid-2">
        <div><span style={qLabel}>Athlete Phone</span><input className="olb-input" type="tel" value={k.athlete_phone} onChange={(e) => onChange({ athlete_phone: e.target.value })} style={{ marginTop: 6 }} /></div>
        <div><span style={qLabel}>Athlete Email</span><input className="olb-input" type="email" value={k.athlete_email} onChange={(e) => onChange({ athlete_email: e.target.value })} style={{ marginTop: 6 }} /></div>
      </div>

      <div>
        <span style={qLabel}>Do you affirm that your athlete meets the homeschool eligibility requirements outlined by the NCHC? *</span>
        <YesNo name={n("homeschool")} value={k.homeschool_affirm} onChange={(v) => onChange({ homeschool_affirm: v })} />
      </div>

      <div className="olb-grid-2">
        <div>
          <span style={qLabel}>Does athlete need a new black/white uniform? *</span>
          <YesNo name={n("uniform")} value={k.needs_uniform} onChange={(v) => onChange({ needs_uniform: v })} />
        </div>
        {(!k.fee_tier || isHighSchoolTier(k.fee_tier)) && (
          <div>
            <span style={qLabel}>Does HS athlete need an alternate uniform (GRAYS)?</span>
            <YesNo name={n("grays")} value={k.needs_grays} onChange={(v) => onChange({ needs_grays: v })} />
            <span className="olb-sub" style={{ fontSize: 12 }}>HIGH SCHOOL ONLY!</span>
          </div>
        )}
      </div>

      <div>
        <span style={qLabel}>Registration Fee *</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {FEE_TIERS.map((t) => (
            <label key={t} style={radioLbl}>
              <input type="radio" name={n("fee")} checked={k.fee_tier === t} onChange={() => onChange({ fee_tier: t, ...(isHighSchoolTier(t) ? {} : { needs_grays: null }) })} /> {t}
            </label>
          ))}
        </div>
        <span className="olb-sub" style={{ fontSize: 12 }}>
          Age as of {AGE_CUTOFF_LABEL}. Reach out to lightningbasketballomaha@gmail.com with questions on placement.
        </span>
      </div>
    </div>
  );
}

function ParentBlock({
  title,
  prefix,
  f,
  onField,
  onToggle,
}: {
  title: string;
  prefix: "father" | "mother";
  f: FamilyAnswers;
  onField: (patch: Partial<FamilyAnswers>) => void;
  onToggle: (v: string) => void;
}) {
  const key = <K extends string>(k: K) => `${prefix}_${k}` as const;
  const val = (k: "first" | "last" | "email" | "phone" | "volunteer_other") => f[key(k)] as string;
  const set = (k: "first" | "last" | "email" | "phone" | "volunteer_other", v: string) => onField({ [key(k)]: v } as Partial<FamilyAnswers>);
  const volunteer = f[key("volunteer")] as string[];
  return (
    <div style={{ borderTop: "1px solid var(--olb-stroke)", paddingTop: 18 }}>
      <div className="olb-grid-2">
        <div>
          <span style={qLabel}>{title}&apos;s Name</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <input className="olb-input" placeholder="First" value={val("first")} onChange={(e) => set("first", e.target.value)} />
            <input className="olb-input" placeholder="Last" value={val("last")} onChange={(e) => set("last", e.target.value)} />
          </div>
          <span className="olb-sub" style={{ fontSize: 12 }}>Leave blank if this doesn&apos;t apply.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><span style={qLabel}>{title}&apos;s Email</span><input className="olb-input" type="email" value={val("email")} onChange={(e) => set("email", e.target.value)} style={{ marginTop: 6 }} /></div>
          <div><span style={qLabel}>{title}&apos;s Phone</span><input className="olb-input" type="tel" value={val("phone")} onChange={(e) => set("phone", e.target.value)} style={{ marginTop: 6 }} /></div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="olb-sub" style={{ fontSize: 13 }}>
          Are you interested in serving Omaha Lightning in any of the following ways? Check all that apply, and we&apos;ll send you more information.
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 16px", marginTop: 8 }}>
          {VOLUNTEER_OPTIONS.map((v) => (
            <label key={v} style={cbLbl}>
              <input type="checkbox" checked={volunteer.includes(v)} onChange={() => onToggle(v)} /> {v}
            </label>
          ))}
        </div>
        <input className="olb-input" placeholder="Other" value={val("volunteer_other")} onChange={(e) => set("volunteer_other", e.target.value)} style={{ marginTop: 8, maxWidth: 320 }} />
      </div>
    </div>
  );
}
