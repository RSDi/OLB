"use client";
import { useState } from "react";
import { createRegistration } from "../../../lib/teams/registration-actions";
import SignaturePad from "./SignaturePad";
import { VOLUNTEER_OPTIONS } from "../../../lib/teams/volunteer-options";

const VOLUNTEER = VOLUNTEER_OPTIONS;
const FEE_TIERS = ["8u-12u - $375.00", "14u - $400.00", "16u-18u - $525.00"];

const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const NCHC_TEXT = `"Homeschooling" is defined by the NCHC as being parent-directed education and primarily done at home. IF YOUR CHILD IS IN A 3 DAY PER WEEK CO-OP PLEASE CONTACT US BEFORE CONTINUING REGISTRATION.

Grades: Each member team and/or program shall have standards to ensure that all participating players maintain at least a 2.0 GPA (on a 4-point scale) during the active season.

HomeSchooled Continuously: Must be HomeSchooled continuously from the start of the school year. If a student started the year in school, they must request a Hardship Exemption.

Gender: A player is only eligible to play in the gender division that the player was born, as recorded on their original birth certificate. No exceptions.

Graduation Ceremony Participation: A player already participating in a graduation ceremony is not eligible to participate in NCHC events.

Exclusive Team Participation: A player may not play for any additional basketball public school, private school, or homeschool teams during the Omaha Lightning season. AAU is allowed, but commitment must be discussed with Lightning Coaches.`;

const WAIVER_INTRO =
  "desire that my registered child participate in the Omaha Lightning Basketball program and all the events that includes. My child will participate in the above selected club sport programs, including travel to and from practices and competitions included in the Omaha Lightning Basketball (referred to as OLBB here after) program. References to the OLBB program shall include any of its officers, coaches and agents. In consideration of being allowed to participate in OLBB, I hereby acknowledge and agree as follows:";

const WAIVER_ITEMS = [
  "I am fully informed or otherwise aware of, and fully assume, all risks to person or property in connection with my child's participation in the OLBB program (including, but not limited to, damage and loss of property, bodily injuries, medical treatment and death). My child is in good physical and mental health and does not have any physical or mental conditions, which could affect my child's ability to participate in the OLBB program. The OLBB program shall not pay any insurance claims for my child in connection with my child's participation in the OLBB program.",
  "I fully and forever RELEASE, WAIVE AND DISCHARGE and COVENANT NOT TO SUE, the OLBB program (including, but not limited to, its trustees, employees and representatives), from any and all demands, claims, actions, suits, damages, losses, liabilities, costs and expenses arising, directly or indirectly, in connection with my child's participation in the OLBB program from any cause whatsoever (including, but not limited to, damage or loss of property, bodily injuries, medical treatment and death), whether or not foreseeable or contributed to by the negligent acts or omissions of the OLBB program or others.",
  "I shall INDEMNIFY AND HOLD HARMLESS the OLBB program (including, but not limited to, its trustees, employees and representatives) for and from any and all demands, claims, actions, suits, damages, losses, liabilities, cost and expenses arising, directly or indirectly, as a result of my child's intentional or negligent acts or omissions from any cause whatsoever (including, but not limited to, damage and loss of property, bodily injury, medical treatment and death), whether or not foreseeable or contributed to by the negligent act of omissions of OLBB program or others.",
  "I shall fully comply with all applicable laws, school policies and OLBB program rules and regulations while participating in OLBB program. If my child's participation in the OLBB program is at any time deemed detrimental to the OLBB program or any other participants, as determined by the OLBB board and/or coaches and/or OLBB program in their sole discretion, I understand that I may be expelled from the OLBB program without OLBB incurring any liability.",
  "This Agreement constitutes the entire agreement, and supersedes any prior or contemporaneous agreements, understandings or negotiations, with respect to the subject matter hereof. This Agreement (i) may not be amended or modified, by course of conduct or otherwise, and (ii) may not be assigned or transferred, in whole or in part, except in writing duly executed by me and OLBB program. This Agreement shall be governed by, and construed and enforced in accordance with, the laws of the State of Nebraska, without regard to the conflicts or choice of law principles thereof, and shall be as broad and inclusive as permitted by such laws. In the event any provision of this Agreement shall be held unenforceable by a court of competent jurisdiction, such unenforceability shall not affect any other provision, and this Agreement shall be construed as if such provision, to the extent of such unenforceability, had not been incorporated herein.",
  "I (i) have read and fully understand this Agreement, (ii) intend that this Agreement be legally binding upon and enforceable against my child and my family members, estate, heirs and legal representatives, (iii) intend that this Agreement inure to the benefit of OLBB program, and (iv) confirm that I am at least eighteen years of age, fully competent, and entering into this Agreement voluntarily of my own judgment.",
  "To the fullest extent allowed by law, I release from liability and agree to hold harmless the OLBB program and any of its officers, employees and agents, for any injury sustained or incurred by my child during the course of traveling to or from any OLBB program sport activity in a motorized vehicle that is operated by another student or parent. This Hold Harmless Agreement covers and applies to all OLBB program events and shall remain in effect for the duration of the season as long as the above named child is enrolled in OLBB program. I understand that OLBB program requires all drivers who transport other students to or from club sport activities to carry car insurance in accordance with state law. In accordance with the above agreement, I give my child permission to ride to and from team events and practices with all OLBB program approved drivers. In accordance with the above agreement, I give my child permission to travel and reside under the supervision of OLBB program approved adults while participating in team events. This can include travel to practices and competitions, and other typical travel related activities such as dining, shopping, and leisure activities.",
];

