"use client";
// Settings → Assessments: create, edit, and open or close tryouts.
// Registrations permission. Preview and Jeff's full UI only.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { listAssessments, saveAssessmentRow, setAssessmentOpen } from "../../../lib/onboarding/assessment-actions";
import {
  GRADES,
  assessmentPublicPath,
  assessmentRuleLabel,
  assessmentWhen,
  emptyAssessmentInput,
  gradeLabel,
  inputFromAssessment,
  normalizeAssessmentSlug,
  type Assessment,
  type AssessmentInput,
} from "../../../lib/onboarding/assessments";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

export function AssessmentsTab() {
  const [rows, setRows] = useState<Assessment[]>([]);
  const [fromTable, setFromTable] = useState(false);
  const [draft, setDraft] = useState<AssessmentInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await listAssessments();
    setRows(res.assessments);
    setFromTable(res.fromTable);
    if (res.error) setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAssessments().then((res) => {
      if (cancelled) return;
      setRows(res.assessments);
      setFromTable(res.fromTable);
      if (res.error) setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function startNew() {
    setError(null);
    setNotice(null);
    setDraft(emptyAssessmentInput());
  }

  function startEdit(a: Assessment) {
    setError(null);
    setNotice(null);
    setDraft(inputFromAssessment(a));
  }

  const up = (patch: Partial<AssessmentInput>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    if (patch.name != null && !draft.id && !draft.slug) {
      next.slug = normalizeAssessmentSlug(patch.name);
    }
    setDraft(next);
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveAssessmentRow(draft);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice(draft.id ? "Saved." : "Created. Families can open it at the public address when it's Open.");
    setDraft(null);
    await reload();
  }

  async function toggle(a: Assessment) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await setAssessmentOpen(a.id, !a.open);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice(a.open ? `Closed ${a.name}.` : `Opened ${a.name}.`);
    await reload();
  }

  if (loading) {
    return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        Assessments families can sign up for. Several can be open at once. Each one has its own address, copy, and birthday or grade rule. Sign-ups land on the Waitlist tab.
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}
      {!fromTable && (
        <div className="rsd-card" style={card}>
          <p style={{ ...sub, margin: 0 }}>
            These two samples are on this preview only — the assessments table isn&apos;t in the database yet. Paste the SQL from the pull request to create, edit, and open your own.
          </p>
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="assessments-list">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={h3}>Assessments</h3>
          <span data-tour="assessments-new">
            <Pill variant="accent" size="sm" onClick={startNew} disabled={busy || !fromTable}>
              <Icons.Plus width={14} height={14} /> New assessment
            </Pill>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((a) => {
            const when = assessmentWhen(a.starts_at);
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "12px 0",
                  borderTop: "1px solid var(--gw-border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {a.name}{" "}
                    <span style={{ fontWeight: 600, color: a.open ? "var(--rsd-accent)" : "var(--gw-fg-muted)" }}>
                      {a.open ? "Open" : "Closed"}
                    </span>
                  </div>
                  <div style={{ ...sub, marginTop: 4 }}>
                    /assessments/{a.slug}
                    {" · "}
                    {assessmentRuleLabel(a)}
                    {when ? ` · ${when}` : ""}
                    {a.place ? ` · ${a.place}` : ""}
                    {a.builtin ? " · sample" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link href={assessmentPublicPath(a)} style={{ fontSize: 12, fontWeight: 700, alignSelf: "center" }}>
                    View
                  </Link>
                  <Pill size="sm" onClick={() => startEdit(a)} disabled={busy || Boolean(a.builtin)}>
                    Edit
                  </Pill>
                  <Pill size="sm" variant={a.open ? "ghost" : "accent"} onClick={() => toggle(a)} disabled={busy || Boolean(a.builtin)}>
                    {a.open ? "Close" : "Open"}
                  </Pill>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <form
          className="rsd-card"
          style={card}
          data-tour="assessments-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h3 style={h3}>{draft.id ? "Edit assessment" : "New assessment"}</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Name" value={draft.name} onChange={(e) => up({ name: e.target.value })} help="Families see this on the form and the Waitlist tab." />
            <Input
              label="Address"
              value={draft.slug}
              onChange={(e) => up({ slug: normalizeAssessmentSlug(e.target.value) })}
              help="The public page is /assessments/ plus this, like 14u or high-school."
            />
            <Input label="Level" value={draft.level} onChange={(e) => up({ level: e.target.value })} help="Optional tag on the waitlist card, like 14U or HS." />
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={draft.open} onChange={(e) => up({ open: e.target.checked })} />
              Open — families can sign up
            </label>
            <Input label="Date and time" type="datetime-local" value={draft.starts_at} onChange={(e) => up({ starts_at: e.target.value })} help="America/Chicago. Leave blank if the time isn't set yet." />
            <Input label="Place" value={draft.place} onChange={(e) => up({ place: e.target.value })} />
            <Textarea label="Details" value={draft.details} onChange={(e) => up({ details: e.target.value })} help="Intro copy on the first step of the form." rows={5} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Birthday from" type="date" value={draft.dob_from} onChange={(e) => up({ dob_from: e.target.value })} />
              <Input label="Birthday to" type="date" value={draft.dob_to} onChange={(e) => up({ dob_to: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Grade from</span>
                <select className="olb-input" value={draft.grade_from} onChange={(e) => up({ grade_from: e.target.value })} style={{ height: 42 }}>
                  <option value="">None</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {gradeLabel(g)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Grade to</span>
                <select className="olb-input" value={draft.grade_to} onChange={(e) => up({ grade_to: e.target.value })} style={{ height: 42 }}>
                  <option value="">None</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {gradeLabel(g)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p style={sub}>Leave birthday and grade blank to let anyone sign up. If you set both, a player fits when his birthday or his grade matches.</p>
            <Input label="Thanks subject (optional)" value={draft.thanks_subject} onChange={(e) => up({ thanks_subject: e.target.value })} help="Overrides the Assessment thanks email for this assessment only." />
            <Textarea label="Thanks words (optional)" value={draft.thanks_body} onChange={(e) => up({ thanks_body: e.target.value })} rows={4} />
            <Input label="Reminder subject (optional)" value={draft.reminder_subject} onChange={(e) => up({ reminder_subject: e.target.value })} />
            <Textarea label="Reminder words (optional)" value={draft.reminder_body} onChange={(e) => up({ reminder_body: e.target.value })} rows={4} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Pill variant="accent" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Pill>
            <Pill type="button" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Pill>
          </div>
        </form>
      )}
    </div>
  );
}
