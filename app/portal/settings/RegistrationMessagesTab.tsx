"use client";
// Settings → Messages: the optional box on the public Our Programs page.
// Registrations permission.

import { useCallback, useEffect, useState } from "react";
import { Input, Pill, Textarea } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { loadHomepageMessageSettings, saveHomepageMessage } from "../../../lib/website/homepage-message-actions";
import {
  BODY_MAX,
  DEFAULT_PROGRAMS_HERO,
  LINK_TEXT_MAX,
  LINK_URL_MAX,
  type HomepageMessage,
  type HomepageMessageInput,
} from "../../../lib/website/homepage-message";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

function asDraft(m: HomepageMessage): HomepageMessageInput {
  return { enabled: m.enabled, body: m.body, link_text: m.link_text, link_url: m.link_url };
}

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }} data-tour="registration-messages-toggle">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span style={sub}>{desc}</span>
      </span>
    </label>
  );
}

export function RegistrationMessagesTab() {
  const [saved, setSaved] = useState<HomepageMessageInput>(asDraft(DEFAULT_PROGRAMS_HERO));
  const [draft, setDraft] = useState<HomepageMessageInput>(asDraft(DEFAULT_PROGRAMS_HERO));
  const [fromTable, setFromTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((m: HomepageMessage, table: boolean) => {
    const next = asDraft(m);
    setSaved(next);
    setDraft(next);
    setFromTable(table);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadHomepageMessageSettings().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      apply(res.message, res.fromTable);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const dirty =
    draft.enabled !== saved.enabled ||
    draft.body !== saved.body ||
    draft.link_text !== saved.link_text ||
    draft.link_url !== saved.link_url;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveHomepageMessage(draft);
    setBusy(false);
    if (res.error) return setError(res.error);
    apply({ key: "programs_hero", ...draft }, true);
    setNotice(draft.enabled ? "Saved. The box is on the Our Programs page." : "Saved. The box is hidden on the Our Programs page.");
  }

  if (loading) {
    return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        A message on the public <strong>Our Programs</strong> page, in the yellow band at the top. Off, the page looks the way it does now. On, families see the box where the old waitlist notice was.
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
            The messages table isn&apos;t in the database yet, so the box stays hidden on the site. Paste the SQL from the pull request to save and show it.
          </p>
        </div>
      )}

      <div className="rsd-card" style={card} data-tour="registration-messages-fields">
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Our Programs page</h3>
        <Toggle
          on={draft.enabled}
          onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
          label="Show message box"
          desc="When this is off, the box is hidden from the Our Programs page entirely."
        />
        <Textarea
          label="Wording"
          help="What families read in the box. Leave a blank line between paragraphs."
          value={draft.body}
          rows={8}
          maxLength={BODY_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        />
        <Input
          label="Link text"
          help="The words they tap. Leave blank for no link."
          value={draft.link_text}
          maxLength={LINK_TEXT_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, link_text: e.target.value }))}
        />
        <Input
          label="Link address"
          help="A site page like /programs#14u (opens 14U Competitive on Our Programs) or a web address."
          value={draft.link_url}
          maxLength={LINK_URL_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))}
        />
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <Pill variant="accent" size="sm" onClick={save} disabled={busy || !dirty || !fromTable}>
            {busy ? "Saving…" : "Save"}
          </Pill>
          <Pill variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={busy || !dirty}>
            Undo my edits
          </Pill>
        </div>
      </div>

      <div data-tour="registration-messages-preview" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
          Preview · Our Programs
        </div>
        <div style={{ background: "#fbcb44", color: "#111", padding: 20, borderRadius: 12 }}>
          {draft.enabled && draft.body.trim() ? (
            <div style={{ background: "#000", color: "#fbcb44", padding: "16px 18px" }}>
              <p style={{ margin: 0, fontWeight: 500, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{draft.body.trim()}</p>
              {draft.link_text.trim() && draft.link_url.trim() ? (
                <p style={{ margin: "12px 0 0", fontWeight: 700 }}>
                  <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{draft.link_text.trim()}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <p style={{ ...sub, color: "#111", margin: 0 }}>The box is hidden. Turn on <strong>Show message box</strong> to see it here and on the site.</p>
          )}
        </div>
      </div>
    </div>
  );
}
