"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import s from "../player-registration/wizard.module.css";
import { ContinueButton, Question, Choice, ErrorNote } from "../player-registration/wizard-parts";
import {
  GRADES,
  assessmentPublicPath,
  assessmentRuleLabel,
  assessmentWhen,
  gradeLabel,
  hasGradeRule,
  openAssessmentsFor,
  parseGrade,
  type PublicAssessment,
} from "../../../lib/onboarding/assessments";

type Step = "who" | "pick";

export function AssessmentPicker({ assessments }: { assessments: PublicAssessment[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("who");
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const needsGrade = assessments.some(hasGradeRule);
  const matches = openAssessmentsFor(assessments, dob, parseGrade(grade));

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (wrapRef.current && wrapRef.current.getBoundingClientRect().top < 0) {
      wrapRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const input = card.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=radio]), select");
    (input ?? card.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
  }, [step]);

  function continueWho(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return setError("Please add his birthday.");
    if (needsGrade && parseGrade(grade) == null) return setError("Please add his grade.");
    setError(null);
    setStep("pick");
  }

  function pick(a: PublicAssessment) {
    const next = new URL(assessmentPublicPath(a), window.location.origin);
    next.searchParams.set("dob", dob);
    if (grade) next.searchParams.set("grade", grade);
    router.push(`${next.pathname}${next.search}`);
  }

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.top}>
        <span className={s.eyebrow}>Assessments</span>
      </div>
      <div className={s.progress} aria-hidden="true">
        <div className={s.progressFill} style={{ width: step === "who" ? "30%" : "70%" }} />
      </div>
      <div className={s.card} ref={cardRef} key={step}>
        {step === "who" && (
          <form onSubmit={continueWho}>
            <Question title="Which boy is this for?">Birthday{needsGrade ? " and grade, so we can show the assessments he can sign up for" : ", so we can show the assessments he can sign up for"}.</Question>
            <div className={s.body}>
              <label className={s.field}>
                Birthday
                <input className="olb-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </label>
              {needsGrade && (
                <div>
                  <span className={s.sectionLabel}>Grade</span>
                  <div className={`${s.choices}`} style={{ marginTop: 8 }}>
                    {GRADES.map((g) => (
                      <Choice key={g} on={grade === String(g)} onClick={() => setGrade(String(g))} label={gradeLabel(g)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <ErrorNote text={error} />
            <div className={s.actions}>
              <ContinueButton />
            </div>
          </form>
        )}

        {step === "pick" && (
          <div>
            <Question title="Which assessment?">
              {matches.length
                ? "Open assessments that fit his birthday or grade."
                : "None of the open assessments fit that birthday or grade. Check the date, or email lightningbasketballomaha@gmail.com."}
            </Question>
            <div className={`${s.body} ${s.choices}`}>
              {matches.map((a) => {
                const when = assessmentWhen(a.starts_at);
                const sub = [assessmentRuleLabel(a), when, a.place].filter(Boolean).join(" · ");
                return (
                  <button key={a.id} type="button" className={s.chip} onClick={() => pick(a)} style={{ textAlign: "left", whiteSpace: "normal", height: "auto", padding: "12px 16px" }}>
                    <strong>{a.name}</strong>
                    {sub ? <span style={{ display: "block", fontWeight: 500, fontSize: 13, marginTop: 4 }}>{sub}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className={s.actions}>
              <button type="button" className={s.back} onClick={() => { setError(null); setStep("who"); }}>
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
