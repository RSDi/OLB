"use client";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "../../components/icons";

type RecordingStatus = "Transcribed" | "Processing" | "Action items extracted";
type Source = "Watch" | "Phone";

interface ActionItem {
  id: string;
  text: string;
  routedTo?: string;
  done?: boolean;
}

interface Recording {
  id: string;
  title: string;
  // ISO timestamp.
  capturedAt: string;
  durationSec: number;
  source: Source;
  status: RecordingStatus;
  transcript: string;
  actionItems: ActionItem[];
}

const INTEGRATIONS = [
  { id: "email", label: "Email follow-up", icon: "Mail" as const },
  { id: "hubspot", label: "HubSpot Task", icon: "Briefcase" as const },
  { id: "reminders", label: "Apple Reminders", icon: "CheckCircle" as const },
  { id: "notion", label: "Notion Page", icon: "FileText" as const },
  { id: "slack", label: "Slack #leadership", icon: "Bell" as const },
];

const MOCK_RECORDINGS: Recording[] = [
  {
    id: "rec-1",
    title: "Coffee with Dave — the Apple Watch idea",
    capturedAt: "2026-05-28T13:42:00",
    durationSec: 287,
    source: "Watch",
    status: "Action items extracted",
    transcript:
      "Jeff: I'm going to give Dave 50% of everything we make on this. We're going to make an Apple Watch app that works with the iPhone. You just start a recording easily and it takes that recording and automatically does the workflow — uploads it on the backend, transcribes it, then emails you the transcription with a link back to a web interface where you can manipulate the data.\n\nDave: Over time it could pull the action items out of that. Because it's on your watch and your phone, it could become a to-do tracker as well.\n\nDave: The thing for me — to the extent that it automates the first step. Picture you're in a meeting and you say, 'Hey, mind if I record this?' and you just hit it. It's not a ten-second fumble of you on your phone. There's a social benefit there. And then the minute it's done, even just an email follow-up would be hugely valuable. Someone more sophisticated would want other integrations — distill my to-do list into a HubSpot task, whatever.\n\nJeff: We might not even want to build this. But we're collecting ideas.",
    actionItems: [
      { id: "a1", text: "Sketch the watch-app one-tap flow", routedTo: "Notion Page" },
      { id: "a1b", text: "Check if Evernote / Otter already nails this", done: true },
      { id: "a1c", text: "Talk to Dave about 50/50 partnership terms", routedTo: "HubSpot Task" },
    ],
  },
  {
    id: "rec-2",
    title: "Sermon prep — 1 Corinthians 13",
    capturedAt: "2026-05-28T08:15:00",
    durationSec: 612,
    source: "Phone",
    status: "Action items extracted",
    transcript:
      "Working through love is patient, love is kind. I want to land on the idea that patience isn't passive — it's an active choice to keep the door open. Hook for the opener: that moment in traffic where you're inches from honking. Pull the Greek for 'makrothumia' — long-suffering...",
    actionItems: [
      { id: "a2", text: "Pull Greek for 'makrothumia' and 'chrēstos'", routedTo: "Notion Page" },
      { id: "a2b", text: "Write the traffic-jam cold open" },
      { id: "a2c", text: "Ask Worship to look at 'The Love Of God' as closer", routedTo: "Slack #leadership" },
    ],
  },
  {
    id: "rec-3",
    title: "Board call — Q3 budget check-in",
    capturedAt: "2026-05-27T19:00:00",
    durationSec: 2734,
    source: "Phone",
    status: "Action items extracted",
    transcript:
      "Reviewed YTD giving vs. forecast. Roof reserve is short by about 14k against the September repair window. Mike to circle with the facilities committee. Karen flagged the volunteer-background-check renewal cycle — we have 12 expiring before camp...",
    actionItems: [
      { id: "a3", text: "Pull 12 expiring background checks list", routedTo: "HubSpot Task" },
      { id: "a3b", text: "Mike: circle with facilities re: roof reserve gap", routedTo: "Email follow-up" },
      { id: "a3c", text: "Approve summer camp budget line in next meeting" },
    ],
  },
  {
    id: "rec-4",
    title: "Voice memo — snow camp logistics",
    capturedAt: "2026-05-27T14:22:00",
    durationSec: 96,
    source: "Watch",
    status: "Transcribed",
    transcript:
      "Don't forget: bus deposit is due by the 15th, two chaperones still need medical forms, and the venue wants a final headcount three weeks out.",
    actionItems: [
      { id: "a4", text: "Pay bus deposit by 6/15" },
      { id: "a4b", text: "Chase Hannah + Tyler for medical forms" },
    ],
  },
  {
    id: "rec-5",
    title: "1:1 with Sarah — volunteer pipeline",
    capturedAt: "2026-05-26T10:30:00",
    durationSec: 1480,
    source: "Phone",
    status: "Action items extracted",
    transcript:
      "Sarah feels overloaded on the hospitality team. Suggested we bring on a second team lead for Sunday mornings. She named two people she'd want to ask: Marco and Becca. Both have been around two years plus.",
    actionItems: [
      { id: "a5", text: "Introduce Sarah to Marco for hospitality lead conversation", routedTo: "Email follow-up" },
      { id: "a5b", text: "Background check Becca if she says yes" },
    ],
  },
  {
    id: "rec-6",
    title: "Hallway sync — worship setlist",
    capturedAt: "2026-05-25T11:05:00",
    durationSec: 184,
    source: "Watch",
    status: "Processing",
    transcript: "",
    actionItems: [],
  },
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusChipClass(s: RecordingStatus): string {
  if (s === "Action items extracted") return "rsd-chip-warn";
  if (s === "Transcribed") return "rsd-chip-accent";
  return "rsd-chip-mute";
}

export function DavesIdea() {
  const [recordings, setRecordings] = useState<Recording[]>(MOCK_RECORDINGS);
  const [selectedId, setSelectedId] = useState<string>(MOCK_RECORDINGS[0].id);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const selected = recordings.find(r => r.id === selectedId) ?? recordings[0];

  // Aggregate every action item across all recordings (skip ones marked done).
  const inbox = useMemo(() => {
    return recordings.flatMap(r =>
      r.actionItems
        .filter(a => !a.done)
        .map(a => ({ ...a, recordingId: r.id, recordingTitle: r.title }))
    );
  }, [recordings]);

  // Drive the fake recording timer while the mic modal is open.
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  function startFakeRecording() {
    setIsRecording(true);
    setElapsed(0);
  }

  function stopFakeRecording() {
    if (elapsed < 1) {
      setIsRecording(false);
      return;
    }
    const id = `rec-${Date.now()}`;
    const newRec: Recording = {
      id,
      title: "New recording — uploading…",
      capturedAt: new Date().toISOString(),
      durationSec: elapsed,
      source: "Watch",
      status: "Processing",
      transcript: "",
      actionItems: [],
    };
    setRecordings(r => [newRec, ...r]);
    setSelectedId(id);
    setIsRecording(false);

    // Simulate the backend transcription + extraction pipeline.
    setTimeout(() => {
      setRecordings(rs =>
        rs.map(r =>
          r.id === id
            ? {
                ...r,
                title: "New recording — captured from Watch",
                status: "Action items extracted",
                transcript:
                  "(Mock transcript) This is what your transcribed recording would look like a few seconds after you tap Stop on the watch. The backend would have pulled the audio over, transcribed it, and pulled candidate action items into the inbox below.",
                actionItems: [
                  { id: `${id}-a1`, text: "Example extracted action item one" },
                  { id: `${id}-a2`, text: "Example extracted action item two" },
                ],
              }
            : r
        )
      );
    }, 2200);
  }

  function toggleDone(recId: string, actionId: string) {
    setRecordings(rs =>
      rs.map(r =>
        r.id === recId
          ? { ...r, actionItems: r.actionItems.map(a => (a.id === actionId ? { ...a, done: !a.done } : a)) }
          : r
      )
    );
  }

  function routeAction(recId: string, actionId: string, target: string) {
    setRecordings(rs =>
      rs.map(r =>
        r.id === recId
          ? { ...r, actionItems: r.actionItems.map(a => (a.id === actionId ? { ...a, routedTo: target } : a)) }
          : r
      )
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pitch + watch concept */}
      <section
        className="rsd-card"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 24,
          alignItems: "center",
          background: "linear-gradient(135deg, var(--gw-rose-bg) 0%, var(--gw-bg-elev) 100%)",
          border: "1px solid var(--gw-border)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="rsd-chip rsd-chip-warn" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icons.Sparkles width={11} height={11} />
              Concept
            </span>
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              Captured 2026-05-28
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.25 }}>
            One-tap capture from your wrist. Transcript &amp; action items waiting in your inbox.
          </h1>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 640 }}>
            Apple Watch + iPhone app. Tap once to start recording mid-conversation — no fumbling for your phone.
            Backend transcribes the audio, emails you a link, and extracts candidate action items into a unified
            inbox. From there, route each item to wherever your workflow already lives: HubSpot, Reminders,
            Notion, Slack, or a follow-up email.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button
              onClick={startFakeRecording}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 100,
                background: "var(--rsd-accent)",
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Icons.Mic width={14} height={14} />
              Start recording (demo)
            </button>
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, alignSelf: "center" }}>
              Mock-only · no audio is captured
            </span>
          </div>
        </div>
        <WatchMockup />
      </section>

      {/* Two-column: recordings list + selected detail */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 360px) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Recordings list */}
        <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--gw-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>
              Recordings
            </div>
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              {recordings.length} captured
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recordings.map(r => {
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="gw-press"
                  style={{
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "12px 18px",
                    background: active ? "var(--gw-bg-elev)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--gw-border)",
                    borderLeft: `3px solid ${active ? "var(--rsd-accent)" : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--gw-fg)",
                        lineHeight: 1.35,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.title}
                    </div>
                    <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>
                      {r.source === "Watch" ? <Icons.Watch width={12} height={12} /> : <Icons.Phone width={12} height={12} />}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                      {formatWhen(r.capturedAt)} · {formatDuration(r.durationSec)}
                    </span>
                    <span className={`rsd-chip ${statusChipClass(r.status)}`} style={{ fontSize: 10 }}>
                      {r.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected detail */}
        <div className="rsd-card" style={{ gap: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className={`rsd-chip ${statusChipClass(selected.status)}`}>{selected.status}</span>
                <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                  {selected.source === "Watch" ? "Apple Watch" : "iPhone"} · {formatDuration(selected.durationSec)}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                {selected.title}
              </h2>
              <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
                {formatWhen(selected.capturedAt)}
              </div>
            </div>
            <button
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Icons.Mail width={12} height={12} />
              Resend email
            </button>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>
              Transcript
            </div>
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: "var(--gw-bg-elev)",
                border: "1px solid var(--gw-border)",
                fontSize: 13,
                lineHeight: 1.65,
                color: "var(--gw-fg)",
                whiteSpace: "pre-wrap",
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {selected.transcript || (
                <span style={{ color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                  Transcription in progress…
                </span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>
              Extracted action items
            </div>
            {selected.actionItems.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: "1px dashed var(--gw-border)",
                  fontSize: 12,
                  color: "var(--gw-fg-muted)",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                None extracted yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selected.actionItems.map(a => (
                  <ActionRow
                    key={a.id}
                    action={a}
                    onToggle={() => toggleDone(selected.id, a.id)}
                    onRoute={target => routeAction(selected.id, a.id, target)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Aggregated inbox */}
      <section className="rsd-card" style={{ gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>
              Today&rsquo;s action inbox
            </h2>
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
              Pulled across every recording. Route, check off, or ignore.
            </div>
          </div>
          <span className="rsd-chip rsd-chip-accent">{inbox.length} open</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {inbox.map(a => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
              }}
            >
              <button
                onClick={() => toggleDone(a.recordingId, a.id)}
                aria-label="Mark done"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  border: "1.5px solid var(--gw-border)",
                  background: "var(--gw-bg-elev)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--gw-fg)", fontWeight: 600, lineHeight: 1.35 }}>
                  {a.text}
                </div>
                <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
                  from{" "}
                  <button
                    onClick={() => setSelectedId(a.recordingId)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--rsd-accent)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    {a.recordingTitle}
                  </button>
                </div>
              </div>
              {a.routedTo ? (
                <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>
                  → {a.routedTo}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--gw-fg-faint)", fontWeight: 600 }}>
                  not routed
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Integrations strip */}
      <section className="rsd-card" style={{ gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>
            Connected destinations
          </h2>
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
            Where action items can be sent. Each is a one-click route from any extracted item.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {INTEGRATIONS.map(i => {
            const Icon = Icons[i.icon];
            return (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--gw-border)",
                  background: "var(--gw-bg)",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--gw-bg-elev)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--rsd-accent)",
                    flexShrink: 0,
                  }}
                >
                  <Icon width={16} height={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{i.label}</div>
                  <div style={{ fontSize: 10, color: "var(--gw-success)", fontWeight: 700 }}>Connected</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isRecording && (
        <RecordingModal elapsed={elapsed} onStop={stopFakeRecording} />
      )}
    </div>
  );
}

function ActionRow({
  action,
  onToggle,
  onRoute,
}: {
  action: ActionItem;
  onToggle: () => void;
  onRoute: (target: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--gw-border)",
        background: action.done ? "var(--gw-bg-elev)" : "var(--gw-bg)",
        opacity: action.done ? 0.55 : 1,
        position: "relative",
      }}
    >
      <button
        onClick={onToggle}
        aria-label="Mark done"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: "1.5px solid var(--gw-border)",
          background: action.done ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
          cursor: "pointer",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        {action.done && <Icons.CheckCircle width={12} height={12} />}
      </button>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          color: "var(--gw-fg)",
          fontWeight: 600,
          textDecoration: action.done ? "line-through" : "none",
        }}
      >
        {action.text}
      </div>
      {action.routedTo && (
        <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>
          → {action.routedTo}
        </span>
      )}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(o => !o)}
          className="gw-press"
          style={{
            padding: "5px 10px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Send to <Icons.ChevronDown width={10} height={10} />
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              minWidth: 180,
              background: "var(--gw-bg)",
              border: "1px solid var(--gw-border)",
              borderRadius: 10,
              boxShadow: "var(--gw-shadow-3)",
              zIndex: 10,
              overflow: "hidden",
            }}
          >
            {INTEGRATIONS.map(i => (
              <button
                key={i.id}
                onClick={() => {
                  onRoute(i.label);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--gw-fg)",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--gw-bg-elev)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {i.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WatchMockup() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: 140,
        height: 180,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Strap top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          width: 60,
          height: 28,
          background: "linear-gradient(180deg, #3a3a3a 0%, #1a1a1a 100%)",
          borderRadius: "10px 10px 4px 4px",
        }}
      />
      {/* Strap bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: 60,
          height: 28,
          background: "linear-gradient(0deg, #3a3a3a 0%, #1a1a1a 100%)",
          borderRadius: "4px 4px 10px 10px",
        }}
      />
      {/* Crown */}
      <div
        style={{
          position: "absolute",
          right: 6,
          top: "47%",
          width: 8,
          height: 14,
          background: "#666",
          borderRadius: 2,
        }}
      />
      {/* Watch case */}
      <div
        style={{
          width: 110,
          height: 130,
          background: "#000",
          border: "2px solid #2a2a2a",
          borderRadius: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 6,
          boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--rsd-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            boxShadow: "0 0 0 6px rgba(108,140,89,0.18), 0 0 0 14px rgba(108,140,89,0.08)",
          }}
        >
          <Icons.Mic width={26} height={26} />
        </div>
        <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, letterSpacing: ".04em" }}>
          TAP TO RECORD
        </div>
      </div>
    </div>
  );
}

function RecordingModal({ elapsed, onStop }: { elapsed: number; onStop: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--gw-overlay-dark-30)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "var(--gw-bg)",
          border: "1px solid var(--gw-border)",
          borderRadius: 16,
          padding: 32,
          minWidth: 320,
          textAlign: "center",
          boxShadow: "var(--gw-shadow-3)",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: "var(--gw-error)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow:
              "0 0 0 0 rgba(229,62,62,0.5)",
            animation: "rec-pulse 1.4s ease-out infinite",
          }}
        >
          <Icons.Mic width={36} height={36} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          Recording
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "var(--gw-fg)", margin: "4px 0 18px", fontVariantNumeric: "tabular-nums" }}>
          {formatDuration(elapsed)}
        </div>
        <button
          onClick={onStop}
          className="gw-press"
          style={{
            padding: "10px 22px",
            borderRadius: 100,
            background: "var(--gw-fg)",
            color: "var(--gw-bg)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Stop &amp; transcribe
        </button>
      </div>
      <style>{`
        @keyframes rec-pulse {
          0% { box-shadow: 0 0 0 0 rgba(229,62,62,0.5); }
          70% { box-shadow: 0 0 0 22px rgba(229,62,62,0); }
          100% { box-shadow: 0 0 0 0 rgba(229,62,62,0); }
        }
      `}</style>
    </div>
  );
}
