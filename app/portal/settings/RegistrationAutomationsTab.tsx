"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Pill, Textarea } from "../../components/ui";
import { Icons } from "../../components/icons";
import { ErrorBox } from "./TeamsSettingsTab";
import {
  loadAutomationsTab,
  resetWorkflowWords,
  saveOnboardingSettings,
  saveWorkflowWords,
  type AutomationsTab,
} from "../../../lib/onboarding/actions";
import { AUTOMATIONS, MODES, type AutomationKey, type Mode, type OnboardingSettings } from "../../../lib/onboarding/automations";
import { WORKFLOW_EMAILS, fill, wordsFor, type WorkflowEmail } from "../../../lib/onboarding/email-text";

// Made-up values for the email preview.
const SAMPLE: Record<string, string> = {
  parent: "Megan",
  player: "Eli",
  season: "2026-27",
  checklist: "https://omahalightningbasketball.com/family/…",
  link: "https://omahalightningbasketball.com/player-registration?offer=…",
  expires: "Friday, Jul 26",
  slack: "https://join.slack.com/…",
  meeting: "Parent meeting: Monday, Sep 21, 7pm in the gym",
  practice: "First practice: Monday, Sep 28",
  items: "• Pay $375\n• Join Slack",
  team: "10u Black",
  coach: "Coach Cory",
  practice_times: "Mon & Thu 6–7:30pm",
  clinic: "Mondays in July, 6–7:30pm at the church gym",
  when: "Monday, Sep 28",
};

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

// Settings → Registration automations (0130): the registration workflow's
// one switch, Pause all, each automatic email's Off / Ask me first / On
// (and its words), the approval switches, and the links and dates the
// emails and the family checklist use. Only the Registrations permission
// opens it.
export function RegistrationAutomationsTab() {
  const [tab, setTab] = useState<AutomationsTab | null>(null);
  const [draft, setDraft] = useState<OnboardingSettings | null>(null);
  const [editing, setEditing] = useState<WorkflowEmail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadAutomationsTab>>) => {
    if ("error" in res) return setError(res.error);
    setTab(res);
    setDraft(res.settings);
  }, []);
  const load = useCallback(async () => apply(await loadAutomationsTab()), [apply]);
  useEffect(() => {
    let cancelled = false;
    loadAutomationsTab().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const dirty = useMemo(() => !!tab && !!draft && JSON.stringify(tab.settings) !== JSON.stringify(draft), [tab, draft]);

  if (error && !tab) return <ErrorBox text={error} />;
  if (!tab || !draft) return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;

  const up = (patch: Partial<OnboardingSettings>) => setDraft({ ...draft, ...patch });
  const setMode = (key: AutomationKey, mode: Mode) => up({ modes: { ...draft.modes, [key]: mode } });

  async function save(next = draft!) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveOnboardingSettings(next);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice("Saved.");
    await load();
  }

  const status = !draft.enabled
    ? "Off. Registration works the way it always has, and nothing below happens."
    : draft.paused
      ? "On, but paused: no automatic emails go out. Offers still run out on their date."
      : "On. The emails below follow their switches.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        The registration workflow for the {tab.season} season: the family checklist, the waitlist form, spot offers, uniform sizes,
        the handbook at registration and the automatic emails. Every email starts Off.
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="automations-switch">
        <Toggle
          on={draft.enabled}
          onChange={(v) => up({ enabled: v })}
          label="Use the new registration workflow"
          desc="Turn this off at any time and registration goes back to exactly how it works today. What families already sent is kept."
        />
        <Toggle on={draft.paused} onChange={(v) => up({ paused: v })} label="Pause all automatic emails" desc="Holds every automatic email without changing their switches." />
        <p style={{ ...sub, fontWeight: 700, color: draft.enabled && !draft.paused ? "var(--gw-fg)" : "var(--gw-fg-muted)" }}>{status}</p>
      </div>

      <div className="rsd-card" style={{ ...card, padding: 0, gap: 0, overflow: "hidden" }} data-tour="automations-emails">
        <div style={{ padding: "16px 18px 6px" }}>
          <h3 style={h3}>Automatic emails</h3>
          <p style={sub}>Ask me first holds each email on Directory → Registrations → Onboarding, where you read it and press Send or Skip.</p>
        </div>
        {AUTOMATIONS.map((a) => {
          const mode: Mode = draft.modes[a.key] ?? "off";
          const c = tab.counts[a.key];
          return (
            <div key={a.key} style={{ borderTop: "1px solid var(--gw-border)", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.label}</div>
                  <div style={sub}>
                    {a.when}
                    {c ? ` · ${[c.sent && `${c.sent} sent in 30 days`, c.waiting && `${c.waiting} waiting for you`].filter(Boolean).join(", ")}` : ""}
                  </div>
                </div>
                <Segmented value={mode} onChange={(m) => setMode(a.key, m)} label={a.label} />
                <button type="button" onClick={() => setEditing(editing === a.key ? null : a.key)} style={linkBtn}>
                  {editing === a.key ? "Close" : "Words"}
                </button>
              </div>
              {editing === a.key && <WordsEditor email={a.key} saved={tab.words} onSaved={load} />}
            </div>
          );
        })}
        <div style={{ borderTop: "1px solid var(--gw-border)", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Spot offer</div>
              <div style={sub}>Sent when someone presses Offer a spot on the Waitlist tab, after they read it over.</div>
            </div>
            <button type="button" onClick={() => setEditing(editing === "offer" ? null : "offer")} style={linkBtn}>
              {editing === "offer" ? "Close" : "Words"}
            </button>
          </div>
          {editing === "offer" && <WordsEditor email="offer" saved={tab.words} onSaved={load} />}
        </div>
      </div>

      <div className="rsd-card" style={card}>
        <h3 style={h3}>Approving on its own</h3>
        <Toggle
          on={draft.auto_approve_offer}
          onChange={(v) => up({ auto_approve_offer: v })}
          label="Approve families who register from an offer link"
          desc="Someone already chose them when they pressed Offer a spot."
        />
        <Toggle
          on={draft.auto_approve_returning}
          onChange={(v) => up({ auto_approve_returning: v })}
          label="Approve returning families"
          desc="Players on a past season's roster with the same name and birthday. Everyone else waits in New for a person."
        />
      </div>

      <div className="rsd-card" style={card}>
        <h3 style={h3}>Links and dates</h3>
        <p style={sub}>The emails and each family&apos;s checklist use these. Leave anything blank to leave it out.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <Input
            label="Player Handbook link"
            help="With a link here, families sign the handbook on the registration form. Blank: no handbook step."
            value={draft.handbook_url ?? ""}
            onChange={(e) => up({ handbook_url: e.target.value })}
            placeholder="https://drive.google.com/…"
          />
          <Input
            label="Slack invite link"
            help="On Slack's free plan invite links run out. Make a new one in Slack, paste it here, and set its date. You'll get a reminder a week before."
            value={draft.slack_invite_url ?? ""}
            onChange={(e) => up({ slack_invite_url: e.target.value })}
            placeholder="https://join.slack.com/t/…"
          />
          <Input label="Slack link runs out" type="date" value={draft.slack_invite_expires_on ?? ""} onChange={(e) => up({ slack_invite_expires_on: e.target.value })} />
          <Input
            label="Offer links last (days)"
            type="number"
            min={2}
            max={30}
            value={String(draft.offer_days)}
            onChange={(e) => up({ offer_days: Number(e.target.value) })}
          />
          <Input label="Parent meeting date" type="date" value={draft.parent_meeting_on ?? ""} onChange={(e) => up({ parent_meeting_on: e.target.value })} />
          <Input label="Parent meeting time and place" value={draft.parent_meeting ?? ""} onChange={(e) => up({ parent_meeting: e.target.value })} placeholder="7pm in the gym" />
          <Input label="First practice" type="date" value={draft.first_practice_on ?? ""} onChange={(e) => up({ first_practice_on: e.target.value })} />
        </div>
        <Textarea
          label="Clinic details"
          help="For the clinic invite to waitlisted families. Blank: no clinic invite."
          rows={3}
          value={draft.clinic_info ?? ""}
          onChange={(e) => up({ clinic_info: e.target.value })}
          placeholder="Mondays in July, 6–7:30pm at …"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          position: "sticky",
          bottom: 12,
          padding: "10px 12px",
          borderRadius: 14,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          boxShadow: "var(--gw-shadow-2)",
          alignSelf: "flex-start",
        }}
      >
        <Pill variant="accent" onClick={() => save()} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={() => setDraft(tab.settings)} disabled={busy || !dirty}>
          Undo my changes
        </Pill>
        {dirty && <span style={{ ...sub, fontWeight: 700 }}>Not saved yet</span>}
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--gw-fg)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span style={sub}>{desc}</span>
      </span>
    </label>
  );
}

