"use client";
import { useEffect, useState } from "react";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { createClient } from "../../../lib/supabase/client";
import { EMAIL_TEMPLATE_COLUMNS, sortTemplates, type EmailTemplate } from "../../../lib/teams/email-templates";
import { loadReminderSetup, saveReminder, sendReminderTest, type ReminderSetup } from "../../../lib/finances/message-actions";
import { BALANCE_TOKEN_HELP, REMINDER_BODY, REMINDER_SUBJECT, WEEKDAYS, reminderSummary, type ReminderSettings } from "../../../lib/finances/reminders";
import type { Recipient } from "../../../lib/teams/family-mail";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };
const checkLabel: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" };

type Start = "owing" | "before" | "on" | "after";
const ROLES: { key: Recipient; label: string }[] = [
  { key: "father", label: "Dads" },
  { key: "mother", label: "Moms" },
  { key: "guardian", label: "Guardians" },
  { key: "player", label: "Players" },
];

interface Draft {
  enabled: boolean;
  weekday: number;
  start: Start;
  days: string;
  roles: Recipient[];
  subject: string;
  body: string;
}

function draftFrom(s: ReminderSettings): Draft {
  const off = s.reminder_offset_days;
  return {
    enabled: s.reminder_enabled,
    weekday: s.reminder_weekday,
    start: s.reminder_start === "owing" ? "owing" : off < 0 ? "before" : off > 0 ? "after" : "on",
    days: off === 0 ? "7" : String(Math.abs(off)),
    roles: s.reminder_roles,
    subject: s.reminder_subject ?? REMINDER_SUBJECT,
    body: s.reminder_body ?? REMINDER_BODY,
  };
}

function settingsFrom(d: Draft): Partial<ReminderSettings> {
  const n = Math.round(Number(d.days) || 0);
  return {
    reminder_enabled: d.enabled,
    reminder_weekday: d.weekday,
    reminder_start: d.start === "owing" ? "owing" : "due",
    reminder_offset_days: d.start === "before" ? -n : d.start === "after" ? n : 0,
    reminder_roles: d.roles,
    reminder_subject: d.subject,
    reminder_body: d.body,
  };
}

// Settings → Fees (0133): the weekly email to families that owe, until
// they've paid. When it starts is up to the Treasurer: as soon as a family
// owes, or some days from their due date. Families can be taken off it one
// by one on Finances.
export function ReminderCard() {
  const [setup, setSetup] = useState<ReminderSetup | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadReminderSetup().then((res) => {
      if (cancelled) return;
      if ("error" in res) return setError(res.error);
      setSetup(res);
      setDraft(draftFrom(res.settings));
    });
    createClient()
      .from("olb_email_templates")
      .select(EMAIL_TEMPLATE_COLUMNS)
      .then(({ data }) => {
        if (!cancelled) setTemplates(sortTemplates((data as EmailTemplate[] | null) ?? []));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!draft) return error ? <ErrorBox text={error} /> : null;
  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const toggleRole = (r: Recipient) => up({ roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r] });

  async function run(fn: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn().catch(() => ({ error: "That didn't work. Try again." }) as { error?: string; notice?: string });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.notice) setNotice(res.notice);
    const fresh = await loadReminderSetup();
    if (!("error" in fresh)) setSetup(fresh);
  }

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if ((draft!.subject !== REMINDER_SUBJECT || draft!.body !== REMINDER_BODY) && !confirm(`Replace the reminder's wording with the "${t.name}" template?`)) return;
    up({ subject: t.subject, body: t.body });
  }

  return (
    <div className="rsd-card" style={card} data-tour="fees-reminder">
      <h3 style={h3}>Weekly balance reminder</h3>
      <p style={sub}>An email each week to every family that still owes, until they&apos;ve paid. Families with a credit or nothing owed never get it.</p>
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          role="switch"
          checked={draft.enabled}
          onChange={(e) => up({ enabled: e.target.checked })}
          style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Send the weekly reminder</span>
          <span style={sub}>{reminderSummary({ ...setup!.settings, ...settingsFrom(draft) } as ReminderSettings)}</span>
        </span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14, alignItems: "end" }}>
        <Select label="Day it goes" value={String(draft.weekday)} onChange={(e) => up({ weekday: Number(e.target.value) })}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </Select>
        <Select label="When it starts" value={draft.start} onChange={(e) => up({ start: e.target.value as Start })}>
          <option value="owing">As soon as a family owes</option>
          <option value="before">Days before their due date</option>
          <option value="on">On their due date</option>
          <option value="after">Days after their due date</option>
        </Select>
        {(draft.start === "before" || draft.start === "after") && (
          <Input label="How many days" inputMode="numeric" value={draft.days} onChange={(e) => up({ days: e.target.value })} placeholder="7" />
        )}
      </div>
      {draft.start !== "owing" && (
        <p style={sub}>A family&apos;s due date is the one on their balance, or the season&apos;s &quot;Balances due by&quot; above. A family with neither doesn&apos;t get it.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Who gets it</span>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {ROLES.map((r) => (
            <label key={r.key} style={checkLabel}>
              <input type="checkbox" checked={draft.roles.includes(r.key)} onChange={() => toggleRole(r.key)} />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      {templates.length > 0 && (
        <Select label="Start from a template" value="" onChange={(e) => pickTemplate(e.target.value)} help="Fills in the subject and message below. Change anything before you save.">
          <option value="">Pick a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      )}
      <Input label="Subject" value={draft.subject} maxLength={200} onChange={(e) => up({ subject: e.target.value })} />
      <Textarea label="Message" help={BALANCE_TOKEN_HELP} value={draft.body} rows={10} maxLength={4000} onChange={(e) => up({ body: e.target.value })} />

      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill size="sm" variant="accent" onClick={() => run(() => saveReminder(settingsFrom(draft)))} disabled={busy}>
          {busy ? "Saving…" : "Save reminder"}
        </Pill>
        <Pill size="sm" variant="ghost" onClick={() => run(() => sendReminderTest(settingsFrom(draft)))} disabled={busy}>
          Email me a test
        </Pill>
      </div>

      {setup && setup.recent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Recent weeks</span>
          {setup.recent.map((w) => (
            <span key={w.week} style={sub}>
              {`Week of ${new Date(`${w.week}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${w.sent} ${w.sent === 1 ? "family" : "families"}${w.failed ? `, ${w.failed} didn't send` : ""}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
