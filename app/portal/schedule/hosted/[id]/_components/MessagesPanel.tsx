"use client";
// The Email tab: one email to every program coming, like the spreadsheet's
// "Program Communication" tab. "Fill in from the plan" writes it from what's
// here (who's coming, the divisions, the facility, concessions, admission,
// the rules and the court schedule); edit it, pick the programs, and send.
// Each program gets its own copy, to the emails External Contacts has for it,
// so no one sees the others' addresses. What was sent stays listed below.

import { useState } from "react";
import { Input, Pill, Textarea } from "../../../../../components/ui";
import { sendProgramEmail } from "../../../../../../lib/hosted/actions";
import { programMessage } from "../../../../../../lib/hosted/logic";
import { formatWeekendDates } from "../../../../../../lib/hs-schedule/logic";
import type { HostedPageData } from "../../../../../../lib/hosted/types";
import { Empty, Said, Section, cap, sub, useAct } from "./parts";

const STATUS: Record<string, string> = { confirmed: "Coming", tentative: "On the fence", declined: "Not coming" };

export function MessagesPanel({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const { weekend, programs } = data;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(programs.filter((p) => p.status === "confirmed" && p.emails.length).map((p) => p.key)));
  const [extra, setExtra] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  function fill() {
    if (body.trim() && !confirm("Replace what you've written with a fresh draft from the plan?")) return;
    const m = programMessage({
      title: weekend.event || "our tournament",
      dates: formatWeekendDates(weekend.starts_on, weekend.ends_on),
      facilityName: data.facilityName,
      plan: data.plan,
      divisions: data.divisions,
      teams: data.teams,
      games: data.games,
      programs,
    });
    setSubject(m.subject);
    setBody(m.body);
  }

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };
  const extras = extra.split(/[\s,;]+/).filter(Boolean).length;
  const count = programs.filter((p) => picked.has(p.key) && p.emails.length).length + extras;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section
        title="Email the programs"
        tour="hosted-email"
        subtitle="Each program gets its own copy, to the emails External Contacts has for it. Replies come to the club's email."
        action={
          <Pill size="sm" variant="ghost" onClick={fill}>
            Fill in from the plan
          </Pill>
        }
      >
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${weekend.event}: schedule and details`} />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={16} placeholder="Press Fill in from the plan for a draft with the facility, divisions, rules and court schedule." />

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={cap}>Send to</span>
          {programs.length === 0 && <Empty>No programs on this weekend on the HS Schedule yet.</Empty>}
          {programs.map((p) => (
            <label key={p.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", opacity: p.emails.length ? 1 : 0.6 }}>
              <input
                type="checkbox"
                checked={picked.has(p.key) && p.emails.length > 0}
                disabled={!p.emails.length}
                onChange={() => toggle(p.key)}
                style={{ width: 17, height: 17, accentColor: "var(--rsd-accent-fill)" }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</span>{" "}
                <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                  {STATUS[p.status]} · {p.emails.length ? p.emails.join(", ") : "no email in External Contacts"}
                </span>
              </span>
            </label>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button type="button" style={mini} onClick={() => setPicked(new Set(programs.filter((p) => p.status === "confirmed" && p.emails.length).map((p) => p.key)))}>
              Everyone coming
            </button>
            <button type="button" style={mini} onClick={() => setPicked(new Set(programs.filter((p) => p.status !== "declined" && p.emails.length).map((p) => p.key)))}>
              Coming and on the fence
            </button>
            <button type="button" style={mini} onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
        </div>
        <Input label="Also send to" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ref-assigner@example.com, coach@example.com" help="Emails separated by commas, each sent on its own." />
        <Said error={error} notice={notice} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Pill
            variant="accent"
            disabled={busy || !subject.trim() || !body.trim() || count === 0}
            onClick={async () => {
              if (!confirm(`Send "${subject}" to ${count} ${count === 1 ? "program" : "programs and people"}?`)) return;
              await act(() => sendProgramEmail(weekend.id, { subject, body, programs: [...picked], extra }));
            }}
          >
            {busy ? "Sending…" : `Send to ${count}`}
          </Pill>
          <span style={sub}>Add a program&apos;s email in External Contacts if it&apos;s missing.</span>
        </div>
      </Section>

      <Section title="Sent" subtitle={data.messages.length ? undefined : "Nothing sent from here yet."}>
        {data.messages.map((m) => (
          <div key={m.id} style={{ borderTop: "1px solid var(--gw-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <button type="button" onClick={() => setShown(shown === m.id ? null : m.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{m.subject}</span>{" "}
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                {new Date(m.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {m.sent_count}{" "}
                {m.sent_count === 1 ? "email" : "emails"}
              </span>
            </button>
            {shown === m.id && (
              <>
                <span style={sub}>To {m.sent_to.join(", ")}</span>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{m.body}</pre>
                <div>
                  <Pill
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSubject(m.subject);
                      setBody(m.body);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Use again
                  </Pill>
                </div>
              </>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}

const mini: React.CSSProperties = { background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "underline", cursor: "pointer" };