type RegForm = {
  athlete_first: string; athlete_last: string; athlete_dob: string;
  first_season: boolean | null;
  address_line1: string; address_line2: string; city: string; state: string; zip: string;
  athlete_phone: string; athlete_email: string;
  homeschool_affirm: boolean | null; directory_optin: boolean;
  needs_uniform: boolean | null; needs_grays: boolean | null;
  father_first: string; father_last: string; father_email: string; father_phone: string; father_volunteer: string[]; father_volunteer_other: string;
  mother_first: string; mother_last: string; mother_email: string; mother_phone: string; mother_volunteer: string[]; mother_volunteer_other: string;
  waiver_agreed: boolean; printed_name: string; signature_mode: "draw" | "type"; signature_name: string; signature_image: string;
  fee_tier: string; donation_interest: boolean; payment_option: string;
  company: string; // honeypot
};

const DEFAULTS: RegForm = {
  athlete_first: "", athlete_last: "", athlete_dob: "",
  first_season: null,
  address_line1: "", address_line2: "", city: "", state: "", zip: "",
  athlete_phone: "", athlete_email: "",
  homeschool_affirm: null, directory_optin: true,
  needs_uniform: null, needs_grays: null,
  father_first: "", father_last: "", father_email: "", father_phone: "", father_volunteer: [], father_volunteer_other: "",
  mother_first: "", mother_last: "", mother_email: "", mother_phone: "", mother_volunteer: [], mother_volunteer_other: "",
  waiver_agreed: false, printed_name: "", signature_mode: "draw", signature_name: "", signature_image: "",
  fee_tier: "", donation_interest: true, payment_option: "",
  company: "",
};

const radioLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" };
const cbLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" };
const qLabel: React.CSSProperties = { fontWeight: 700, fontSize: 14, display: "block" };

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
      <label style={radioLbl}><input type="radio" checked={value === true} onChange={() => onChange(true)} /> Yes</label>
      <label style={radioLbl}><input type="radio" checked={value === false} onChange={() => onChange(false)} /> No</label>
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RegistrationForm() {
  const [f, setF] = useState<RegForm>(DEFAULTS);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const up = (patch: Partial<RegForm>) => setF((p) => ({ ...p, ...patch }));
  const toggleVol = (key: "father_volunteer" | "mother_volunteer", v: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (f.homeschool_affirm === null) return setError("Please answer the homeschool eligibility question.");
    if (f.needs_uniform === null) return setError("Please indicate if the athlete needs a black/white uniform.");
    if (!f.waiver_agreed) return setError("Please check the box agreeing to the Accident Waiver.");
    if (!f.printed_name.trim()) return setError("Please enter the parent/guardian printed name.");
    const signed = f.signature_mode === "draw" ? !!f.signature_image : !!f.signature_name.trim();
    if (!signed) return setError("Please sign the Accident Waiver — draw your signature or type your full name.");
    if (!f.fee_tier) return setError("Please select a registration fee.");
    if (!f.payment_option) return setError("Please choose a payment option.");
    const { company, ...rest } = f;
    setBusy(true);
    const res = await createRegistration({ ...rest, athlete_dob: rest.athlete_dob || null, signature_date: todayISO() }, company);
    setBusy(false);
    if (res) return setError(res);
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <div className="olb-center">
        <div className="olb-card olb-card--pad" style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚡️</div>
          <h1 className="olb-h1" style={{ marginTop: 8 }}>You&apos;re registered!</h1>
          <p className="olb-sub">
            Thanks for signing up with Omaha Lightning Basketball. A coach will review the registration and follow up about
            team placement and payment. Questions? <strong>lightningbasketballomaha@gmail.com</strong>
          </p>
          <button className="olb-btn olb-btn--ghost" style={{ marginTop: 10 }} onClick={() => { setF(DEFAULTS); setDone(false); }}>
            Register another athlete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="olb-page" style={{ maxWidth: 720 }}>
      <h1 className="olb-h1" style={{ marginBottom: 8 }}>2026-27 Omaha Lightning Basketball Registration</h1>
      <p className="olb-sub" style={{ marginTop: 0 }}>
        Registration is <strong>NOW OPEN</strong> to current Lightning players and their siblings ONLY!
        Please contact <strong>lightningbasketballomaha@gmail.com</strong> with questions.
      </p>

      <form onSubmit={onSubmit} className="olb-card olb-card--pad" style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 14 }}>
        {/* Athlete */}
        <div>
          <span style={qLabel}>Athlete Name *</span>
          <div className="olb-grid-2" style={{ marginTop: 6 }}>
            <input className="olb-input" placeholder="First" required value={f.athlete_first} onChange={(e) => up({ athlete_first: e.target.value })} />
            <input className="olb-input" placeholder="Last" required value={f.athlete_last} onChange={(e) => up({ athlete_last: e.target.value })} />
          </div>
        </div>

        <div className="olb-grid-2">
          <div>
            <span style={qLabel}>Athlete Birthdate *</span>
            <input type="date" className="olb-input" required value={f.athlete_dob} onChange={(e) => up({ athlete_dob: e.target.value })} style={{ marginTop: 6 }} />
          </div>
          <div>
            <span style={qLabel}>Is this your first season with Omaha Lightning Basketball?</span>
            <YesNo value={f.first_season} onChange={(v) => up({ first_season: v })} />
          </div>
        </div>

        {/* Address */}
        <div>
          <span style={qLabel}>Address *</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <input className="olb-input" placeholder="Address Line 1" required value={f.address_line1} onChange={(e) => up({ address_line1: e.target.value })} />
            <input className="olb-input" placeholder="Address Line 2" value={f.address_line2} onChange={(e) => up({ address_line2: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input className="olb-input" placeholder="City" required value={f.city} onChange={(e) => up({ city: e.target.value })} />
              <select className="olb-select" required value={f.state} onChange={(e) => up({ state: e.target.value })} aria-label="State">
                <option value="">State</option>
                {US_STATES.map(([abbr, name]) => <option key={abbr} value={abbr}>{name}</option>)}
              </select>
              <input className="olb-input" placeholder="Zip Code" required value={f.zip} onChange={(e) => up({ zip: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="olb-grid-2">
          <div><span style={qLabel}>Athlete Phone</span><input className="olb-input" type="tel" value={f.athlete_phone} onChange={(e) => up({ athlete_phone: e.target.value })} style={{ marginTop: 6 }} /></div>
          <div><span style={qLabel}>Athlete Email</span><input className="olb-input" type="email" value={f.athlete_email} onChange={(e) => up({ athlete_email: e.target.value })} style={{ marginTop: 6 }} /></div>
        </div>

        {/* Eligibility */}
        <div className="olb-grid-2">
          <div>
            <span style={qLabel}>Do you affirm that your athlete meets the homeschool eligibility requirements outlined by the NCHC? *</span>
            <YesNo value={f.homeschool_affirm} onChange={(v) => up({ homeschool_affirm: v })} />
          </div>
          <div>
            <span style={qLabel}>Would you like to be added to the Omaha Lightning Directory?</span>
            <YesNo value={f.directory_optin} onChange={(v) => up({ directory_optin: v })} />
            <span className="olb-sub" style={{ fontSize: 12 }}>Find friends and organize carpools more easily!</span>
          </div>
        </div>
        <details style={{ marginTop: -8 }}>
          <summary className="olb-sub" style={{ cursor: "pointer", fontWeight: 600 }}>See the NCHC eligibility guidelines</summary>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "var(--olb-muted)", marginTop: 8, lineHeight: 1.5 }}>{NCHC_TEXT}</div>
        </details>

        {/* Uniforms */}
        <div className="olb-grid-2">
          <div>
            <span style={qLabel}>Does athlete need a new black/white uniform? *</span>
            <YesNo value={f.needs_uniform} onChange={(v) => up({ needs_uniform: v })} />
          </div>
          <div>
            <span style={qLabel}>Does HS athlete need an alternate uniform (GRAYS)?</span>
            <YesNo value={f.needs_grays} onChange={(v) => up({ needs_grays: v })} />
            <span className="olb-sub" style={{ fontSize: 12 }}>HIGH SCHOOL ONLY!</span>
          </div>
        </div>

        {/* Father */}
        <ParentBlock
          title="Father"
          first={f.father_first} last={f.father_last} email={f.father_email} phone={f.father_phone}
          volunteer={f.father_volunteer} other={f.father_volunteer_other}
          onField={(patch) => up(patch as Partial<RegForm>)}
          onToggle={(v) => toggleVol("father_volunteer", v)}
          keys={{ first: "father_first", last: "father_last", email: "father_email", phone: "father_phone", other: "father_volunteer_other" }}
        />

        {/* Mother */}
        <ParentBlock
          title="Mother"
          first={f.mother_first} last={f.mother_last} email={f.mother_email} phone={f.mother_phone}
          volunteer={f.mother_volunteer} other={f.mother_volunteer_other}
          onField={(patch) => up(patch as Partial<RegForm>)}
          onToggle={(v) => toggleVol("mother_volunteer", v)}
          keys={{ first: "mother_first", last: "mother_last", email: "mother_email", phone: "mother_phone", other: "mother_volunteer_other" }}
        />

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
              onMode={(m) => up({ signature_mode: m })}
              onTyped={(v) => up({ signature_name: v })}
              onDraw={(d) => up({ signature_image: d })}
            />
            <span className="olb-sub" style={{ fontSize: 12, marginTop: 8, display: "block" }}>Date: {todayISO()}</span>
          </div>
        </div>

        {/* Fee */}
        <div>
          <span style={qLabel}>Registration Fee *</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {FEE_TIERS.map((t) => (
              <label key={t} style={radioLbl}>
                <input type="radio" name="fee" checked={f.fee_tier === t} onChange={() => up({ fee_tier: t })} /> {t}
              </label>
            ))}
          </div>
          <span className="olb-sub" style={{ fontSize: 12 }}>Age as of August 1, 2026. Reach out to lightningbasketballomaha@gmail.com with questions on placement.</span>
        </div>

        <div>
          <span style={qLabel}>Would you consider supporting Omaha Lightning Basketball with a donation?</span>
          <YesNo value={f.donation_interest} onChange={(v) => up({ donation_interest: v })} />
        </div>

        <div>
          <span style={qLabel}>Payment Options *</span>
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            {["Check", "Venmo"].map((p) => (
              <label key={p} style={radioLbl}>
                <input type="radio" name="payment" checked={f.payment_option === p} onChange={() => up({ payment_option: p })} /> {p}
              </label>
            ))}
          </div>
        </div>

        {/* honeypot */}
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.company} onChange={(e) => up({ company: e.target.value })} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

        {error && <div className="olb-alert olb-alert--error">{error}</div>}

        <button type="submit" disabled={busy} className="olb-btn olb-btn--gold" style={{ alignSelf: "flex-start", minWidth: 140 }}>
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}

function ParentBlock({
  title, first, last, email, phone, volunteer, other, onField, onToggle, keys,
}: {
  title: string;
  first: string; last: string; email: string; phone: string; volunteer: string[]; other: string;
  onField: (patch: Record<string, string>) => void;
  onToggle: (v: string) => void;
  keys: { first: string; last: string; email: string; phone: string; other: string };
}) {
  return (
    <div style={{ borderTop: "1px solid var(--olb-stroke)", paddingTop: 18 }}>
      <div className="olb-grid-2">
        <div>
          <span style={qLabel}>{title}&apos;s Name *</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <input className="olb-input" placeholder="First" value={first} onChange={(e) => onField({ [keys.first]: e.target.value })} />
            <input className="olb-input" placeholder="Last" value={last} onChange={(e) => onField({ [keys.last]: e.target.value })} />
          </div>
          <span className="olb-sub" style={{ fontSize: 12 }}>Fill with N/A if these fields do not apply.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><span style={qLabel}>{title}&apos;s Email *</span><input className="olb-input" type="email" value={email} onChange={(e) => onField({ [keys.email]: e.target.value })} style={{ marginTop: 6 }} /></div>
          <div><span style={qLabel}>{title}&apos;s Phone *</span><input className="olb-input" type="tel" value={phone} onChange={(e) => onField({ [keys.phone]: e.target.value })} style={{ marginTop: 6 }} /></div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="olb-sub" style={{ fontSize: 13 }}>
          Are you interested in serving Omaha Lightning in any of the following ways? Check all that apply, and we&apos;ll send you more information.
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 8 }}>
          {VOLUNTEER.map((v) => (
            <label key={v} style={cbLbl}>
              <input type="checkbox" checked={volunteer.includes(v)} onChange={() => onToggle(v)} /> {v}
            </label>
          ))}
        </div>
        <input className="olb-input" placeholder="Other" value={other} onChange={(e) => onField({ [keys.other]: e.target.value })} style={{ marginTop: 8, maxWidth: 320 }} />
      </div>
    </div>
  );
}
