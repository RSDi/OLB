"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import { resetRegistrationEmailText, saveRegistrationEmailText } from "../../../lib/teams/registration-email-actions";
import {
  REGISTRATION_EMAIL_FIELDS,
  REGISTRATION_EMAILS,
  codeEmail,
  emailText,
  type RegistrationEmail,
} from "../../../lib/teams/registration-email-text";
import { receipt, receiptHtml, receiptSubject } from "../../../lib/teams/registration-receipt";
import type { RegistrationInput } from "../../../lib/teams/registration-form";
import { ErrorBox } from "./TeamsSettingsTab";

interface Saved {
  value: string;
  updated_at: string;
  updated_by_name: string | null;
}

async function fetchSaved(): Promise<{ saved: Record<string, Saved>; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("olb_registration_email_text").select("key, value, updated_at, updated_by");
  if (error) return { saved: {}, error: error.message };
  const rows = (data as { key: string; value: string; updated_at: string; updated_by: string | null }[] | null) ?? [];
  const ids = [...new Set(rows.map((r) => r.updated_by).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase.from("members").select("user_id, full_name, nickname").in("user_id", ids);
    for (const m of (people as { user_id: string; full_name: string | null; nickname: string | null }[] | null) ?? []) {
      names.set(m.user_id, m.nickname?.trim() || m.full_name?.split(" ")[0] || "Someone");
    }
  }
  return {
    saved: Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updated_at: r.updated_at, updated_by_name: r.updated_by ? names.get(r.updated_by) ?? null : null }])),
    error: null,
  };
}

// A made-up family for the preview.
const SAMPLE = (first: string, tier: string, uniform: boolean): RegistrationInput =>
  ({ athlete_first: first, athlete_last: "Carter", fee_tier: tier, needs_uniform: uniform, needs_grays: null, payment_option: "Venmo" }) as RegistrationInput;
const SAMPLE_RECEIPT = receipt([SAMPLE("Sam", "14u - $400.00", true), SAMPLE("Evan", "8u-12u - $375.00", false)]);
const SAMPLE_WHO = { email: "jamie@example.com", first: "Jamie" };

// Settings → Registration Emails: the words in the emails the registration
// form sends (0127), the way Settings → Website edits the site. Super-admins
// and the Registrations permission change them; the rest of the board can
// read them. Saving changes what the next email says.
export function RegistrationEmailsTab({ canEdit }: { canEdit: boolean }) {
  const [email, setEmail] = useState<RegistrationEmail>("receipt");
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((d: { saved: Record<string, Saved>; error: string | null }) => {
    if (d.error) setError(d.error);
    setSaved(d.saved);
    setDrafts({});
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSaved().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const live = useMemo(() => emailText(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v.value]))), [saved]);
  const current = useMemo(() => ({ ...live, ...drafts }), [live, drafts]);
  const fields = REGISTRATION_EMAIL_FIELDS.filter((f) => f.email === email);
  const changed = fields.filter((f) => f.key in drafts && drafts[f.key] !== live[f.key]);

  const preview = useMemo(() => {
    if (email === "code") {
      const c = codeEmail("482915", current);
      return {
        subject: c.subject,
        html: `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;background:#fff;">${c.html}</body></html>`,
      };
    }
    return {
      subject: receiptSubject(SAMPLE_RECEIPT, current),
      html: receiptHtml(SAMPLE_RECEIPT, SAMPLE_WHO, { logoUrl: "/email/olb-logo.png", checkAddress: [] }, current),
    };
  }, [email, current]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    for (const f of changed) {
      const res = await saveRegistrationEmailText(f.key, drafts[f.key]);
      if (res.error) {
        setBusy(false);
        setError(`${f.label}: ${res.error}`);
        return;
      }
    }
    apply(await fetchSaved());
    setBusy(false);
    setNotice("Saved. The next email uses the new words.");
  }

  async function reset(key: string, label: string) {
    if (!confirm(`Put the original ${label.toLowerCase()} back?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await resetRegistrationEmailText(key);
    if (res.error) setError(res.error);
    else {
      apply(await fetchSaved());
      setNotice("The original is back.");
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 640, lineHeight: 1.55 }}>
        The words in the emails the registration form sends. The layout, each family&apos;s players and fees, and how to pay stay
        the same. {canEdit ? "Saving changes what the next email says." : "Super-admins and people with the Registrations permission can change them."}
      </div>

      <div role="tablist" aria-label="Registration emails" data-tour="registration-emails-pick" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)", alignSelf: "flex-start" }}>
        {REGISTRATION_EMAILS.map((e) => (
          <button
            key={e.key}
            type="button"
            role="tab"
            aria-selected={email === e.key}
            onClick={() => setEmail(e.key)}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: "none",
              background: email === e.key ? "var(--gw-bg-elev)" : "transparent",
              boxShadow: email === e.key ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              color: email === e.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: -8 }}>{REGISTRATION_EMAILS.find((e) => e.key === email)?.desc}</div>

      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
          <div className="rsd-card" data-tour="registration-emails-fields" style={{ gap: 14, padding: "16px 18px" }}>
            {fields.map((f) => {
              const value = current[f.key];
              const edited = f.key in saved;
              const s = saved[f.key];
              const field = f.multiline ? (
                <Textarea
                  label={f.label}
                  help={f.help || undefined}
                  value={value}
                  rows={Math.min(8, Math.max(3, value.split("\n").length + 1))}
                  maxLength={f.max}
                  readOnly={!canEdit}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  label={f.label}
                  help={f.help || undefined}
                  value={value}
                  maxLength={f.max}
                  readOnly={!canEdit}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              );
              return (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {field}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                    <span>
                      {f.key in drafts && drafts[f.key] !== live[f.key]
                        ? "Not saved yet"
                        : edited
                        ? `Changed ${new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${s.updated_by_name ? ` by ${s.updated_by_name}` : ""}`
                        : "Original wording"}
                    </span>
                    {canEdit && edited && (
                      <button
                        type="button"
                        onClick={() => reset(f.key, f.label)}
                        disabled={busy}
                        style={{ border: "none", background: "transparent", padding: 0, fontSize: 11.5, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Icons.Undo width={12} height={12} /> Reset to original
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <Pill variant="accent" size="sm" onClick={save} disabled={busy || changed.length === 0}>
                  {busy ? "Saving…" : changed.length > 1 ? `Save ${changed.length} changes` : "Save"}
                </Pill>
                <Pill variant="ghost" size="sm" onClick={() => setDrafts({})} disabled={busy || changed.length === 0}>
                  Undo my edits
                </Pill>
              </div>
            )}
          </div>

          <div data-tour="registration-emails-preview" style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
              Preview{email === "receipt" ? " · a made-up family" : ""}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Subject: {preview.subject}</div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              sandbox=""
              style={{ width: "100%", height: email === "code" ? 320 : 760, border: "1px solid var(--gw-border)", borderRadius: 12, background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
