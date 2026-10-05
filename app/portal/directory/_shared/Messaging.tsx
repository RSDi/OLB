"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import { createClient } from "../../../../lib/supabase/client";
import { EMAIL_TEMPLATE_COLUMNS, sortTemplates, type EmailTemplate } from "../../../../lib/teams/email-templates";
import { ErrorNote, Sheet, capStyle } from "../../payments/parts";
import {
  ALL_RECIPIENTS,
  fillMessage,
  firstNames,
  groupByFamily,
  rolesPresent,
  type MailTarget,
  type Recipient,
  type SentMessage,
} from "../../../../lib/teams/family-mail";
import { muted } from "./PlayerParts";
import { SlackLogo } from "../../../components/SlackLogo";

export type SendResult = { sent?: number; skipped?: string[]; error?: string };

const ROLE_LABEL: Record<Recipient, { one: string; many: string }> = {
  father: { one: "Dad", many: "Dads" },
  mother: { one: "Mom", many: "Moms" },
  guardian: { one: "Guardian", many: "Guardians" },
  player: { one: "Player", many: "Players" },
};

const contactsOf = (t: MailTarget) => t.contacts;

// Writing to families from the portal: the waitlist, the Directory and a
// player's page. One player: a box for each person with an email, and their
// name already in the message. Several: a box for Dads, Moms and Players,
// one email per family, and {player} filled in for each family as it sends.
// `startTemplate` starts from the board's template with that slug, when it
// has one (the waitlist's message), instead of `subject` and `body`.
export function ComposeSheet({
  targets,
  title,
  eyebrow,
  note,
  subject: startSubject,
  body: startBody,
  startTemplate,
  onSend,
  onClose,
}: {
  targets: MailTarget[];
  title: string;
  eyebrow: string;
  // What happens when it sends, under the title.
  note: ReactNode;
  subject: string;
  body: string;
  startTemplate?: string;
  onSend: (ids: string[], subject: string, body: string, roles: Recipient[]) => Promise<SendResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const one = targets.length === 1;
  // One family: their names go straight into the text. Several: {player}
  // stays, and is filled in for each family as it sends.
  const [fill] = useState(() => (text: string) => (one ? fillMessage(text, targets) : text));
  const [subject, setSubject] = useState(startSubject);
  const [body, setBody] = useState(() => fill(startBody));
  // Set once you type, so a template arriving late doesn't overwrite you.
  const typed = useRef(false);
  // The board's templates (0117), and the text last put in from one (or the
  // start), so picking another only asks before replacing your own writing.
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [placed, setPlaced] = useState({ subject, body });
  const [roles, setRoles] = useState<Recipient[]>(ALL_RECIPIENTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { groups, noEmail } = groupByFamily(targets, contactsOf, roles);
  const families = groups.length;
  const contacts = one ? targets[0].contacts : [];
  const offered = rolesPresent(targets.flatMap(contactsOf));
  const toggle = (r: Recipient) => setRoles((list) => (list.includes(r) ? list.filter((x) => x !== r) : ALL_RECIPIENTS.filter((x) => x === r || list.includes(x))));
  const preview = !one && /\{player\}/i.test(body) && groups[0] ? groups[0] : null;
  const picked = contacts.filter((c) => roles.includes(c.role)).length;
  const primary = contacts.find((c) => c.primary);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("olb_email_templates")
      .select(EMAIL_TEMPLATE_COLUMNS)
      .then(({ data }) => {
        if (cancelled) return;
        const list = sortTemplates((data as EmailTemplate[] | null) ?? []);
        setTemplates(list);
        const start = startTemplate && !typed.current ? list.find((t) => t.slug === startTemplate) : undefined;
        if (start) {
          const next = { subject: fill(start.subject), body: fill(start.body) };
          setSubject(next.subject);
          setBody(next.body);
          setPlaced(next);
          setTemplateId(start.id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fill, startTemplate]);

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return setTemplateId("");
    const written = (subject !== placed.subject || body !== placed.body) && !!(subject.trim() || body.trim());
    if (written && !confirm(`Replace what you've written with the "${t.name}" template?`)) return;
    const next = { subject: fill(t.subject), body: fill(t.body) };
    setSubject(next.subject);
    setBody(next.body);
    setPlaced(next);
    setTemplateId(id);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await onSend(
      targets.map((t) => t.id),
      subject,
      body,
      roles
    );
    setBusy(false);
    if (res.error && !res.sent) return setError(res.error);
    const skipped = res.skipped?.length ? ` No email for ${res.skipped.join(", ")}.` : "";
    setDone(`Sent to ${res.sent} ${res.sent === 1 ? "family" : "families"}.${skipped}${res.error ? ` ${res.error}` : ""}`);
    router.refresh();
  }

  const familyList = groups.map((g) => (
    <span key={g.players.map((t) => t.id).join()} style={{ fontSize: 12.5, color: "var(--gw-fg)", overflowWrap: "anywhere" }}>
      <strong>{g.players.map((t) => t.first_name).join(" & ")}</strong> · {g.emails.join(", ")}
    </span>
  ));

  return (
    <Sheet eyebrow={eyebrow} title={title} busy={busy} onClose={onClose}>
      {done ? (
        <>
          <div role="status" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
            {done}
          </div>
          <Pill variant="accent" onClick={onClose}>
            Done
          </Pill>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.55 }}>{note}</div>

          <div data-tour="message-recipients" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={capStyle}>Send to</span>
            {one && contacts.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>No email on file for this family.</span>
            ) : one ? (
              contacts.map((c) => (
                <label key={`${c.role}:${c.email}`} style={{ ...checkLabel, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={roles.includes(c.role)} onChange={() => toggle(c.role)} style={{ marginTop: 3 }} />
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong>{ROLE_LABEL[c.role].one}</strong> · {c.name} · <span style={{ color: "var(--gw-fg-muted)" }}>{c.email}</span>
                    {c.primary && (
                      <span className="rsd-chip rsd-chip-accent" style={{ marginLeft: 8, verticalAlign: "1px" }}>
                        Primary email
                      </span>
                    )}
                  </span>
                </label>
              ))
            ) : (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {offered.map((r) => (
                  <label key={r} style={checkLabel}>
                    <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />
                    {ROLE_LABEL[r].many}
                  </label>
                ))}
              </div>
            )}
            {!one && families > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                {families > 6 ? (
                  <details>
                    <summary style={{ ...muted, fontWeight: 600, cursor: "pointer" }}>
                      {families} families · see who gets it
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>{familyList}</div>
                  </details>
                ) : (
                  familyList
                )}
              </div>
            )}
            {one && primary && (
              <span style={muted}>
                {targets[0].first_name}&apos;s email on file is {ROLE_LABEL[primary.role].one}&apos;s too, so it&apos;s listed once, as the family&apos;s
                primary email.
              </span>
            )}
            {one && groups[0] && groups[0].emails.length < picked && (
              <span style={muted}>They share an email, so it goes out once: {groups[0].emails.join(", ")}.</span>
            )}
            {noEmail.length > 0 && (!one || contacts.length > 0) && (
              <span style={{ fontSize: 12.5, color: "var(--gw-error)", fontWeight: 600 }}>
                No email for {one ? "" : "the people picked for "}
                {noEmail.map((t) => t.name).join(", ")}, so {noEmail.length === 1 ? "that family won't" : "they won't"} get it.
              </span>
            )}
          </div>

          {templates.length > 0 && (
            <div data-tour="message-template">
              <Select label="Template" value={templateId} onChange={(e) => pickTemplate(e.target.value)} help="Fills in the subject and message. Change anything before you send.">
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Input
            label="Subject"
            value={subject}
            maxLength={200}
            placeholder="What's it about?"
            onChange={(e) => {
              typed.current = true;
              setSubject(e.target.value);
            }}
          />
          <Textarea
            label="Message"
            help={one ? "Type {player} anywhere to put in the player's name." : "{player} becomes each family's player names when it sends."}
            value={body}
            rows={11}
            maxLength={4000}
            onChange={(e) => {
              typed.current = true;
              setBody(e.target.value);
            }}
          />
          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={capStyle}>How it reads for {firstNames(preview.players)}</span>
              <div style={{ ...muted, whiteSpace: "pre-wrap", lineHeight: 1.55, padding: "10px 12px", borderRadius: 10, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
                {fillMessage(body, preview.players)}
              </div>
            </div>
          )}
          {error && <ErrorNote text={error} />}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
            <Pill variant="accent" onClick={send} disabled={busy || families === 0 || !subject.trim() || !body.trim()}>
              {busy ? "Sending…" : families <= 1 ? "Send" : `Send to ${families} families`}
            </Pill>
            <Pill variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Pill>
          </div>
        </>
      )}
    </Sheet>
  );
}

const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" };

// Emails and Slack DMs sent to the family from the portal, newest first.
export function SentMessages({ messages, style }: { messages: SentMessage[]; style?: React.CSSProperties }) {
  return (
    <details style={style}>
      <summary style={{ ...capStyle, fontSize: 10, cursor: "pointer" }}>Messages sent ({messages.length})</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {m.via === "slack" && <SlackLogo size={12} />}
              {m.subject}
            </span>
            <span style={muted}>
              {new Date(m.sent_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {m.sent_by_name ? ` · by ${m.sent_by_name}` : ""} · to {m.sent_to.join(", ")}
            </span>
            <div style={{ ...muted, whiteSpace: "pre-wrap", lineHeight: 1.55, padding: "8px 10px", borderRadius: 8, background: "var(--gw-bg)" }}>{m.body}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
