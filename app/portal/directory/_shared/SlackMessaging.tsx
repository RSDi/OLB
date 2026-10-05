"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Select, Textarea } from "../../../components/ui";
import { SlackLogo } from "../../../components/SlackLogo";
import { createClient } from "../../../../lib/supabase/client";
import { EMAIL_TEMPLATE_COLUMNS, sortTemplates, type EmailTemplate } from "../../../../lib/teams/email-templates";
import { ALL_RECIPIENTS, rolesPresent, type MailTarget, type Recipient } from "../../../../lib/teams/family-mail";
import { CONNECT_OUTCOMES, DM_MAX, DM_MESSAGE, ROLE_WORD, fillDm, roleWords } from "../../../../lib/slack-dm/recipients";
import {
  checkSlackRecipients,
  disconnectSlack,
  getSlackDmStatus,
  sendSlackDms,
  type SlackCheck,
  type SlackDmStatus,
} from "../../../../lib/slack-dm/actions";
import { ErrorNote, Sheet, capStyle } from "../../payments/parts";
import { muted } from "./PlayerParts";

const ROLE_MANY: Record<Recipient, string> = { father: "Dads", mother: "Moms", guardian: "Guardians", player: "Players" };

// How many people each send call handles, so the window can count up.
const STEP = 8;

const CONNECT_URL = "/api/slack/connect?popup=1";