function Segmented({ value, onChange, label }: { value: Mode; onChange: (m: Mode) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)" }}>
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={value === m.key}
          onClick={() => onChange(m.key)}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 8,
            border: "none",
            background: value === m.key ? "var(--gw-bg-elev)" : "transparent",
            boxShadow: value === m.key ? "0 1px 2px rgba(0,0,0,.08)" : "none",
            color: value === m.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// One email's subject and words, with a preview using a made-up family.
function WordsEditor({ email, saved, onSaved }: { email: WorkflowEmail; saved: Record<string, string>; onSaved: () => Promise<void> }) {
  const live = wordsFor(email, saved);
  const [subject, setSubject] = useState(live.subject);
  const [body, setBody] = useState(live.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const def = WORKFLOW_EMAILS.find((e) => e.key === email)!;
  const changed = subject !== live.subject || body !== live.body;
  const edited = `${email}.subject` in saved || `${email}.body` in saved;

  async function save() {
    setBusy(true);
    setError(null);
    for (const [part, value] of [["subject", subject], ["body", body]] as const) {
      if (value === live[part]) continue;
      const res = await saveWorkflowWords(`${email}.${part}`, value);
      if (res.error) {
        setBusy(false);
        return setError(res.error);
      }
    }
    await onSaved();
    setBusy(false);
  }

  async function reset() {
    if (!confirm("Put the original words back?")) return;
    setBusy(true);
    await resetWorkflowWords(`${email}.subject`);
    await resetWorkflowWords(`${email}.body`);
    setSubject(def.subject);
    setBody(def.body);
    await onSaved();
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, paddingTop: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Input label="Subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          label="Words"
          help={`These become the family's details: ${def.tokens.map((t) => `{${t}}`).join(" ")}. A line whose {word} has nothing to fill in is left out.`}
          rows={Math.min(16, Math.max(6, body.split("\n").length + 1))}
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <ErrorBox text={error} />}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Pill size="sm" variant="accent" onClick={save} disabled={busy || !changed}>
            {busy ? "Saving…" : "Save words"}
          </Pill>
          {edited && (
            <button type="button" onClick={reset} disabled={busy} style={{ ...linkBtn, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icons.Undo width={12} height={12} /> Reset to original
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>Preview · a made-up family</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{fill(subject, SAMPLE)}</div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, border: "1px solid var(--gw-border)", borderRadius: 10, padding: "12px 14px", background: "var(--gw-bg)" }}>
          {fill(body, SAMPLE)}
        </div>
      </div>
    </div>
  );
}