// Slack DMs to families (0118), from the Directory or a player's page: one
// direct message to each person picked, sent from the sender's own Slack, so
// replies come straight back to them. First they connect Slack (once), then
// the window checks who has a Slack account with the email on file, and
// sends to those people a few at a time.
export function SlackComposeSheet({ targets, eyebrow, onClose }: { targets: MailTarget[]; eyebrow: string; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<SlackDmStatus | null>(null);
  // Counts each status read, so the Slack lookup runs again after one.
  const [statusSeq, setStatusSeq] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [roles, setRoles] = useState<Recipient[]>(ALL_RECIPIENTS);
  // The last Slack lookup, for the boxes ticked then (`key`).
  const [checked, setChecked] = useState<{ key: string; data: { people: SlackCheck[]; noContact: string[] } | null; error?: string } | null>(null);
  const [body, setBody] = useState(DM_MESSAGE);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [placed, setPlaced] = useState(DM_MESSAGE);
  const [sending, setSending] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<{ sent: string[]; missed: { email: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => targets.map((t) => t.id), [targets]);
  const offered = rolesPresent(targets.flatMap((t) => t.contacts));
  const busy = !!sending;

  const loadStatus = useCallback(
    () =>
      getSlackDmStatus().then((s) => {
        if (!("ready" in s)) return setError(s.error);
        setStatus(s);
        setStatusSeq((n) => n + 1);
        if (!s.ready && s.error) setError(s.error);
      }),
    []
  );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // The "Connect Slack" pop-up says how it went as it closes.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== "slack-connect") return;
      const outcome = String(e.data.outcome);
      setNote(outcome === "connected" ? null : CONNECT_OUTCOMES[outcome] ?? CONNECT_OUTCOMES.failed);
      setError(null);
      loadStatus();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadStatus]);

  // If Slack's page cut the pop-up off from this one, coming back to this
  // window checks again.
  const waiting = !!status && !status.ready && (status.reason === "not-connected" || status.reason === "reconnect");
  useEffect(() => {
    if (!waiting) return;
    const onFocus = () => loadStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [waiting, loadStatus]);

  // Who of the people picked is on Slack, once connected and again when the
  // boxes change.
  const checkKey = `${statusSeq}|${roles.join(",")}`;
  const ready = !!status?.ready;
  useEffect(() => {
    if (!ready || result) return;
    let cancelled = false;
    checkSlackRecipients(ids, roles).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setChecked({ key: checkKey, data: null, error: res.error });
        if (res.status) setStatus(res.status);
        return;
      }
      setChecked({ key: checkKey, data: res });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, ids, roles, result, checkKey]);
  const fresh = checked?.key === checkKey ? checked : null;
  const checking = ready && !result && !fresh;
  const check = fresh?.data ?? null;

  useEffect(() => {
    if (!status?.ready) return;
    let cancelled = false;
    createClient()
      .from("olb_email_templates")
      .select(EMAIL_TEMPLATE_COLUMNS)
      .then(({ data }) => {
        if (!cancelled) setTemplates(sortTemplates((data as EmailTemplate[] | null) ?? []));
      });
    return () => {
      cancelled = true;
    };
  }, [status?.ready]);

  function connect() {
    setNote(null);
    setError(null);
    const popup = window.open(CONNECT_URL, "slack-connect", "width=620,height=760");
    // Pop-ups blocked: go there in this tab, and come back to this page.
    if (!popup) window.location.assign(`/api/slack/connect?next=${encodeURIComponent(window.location.pathname)}`);
  }

  async function disconnect() {
    if (!confirm("Disconnect your Slack? You can connect it again any time.")) return;
    const res = await disconnectSlack();
    if (res.error) return setError(res.error);
    loadStatus();
  }

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return setTemplateId("");
    if (body !== placed && body.trim() && !confirm(`Replace what you've written with the "${t.name}" template?`)) return;
    setBody(t.body);
    setPlaced(t.body);
    setTemplateId(id);
  }

  const toggle = (r: Recipient) => setRoles((list) => (list.includes(r) ? list.filter((x) => x !== r) : ALL_RECIPIENTS.filter((x) => x === r || list.includes(x))));
  const reach = check?.people.filter((p) => p.slack && !p.self) ?? [];
  const away = check?.people.filter((p) => !p.slack) ?? [];
  const sample = reach[0] ?? null;

  async function send() {
    if (!check) return;
    const emails = reach.map((p) => p.email);
    setError(null);
    setSending({ done: 0, of: emails.length });
    const sent: string[] = [];
    const missed: { email: string; reason: string }[] = [];
    for (let i = 0; i < emails.length; i += STEP) {
      const res = await sendSlackDms(ids, roles, body, emails.slice(i, i + STEP));
      sent.push(...res.sent);
      missed.push(...res.missed);
      if (res.error) {
        missed.push(...emails.slice(i + STEP).map((email) => ({ email, reason: "not sent" })));
        setError(res.error);
        if (res.status) setStatus(res.status);
        break;
      }
      setSending({ done: Math.min(i + STEP, emails.length), of: emails.length });
    }
    setSending(null);
    setResult({ sent, missed });
    router.refresh();
  }

  const nameOf = (email: string) => check?.people.find((p) => p.email === email)?.name ?? email;

  return (
    <Sheet eyebrow={eyebrow} title={targets.length === 1 ? "Slack the family" : "Slack families"} busy={busy} onClose={onClose}>
      {result ? (
        <>
          <div role="status" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
            Sent {result.sent.length} {result.sent.length === 1 ? "DM" : "DMs"} from your Slack. Replies come to you there.
          </div>
          {result.missed.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={capStyle}>Didn&apos;t go</span>
              {result.missed.map((m) => (
                <span key={m.email} style={{ ...muted, overflowWrap: "anywhere" }}>
                  <strong>{nameOf(m.email)}</strong> · {m.email} · {m.reason}
                </span>
              ))}
            </div>
          )}
          <PeopleOffSlack people={away} />
          {error && <ErrorNote text={error} />}
          <Pill variant="accent" onClick={onClose}>
            Done
          </Pill>
        </>
      ) : !status ? (
        error ? <ErrorNote text={error} /> : <span style={muted}>Checking your Slack connection…</span>
      ) : !status.ready ? (
        <ConnectStep status={status} note={note} error={error} onConnect={connect} onClose={onClose} />
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.55 }}>
            Each person gets their own direct message, from you{status.name ? ` (${status.name})` : ""} in Slack. Replies come to you there. A copy is kept on each player&apos;s page.{" "}
            <button type="button" onClick={disconnect} disabled={busy} style={linkButton}>
              Disconnect Slack
            </button>
          </div>

          <div data-tour="slack-recipients" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={capStyle}>Send to</span>
            {offered.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>No email on file for {targets.length === 1 ? "this family" : "these families"}, so there&apos;s nobody to find in Slack.</span>
            ) : (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {offered.map((r) => (
                  <label key={r} style={checkLabel}>
                    <input type="checkbox" checked={roles.includes(r)} disabled={busy} onChange={() => toggle(r)} />
                    {targets.length === 1 ? ROLE_WORD[r] : ROLE_MANY[r]}
                  </label>
                ))}
              </div>
            )}
            {checking ? (
              <span style={muted}>Looking them up in Slack…</span>
            ) : check ? (
              <Recipients check={check} />
            ) : null}
          </div>

          {templates.length > 0 && (
            <Select label="Template" value={templateId} onChange={(e) => pickTemplate(e.target.value)} help="Fills in the message from an email template. Change anything before you send.">
              <option value="">Pick a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          <Textarea
            label="Message"
            help="{name} becomes each person's first name, and {player} their players' names."
            value={body}
            rows={9}
            maxLength={DM_MAX}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
          {sample && /\{(name|player)\}/i.test(body) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={capStyle}>How it reads for {sample.name}</span>
              <div style={{ ...muted, whiteSpace: "pre-wrap", lineHeight: 1.55, padding: "10px 12px", borderRadius: 10, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
                {fillDm(body, { name: sample.name, players: sample.players.map((first_name) => ({ first_name })) })}
              </div>
            </div>
          )}
          {note && <ErrorNote text={note} />}
          {fresh?.error && <ErrorNote text={fresh.error} />}
          {error && <ErrorNote text={error} />}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
            <Pill variant="accent" onClick={send} disabled={busy || checking || reach.length === 0 || !body.trim()}>
              <SlackLogo size={13} />{" "}
              {sending ? `Sending… ${sending.done} of ${sending.of}` : reach.length === 1 ? "Send 1 DM" : `Send ${reach.length} DMs`}
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

function ConnectStep({
  status,
  note,
  error,
  onConnect,
  onClose,
}: {
  status: Extract<SlackDmStatus, { ready: false }>;
  note: string | null;
  error: string | null;
  onConnect: () => void;
  onClose: () => void;
}) {
  const canConnect = status.reason === "not-connected" || status.reason === "reconnect";
  return (
    <>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--gw-fg)", lineHeight: 1.6 }}>
        {status.reason === "not-set-up" ? (
          <>Slack DMs aren&apos;t set up on this site yet. A super-admin turns them on (see the User Guide&apos;s Slack DMs section).</>
        ) : status.reason === "preview" ? null : (
          <>
            Slack DMs come from <strong>your own</strong> Slack account, so families see them from you and their replies come straight back to you. Connect your
            Slack once and the portal can send them for you. You can disconnect any time.
          </>
        )}
      </div>
      {note && <ErrorNote text={note} />}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        {canConnect && (
          <span data-tour="slack-connect" style={{ display: "inline-flex" }}>
            <Pill variant="accent" onClick={onConnect}>
              <SlackLogo size={14} /> {status.reason === "reconnect" ? "Connect Slack again" : "Connect Slack"}
            </Pill>
          </span>
        )}
        <Pill variant="ghost" onClick={onClose}>
          Cancel
        </Pill>
      </div>
    </>
  );
}

// Each person, and whether they're on Slack.
function Recipients({ check }: { check: { people: SlackCheck[]; noContact: string[] } }) {
  const on = check.people.filter((p) => p.slack && !p.self).length;
  const list = (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      {check.people.map((p) => (
        <span key={p.email} style={{ fontSize: 12.5, color: p.slack && !p.self ? "var(--gw-fg)" : "var(--gw-fg-muted)", overflowWrap: "anywhere" }}>
          {p.slack && !p.self ? "✓" : "✗"} <strong>{p.name}</strong> · {roleWords(p.roles)} of {p.players.join(" & ")} ·{" "}
          {p.self ? "that's you" : p.slack ? `on Slack as ${p.slack}` : `not on Slack (${p.email})`}
        </span>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ ...muted, fontWeight: 600, color: on ? "var(--gw-fg)" : "var(--gw-error)" }}>
        {check.people.length === 0
          ? "Nobody picked has an email on file."
          : `${on} of ${check.people.length} ${check.people.length === 1 ? "person is" : "people are"} on Slack and will get a DM.`}
      </span>
      {check.people.length > 8 ? (
        <details>
          <summary style={{ ...muted, fontWeight: 600, cursor: "pointer" }}>See who</summary>
          {list}
        </details>
      ) : (
        list
      )}
      {check.noContact.length > 0 && (
        <span style={{ fontSize: 12.5, color: "var(--gw-error)", fontWeight: 600 }}>
          No email for the people picked for {check.noContact.join(", ")}, so they can&apos;t be found in Slack.
        </span>
      )}
    </div>
  );
}

// Who's not on Slack, with their emails, to reach another way.
function PeopleOffSlack({ people }: { people: SlackCheck[] }) {
  if (people.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={capStyle}>Not on Slack</span>
      <span style={muted}>No Slack account in the club&apos;s workspace uses these emails, so reach them another way, like email.</span>
      {people.map((p) => (
        <span key={p.email} style={{ ...muted, overflowWrap: "anywhere" }}>
          <strong>{p.name}</strong> · {p.email}
        </span>
      ))}
    </div>
  );
}

const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--rsd-accent)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "underline",
};
