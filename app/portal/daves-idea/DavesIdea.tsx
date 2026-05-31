"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/client";
import { softDeleteDavesIdeaRecording } from "../../../lib/daves-idea/actions";
import type {
  AssignableMember,
  DavesIdeaActionItem,
  DavesIdeaRecording,
  RecordingStatus,
} from "../../../lib/daves-idea/data";

const INTEGRATIONS = [
  { id: "things", label: "Things", icon: "CheckCircle" as const },
  { id: "email", label: "Email follow-up", icon: "Mail" as const },
  { id: "hubspot", label: "HubSpot Task", icon: "Briefcase" as const },
  { id: "reminders", label: "Apple Reminders", icon: "Clock" as const },
  { id: "notion", label: "Notion Page", icon: "FileText" as const },
  { id: "slack", label: "Slack #leadership", icon: "Bell" as const },
];

// One-tap export to Things (culturedcode.com) via its URL scheme:
// https://culturedcode.com/things/support/articles/2803573/
//
// The `add` command takes no auth token. We set the action text as the to-do
// title and put a source line + a link back to this portal in the notes. No
// `when` is sent, so the to-do lands in the Things Inbox to triage — the
// GTD-friendly default. Only does anything on an Apple device with Things
// installed; elsewhere the scheme is a silent no-op. We still set routed_to
// either way so the inbox reflects the intent.
//
// Per the spec, values are percent-encoded (spaces → %20). We build the query
// by hand rather than via URLSearchParams, which emits `+` for spaces — the
// scheme parser expects %20, not `+`.
interface ThingsAssignment {
  owner?: string | null;
  supporters?: string[];
}

function thingsNotes(recordingTitle: string | null, assignment?: ThingsAssignment): string {
  const lines: string[] = [
    recordingTitle ? `From "${recordingTitle}" · captured in Dave's Idea` : "Captured in Dave's Idea",
  ];
  if (assignment?.owner) lines.push(`Owner: ${assignment.owner}`);
  if (assignment?.supporters && assignment.supporters.length > 0) {
    lines.push(`Support: ${assignment.supporters.join(", ")}`);
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin) lines.push(`${origin}/portal/daves-idea`);
  return lines.join("\n");
}

// Single to-do. Carries the owner/supporters into the notes so responsibility
// travels into Things.
function openInThings(title: string, recordingTitle: string | null, assignment?: ThingsAssignment) {
  const url =
    "things:///add?title=" +
    encodeURIComponent(title) +
    "&notes=" +
    encodeURIComponent(thingsNotes(recordingTitle, assignment));
  window.location.href = url;
}

// Multiple to-dos in one handoff via the `titles` parameter — newline-separated,
// each newline encoded as %0a. All share the same notes (one source recording).
// No auth token needed for adds.
function openAllInThings(titles: string[], recordingTitle: string | null) {
  if (titles.length === 0) return;
  const titlesParam = titles.map(encodeURIComponent).join("%0a");
  const url =
    "things:///add?titles=" +
    titlesParam +
    "&notes=" +
    encodeURIComponent(thingsNotes(recordingTitle));
  window.location.href = url;
}

function findMember(members: AssignableMember[], id: string | null): AssignableMember | undefined {
  return id ? members.find(m => m.id === id) : undefined;
}

// Display name for a chip. Prefer full name ("David Orrick"); fall back to
// nickname, then a generic label for a stale/unknown id.
function memberLabel(m: AssignableMember | undefined): string {
  if (!m) return "Unknown member";
  return m.full_name || m.nickname || "Member";
}

const STATUS_LABEL: Record<RecordingStatus, string> = {
  uploading: "Uploading…",
  transcribing: "Transcribing…",
  extracting: "Extracting…",
  ready: "Ready",
  failed: "Failed",
};

function statusChipClass(s: RecordingStatus): string {
  if (s === "ready") return "rsd-chip-warn";
  if (s === "failed") return "rsd-chip-error";
  return "rsd-chip-mute";
}

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

function recordingTitle(r: DavesIdeaRecording): string {
  if (r.title) return r.title;
  if (r.status === "failed") return "Failed recording";
  if (r.status === "ready") return "Untitled recording";
  return "New recording — processing…";
}

// Build a download URL that forces save-as with a human-friendly filename.
// Vercel Blob honors a `download=<filename>` query parameter by setting
// Content-Disposition: attachment server-side. The audio's actual format
// (m4a from Safari, webm from Chrome) comes from the stored blob's pathname.
function audioDownloadHref(r: DavesIdeaRecording): string {
  let blobUrl: URL;
  try {
    blobUrl = new URL(r.audio_blob_url);
  } catch {
    return r.audio_blob_url;
  }
  const ext = blobUrl.pathname.split(".").pop() || "audio";
  // Slugify the title for the filename. Falls back to ISO date.
  const slugSource = r.title || new Date(r.created_at).toISOString().replace(/[:.]/g, "-");
  const slug = slugSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "recording";
  blobUrl.searchParams.set("download", `daves-idea-${slug}.${ext}`);
  return blobUrl.toString();
}

export function DavesIdea({
  initialRecordings,
  members,
}: {
  initialRecordings: DavesIdeaRecording[];
  members: AssignableMember[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recordings, setRecordings] = useState<DavesIdeaRecording[]>(initialRecordings);
  const [selectedId, setSelectedId] = useState<string | null>(initialRecordings[0]?.id ?? null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);

  // Mirror PortalSidebar's mobile breakpoint so the page's layout cuts over
  // at the same width the chrome does.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const selected = recordings.find(r => r.id === selectedId) ?? recordings[0] ?? null;

  const inbox = useMemo(() => {
    return recordings.flatMap(r =>
      r.action_items
        .filter(a => !a.done)
        .map(a => ({ ...a, recordingTitle: recordingTitle(r) }))
    );
  }, [recordings]);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  useEffect(() => {
    const inFlight = recordings.some(r => r.status !== "ready" && r.status !== "failed");
    if (!inFlight) return;
    const t = setInterval(async () => {
      const { data, error } = await supabase
        .from("daves_idea_recordings")
        .select(
          `id, user_id, title, audio_blob_url, duration_sec, source, status,
           assemblyai_id, transcript, utterances, error, created_at, updated_at,
           action_items:daves_idea_action_items(
             id, recording_id, text, routed_to, done, sort_order,
             owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
             created_at, updated_at
           )`
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error || !data) return;
      const fresh = (data as unknown as DavesIdeaRecording[]).map(r => ({
        ...r,
        action_items: (r.action_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
      }));
      setRecordings(fresh);
    }, 3000);
    return () => clearInterval(t);
  }, [recordings, supabase]);

  async function startRecording() {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        void uploadRecording(blob, mimeType, elapsedRef.current);
      };
      elapsedRef.current = 0;
      setElapsed(0);
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err) {
      setRecordError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access denied. Allow mic permission in your browser settings."
          : "Couldn't access the microphone."
      );
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) {
      setIsRecording(false);
      return;
    }
    if (mr.state !== "inactive") mr.stop();
    setIsRecording(false);
  }

  async function uploadRecording(blob: Blob, mimeType: string, durationSec: number) {
    setUploading(true);
    setRecordError(null);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `recording.${ext}`);
      form.append("duration_sec", String(durationSec));
      form.append("source", "pwa");
      form.append("mime_type", mimeType);
      const res = await fetch("/api/daves-idea/upload", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const { recording } = (await res.json()) as { recording: DavesIdeaRecording };
      setRecordings(rs => [{ ...recording, action_items: recording.action_items ?? [] }, ...rs]);
      setSelectedId(recording.id);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function toggleDone(recordingId: string, actionId: string) {
    const rec = recordings.find(r => r.id === recordingId);
    const action = rec?.action_items.find(a => a.id === actionId);
    if (!action) return;
    const next = !action.done;
    setRecordings(rs =>
      rs.map(r =>
        r.id === recordingId
          ? { ...r, action_items: r.action_items.map(a => (a.id === actionId ? { ...a, done: next } : a)) }
          : r
      )
    );
    await supabase.from("daves_idea_action_items").update({ done: next }).eq("id", actionId);
  }

  async function routeAction(recordingId: string, actionId: string, target: string) {
    setRecordings(rs =>
      rs.map(r =>
        r.id === recordingId
          ? { ...r, action_items: r.action_items.map(a => (a.id === actionId ? { ...a, routed_to: target } : a)) }
          : r
      )
    );
    await supabase.from("daves_idea_action_items").update({ routed_to: target }).eq("id", actionId);
  }

  async function editActionText(recordingId: string, actionId: string, text: string) {
    setRecordings(rs =>
      rs.map(r =>
        r.id === recordingId
          ? { ...r, action_items: r.action_items.map(a => (a.id === actionId ? { ...a, text } : a)) }
          : r
      )
    );
    // RLS lets owners update their own action items (same path toggle/route use).
    await supabase.from("daves_idea_action_items").update({ text }).eq("id", actionId);
  }

  async function editRecordingTitle(recordingId: string, title: string) {
    setRecordings(rs => rs.map(r => (r.id === recordingId ? { ...r, title } : r)));
    // RLS allows the owner to update their own recording.
    await supabase.from("daves_idea_recordings").update({ title }).eq("id", recordingId);
  }

  async function setActionOwner(recordingId: string, actionId: string, memberId: string | null) {
    setRecordings(rs =>
      rs.map(r =>
        r.id === recordingId
          ? { ...r, action_items: r.action_items.map(a => (a.id === actionId ? { ...a, owner_member_id: memberId } : a)) }
          : r
      )
    );
    await supabase.from("daves_idea_action_items").update({ owner_member_id: memberId }).eq("id", actionId);
  }

  async function toggleActionSupporter(recordingId: string, actionId: string, memberId: string) {
    const action = recordings.find(r => r.id === recordingId)?.action_items.find(a => a.id === actionId);
    if (!action) return;
    const current = action.supporter_member_ids ?? [];
    const next = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId];
    setRecordings(rs =>
      rs.map(r =>
        r.id === recordingId
          ? { ...r, action_items: r.action_items.map(a => (a.id === actionId ? { ...a, supporter_member_ids: next } : a)) }
          : r
      )
    );
    await supabase.from("daves_idea_action_items").update({ supporter_member_ids: next }).eq("id", actionId);
  }

  function acceptSuggestedOwner(recordingId: string, actionId: string) {
    const action = recordings.find(r => r.id === recordingId)?.action_items.find(a => a.id === actionId);
    if (action?.suggested_member_id) setActionOwner(recordingId, actionId, action.suggested_member_id);
  }

  async function deleteRecording(recordingId: string) {
    if (!confirm("Delete this recording? You can restore it from Settings → Deleted.")) return;
    // Optimistic remove. The server action below uses the admin client with
    // explicit ownership check so we bypass any RLS quirks the cookie-authed
    // client might trip over. If it errors, we roll the UI back.
    const previous = recordings;
    setRecordings(rs => rs.filter(r => r.id !== recordingId));
    if (selectedId === recordingId) {
      const remaining = previous.filter(r => r.id !== recordingId);
      setSelectedId(remaining[0]?.id ?? null);
    }
    const result = await softDeleteDavesIdeaRecording(recordingId);
    if (result.error) {
      setRecordings(previous);
      setSelectedId(recordingId);
      setRecordError(`Delete failed: ${result.error}`);
    }
  }

  async function reextractRecording(recordingId: string) {
    // Optimistic chip update so the user sees state change immediately.
    setRecordings(rs =>
      rs.map(r => (r.id === recordingId ? { ...r, status: "extracting", error: null } : r))
    );
    try {
      const res = await fetch(`/api/daves-idea/recordings/${recordingId}/reextract`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Re-extract failed (${res.status})`);
      }
      const { recording } = (await res.json()) as { recording: DavesIdeaRecording };
      setRecordings(rs =>
        rs.map(r =>
          r.id === recordingId
            ? {
                ...recording,
                action_items: (recording.action_items ?? [])
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order),
              }
            : r
        )
      );
    } catch (err) {
      setRecordings(rs =>
        rs.map(r =>
          r.id === recordingId
            ? { ...r, status: "ready", error: err instanceof Error ? err.message : "Re-extract failed" }
            : r
        )
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section
        className="rsd-card"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
          gap: isMobile ? 16 : 24,
          alignItems: "center",
          background: "linear-gradient(135deg, var(--gw-rose-bg) 0%, var(--gw-bg-elev) 100%)",
          border: "1px solid var(--gw-border)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="rsd-chip rsd-chip-warn" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icons.Sparkles width={11} height={11} />
              MVP
            </span>
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              Add to iPhone home screen for one-tap capture
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.25 }}>
            One-tap capture. Transcript &amp; action items waiting in your inbox.
          </h1>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 640 }}>
            Tap once to start recording mid-conversation. Audio uploads, AssemblyAI transcribes with speaker
            labels, Claude pulls candidate action items into the inbox below. From there, send each item to
            Things, or route it to Reminders, Notion, Slack, HubSpot, or a follow-up email.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button
              onClick={startRecording}
              className="gw-press"
              disabled={isRecording || uploading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: isMobile ? "14px 20px" : "10px 18px",
                borderRadius: 100,
                background: "var(--rsd-accent)",
                color: "#fff",
                border: "none",
                fontSize: isMobile ? 15 : 13,
                fontWeight: 700,
                cursor: isRecording || uploading ? "not-allowed" : "pointer",
                opacity: isRecording || uploading ? 0.6 : 1,
                width: isMobile ? "100%" : undefined,
                minHeight: isMobile ? 48 : undefined,
              }}
            >
              <Icons.Mic width={isMobile ? 18 : 14} height={isMobile ? 18 : 14} />
              {uploading ? "Uploading…" : "Start recording"}
            </button>
            {recordError && (
              <span style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600, alignSelf: "center" }}>
                {recordError}
              </span>
            )}
          </div>
        </div>
        {!isMobile && <WatchMockup />}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 360px) minmax(0, 1fr)",
          gap: isMobile ? 12 : 16,
          alignItems: "start",
        }}
      >
        <div
          className="rsd-card"
          style={{
            gap: 0,
            padding: 0,
            overflow: "hidden",
            // On mobile cap the list so it doesn't push the detail panel
            // off-screen — user scrolls within the list when there are many.
            maxHeight: isMobile ? 280 : undefined,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--gw-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>Recordings</div>
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              {recordings.length} captured
            </div>
          </div>
          {recordings.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500 }}>
              No recordings yet.<br />
              Tap <strong style={{ color: "var(--gw-fg)" }}>Start recording</strong> to capture your first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1, minHeight: 0 }}>
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
                        {recordingTitle(r)}
                      </div>
                      <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>
                        {r.source === "watch" ? <Icons.Watch width={12} height={12} /> : <Icons.Phone width={12} height={12} />}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                        {formatWhen(r.created_at)} · {formatDuration(r.duration_sec)}
                      </span>
                      <span className={`rsd-chip ${statusChipClass(r.status)}`} style={{ fontSize: 10 }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <SelectedDetail
            key={selected.id}
            recording={selected}
            isMobile={isMobile}
            members={members}
            onRename={title => editRecordingTitle(selected.id, title)}
            onToggleDone={actionId => toggleDone(selected.id, actionId)}
            onRoute={(actionId, target) => routeAction(selected.id, actionId, target)}
            onEditAction={(actionId, text) => editActionText(selected.id, actionId, text)}
            onSetOwner={(actionId, memberId) => setActionOwner(selected.id, actionId, memberId)}
            onToggleSupporter={(actionId, memberId) => toggleActionSupporter(selected.id, actionId, memberId)}
            onAcceptSuggestion={actionId => acceptSuggestedOwner(selected.id, actionId)}
            onReextract={() => reextractRecording(selected.id)}
            onDelete={() => deleteRecording(selected.id)}
          />
        ) : (
          <div
            className="rsd-card"
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--gw-fg-muted)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Select a recording to see the transcript and extracted action items.
          </div>
        )}
      </section>

      <section className="rsd-card" style={{ gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>Action inbox</h2>
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
              Pulled across every recording. Route, check off, or ignore.
            </div>
          </div>
          <span className="rsd-chip rsd-chip-accent">{inbox.length} open</span>
        </div>
        {inbox.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500 }}>
            Nothing to action right now.
          </div>
        ) : (
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
                  onClick={() => toggleDone(a.recording_id, a.id)}
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
                      onClick={() => setSelectedId(a.recording_id)}
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
                {findMember(members, a.owner_member_id) && (
                  <span
                    className="rsd-chip"
                    style={{
                      fontSize: 10,
                      background: "var(--rsd-accent)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Icons.User width={9} height={9} />
                    {memberLabel(findMember(members, a.owner_member_id))}
                  </span>
                )}
                {a.routed_to ? (
                  <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>
                    → {a.routed_to}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--gw-fg-faint)", fontWeight: 600 }}>
                    not routed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rsd-card" style={{ gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>
            Connected destinations
          </h2>
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
            Where action items can be sent. Things opens the app via its URL scheme and creates the
            to-do; the rest are mock labels for now.
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
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: i.id === "things" ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                    }}
                  >
                    {i.id === "things" ? "One-tap export" : "Label only"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isRecording && <RecordingModal elapsed={elapsed} onStop={stopRecording} />}
    </div>
  );
}

function SelectedDetail({
  recording,
  isMobile,
  members,
  onRename,
  onToggleDone,
  onRoute,
  onEditAction,
  onSetOwner,
  onToggleSupporter,
  onAcceptSuggestion,
  onReextract,
  onDelete,
}: {
  recording: DavesIdeaRecording;
  isMobile: boolean;
  members: AssignableMember[];
  onRename: (title: string) => void;
  onToggleDone: (actionId: string) => void;
  onRoute: (actionId: string, target: string) => void;
  onEditAction: (actionId: string, text: string) => void;
  onSetOwner: (actionId: string, memberId: string | null) => void;
  onToggleSupporter: (actionId: string, memberId: string) => void;
  onAcceptSuggestion: (actionId: string) => void;
  onReextract: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [reextracting, setReextracting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(recording.title ?? "");

  const transcriptText = useMemo(() => {
    if (recording.utterances && recording.utterances.length > 0) {
      return recording.utterances.map(u => `${u.speaker}: ${u.text}`).join("\n\n");
    }
    return recording.transcript ?? "";
  }, [recording.utterances, recording.transcript]);

  const sourceLabel =
    recording.source === "watch" ? "Apple Watch" : recording.source === "native" ? "iPhone" : "PWA";

  // Items eligible for a batch send to Things: open (not done) and not already
  // sent. Drives the "Send all" button and keeps re-clicks from duplicating.
  const sendableToThings = recording.action_items.filter(
    a => !a.done && a.routed_to !== "Things"
  );

  // Re-extract only makes sense once a transcript exists. Hide while the
  // pipeline is still moving so the button doesn't fight the polling state.
  const canReextract =
    !!recording.transcript &&
    (recording.status === "ready" || recording.status === "failed") &&
    !reextracting;

  async function handleReextract() {
    setReextracting(true);
    try {
      await onReextract();
    } finally {
      setReextracting(false);
    }
  }

  // Renaming is gated to finished recordings — a rename during processing would
  // be clobbered when extraction writes the LLM title.
  const canRename = recording.status === "ready" || recording.status === "failed";
  function startTitleEdit() {
    setTitleDraft(recording.title ?? "");
    setEditingTitle(true);
  }
  function commitTitle() {
    const t = titleDraft.trim();
    if (t && t !== recording.title) onRename(t);
    setEditingTitle(false);
  }
  function cancelTitle() {
    setTitleDraft(recording.title ?? "");
    setEditingTitle(false);
  }

  return (
    <div className="rsd-card" style={{ gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className={`rsd-chip ${statusChipClass(recording.status)}`}>{STATUS_LABEL[recording.status]}</span>
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              {sourceLabel} · {formatDuration(recording.duration_sec)}
            </span>
          </div>
          {editingTitle ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelTitle();
                  }
                }}
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "var(--gw-fg)",
                  background: "var(--gw-bg-elev)",
                  border: "1px solid var(--rsd-accent)",
                  borderRadius: 8,
                  padding: "4px 10px",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                onClick={commitTitle}
                className="gw-press"
                style={{ padding: "5px 12px", borderRadius: 100, background: "var(--rsd-accent)", color: "#fff", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                Save
              </button>
              <button
                onClick={cancelTitle}
                className="gw-press"
                style={{ padding: "5px 10px", borderRadius: 100, background: "var(--gw-bg-elev)", color: "var(--gw-fg)", border: "1px solid var(--gw-border)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                {recordingTitle(recording)}
              </h2>
              {canRename && (
                <button
                  onClick={startTitleEdit}
                  aria-label="Edit title"
                  title="Edit title"
                  className="gw-press"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 100,
                    background: "var(--gw-bg-elev)",
                    color: "var(--gw-fg-muted)",
                    border: "1px solid var(--gw-border)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Icons.Pencil width={11} height={11} />
                </button>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
            {formatWhen(recording.created_at)}
          </div>
          {recording.error && (
            <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600, marginTop: 8 }}>
              {recording.error}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            alignItems: isMobile ? "center" : "flex-end",
            gap: 8,
            width: isMobile ? "100%" : undefined,
            flexWrap: "wrap",
          }}
        >
          {recording.audio_blob_url && (
            <audio
              controls
              src={recording.audio_blob_url}
              style={{
                width: isMobile ? "100%" : undefined,
                maxWidth: isMobile ? "100%" : 280,
                height: 36,
              }}
            />
          )}
          {recording.audio_blob_url && (
            <a
              href={audioDownloadHref(recording)}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 11,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icons.ArrowRight width={11} height={11} style={{ transform: "rotate(90deg)" }} />
              Download audio
            </a>
          )}
          {canReextract && (
            <button
              onClick={handleReextract}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Icons.Sparkles width={11} height={11} />
              Re-run extraction
            </button>
          )}
          {reextracting && (
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              Re-extracting…
            </span>
          )}
          <button
            onClick={onDelete}
            className="gw-press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 100,
              background: "var(--gw-error-bg)",
              color: "var(--gw-error)",
              border: "1px solid rgba(229,62,62,.25)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Icons.Trash width={11} height={11} />
            Delete
          </button>
        </div>
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
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {transcriptText ? (
            transcriptText
          ) : (
            <span style={{ color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              {recording.status === "failed" ? "Transcription failed." : "Transcription in progress…"}
            </span>
          )}
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>
            Extracted action items
          </div>
          {sendableToThings.length > 0 && (
            <button
              onClick={() => {
                openAllInThings(sendableToThings.map(a => a.text), recording.title);
                sendableToThings.forEach(a => onRoute(a.id, "Things"));
              }}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Icons.CheckCircle width={11} height={11} />
              Send all to Things ({sendableToThings.length})
            </button>
          )}
        </div>
        {recording.action_items.length === 0 ? (
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
            {recording.status === "ready" ? "No action items extracted." : "Pending — will appear once extraction completes."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recording.action_items.map(a => (
              <ActionRow
                key={a.id}
                action={a}
                recordingTitle={recording.title}
                members={members}
                onToggle={() => onToggleDone(a.id)}
                onRoute={target => onRoute(a.id, target)}
                onEdit={text => onEditAction(a.id, text)}
                onSetOwner={memberId => onSetOwner(a.id, memberId)}
                onToggleSupporter={memberId => onToggleSupporter(a.id, memberId)}
                onAcceptSuggestion={() => onAcceptSuggestion(a.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  recordingTitle,
  members,
  onToggle,
  onRoute,
  onEdit,
  onSetOwner,
  onToggleSupporter,
  onAcceptSuggestion,
}: {
  action: DavesIdeaActionItem;
  recordingTitle: string | null;
  members: AssignableMember[];
  onToggle: () => void;
  onRoute: (target: string) => void;
  onEdit: (text: string) => void;
  onSetOwner: (memberId: string | null) => void;
  onToggleSupporter: (memberId: string) => void;
  onAcceptSuggestion: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(action.text);

  // Guard against a row fetched without the column (older data / a select that
  // predates assignments) so the row renders instead of throwing.
  const supporterIds = action.supporter_member_ids ?? [];
  const owner = findMember(members, action.owner_member_id);
  const supporters = supporterIds
    .map(id => findMember(members, id))
    .filter((m): m is AssignableMember => !!m);
  const suggestedMember = findMember(members, action.suggested_member_id);
  const showSuggestion = !action.owner_member_id && !!action.suggested_assignee_name;

  function startEdit() {
    setOpen(false);
    setDraft(action.text);
    setEditing(true);
  }
  function commitEdit() {
    const trimmed = draft.trim();
    // Persist only a real change; an empty edit is ignored.
    if (trimmed && trimmed !== action.text) onEdit(trimmed);
    setEditing(false);
  }
  function cancelEdit() {
    setDraft(action.text);
    setEditing(false);
  }

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
        opacity: editing ? 1 : action.done ? 0.55 : 1,
        position: "relative",
      }}
    >
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--gw-fg)",
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--rsd-accent)",
              borderRadius: 8,
              padding: "6px 10px",
              outline: "none",
            }}
          />
          <button
            onClick={commitEdit}
            className="gw-press"
            style={{
              padding: "5px 12px",
              borderRadius: 100,
              background: "var(--rsd-accent)",
              color: "#fff",
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Save
          </button>
          <button
            onClick={cancelEdit}
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
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--gw-fg)",
            fontWeight: 600,
            textDecoration: action.done ? "line-through" : "none",
            lineHeight: 1.35,
          }}
        >
          {action.text}
        </div>
        {(owner || supporters.length > 0 || showSuggestion) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, alignItems: "center" }}>
            {owner && (
              <span
                className="rsd-chip"
                style={{ fontSize: 10, background: "var(--rsd-accent)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                <Icons.User width={9} height={9} />
                {memberLabel(owner)}
              </span>
            )}
            {supporters.map(m => (
              <span
                key={m.id}
                className="rsd-chip"
                style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                {memberLabel(m)}
              </span>
            ))}
            {showSuggestion &&
              (suggestedMember ? (
                <button
                  onClick={onAcceptSuggestion}
                  className="gw-press"
                  title={`Assign ${memberLabel(suggestedMember)} as owner`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 100,
                    background: "transparent",
                    color: "var(--rsd-accent)",
                    border: "1px dashed var(--rsd-accent)",
                    cursor: "pointer",
                  }}
                >
                  Suggested: {memberLabel(suggestedMember)}
                  <Icons.CheckCircle width={10} height={10} />
                </button>
              ) : (
                <span style={{ fontSize: 10, color: "var(--gw-fg-faint)", fontWeight: 600, fontStyle: "italic" }}>
                  Mentioned: {action.suggested_assignee_name}
                </span>
              ))}
          </div>
        )}
      </div>
      {action.routed_to && (
        <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>
          → {action.routed_to}
        </span>
      )}
      <button
        onClick={startEdit}
        aria-label="Edit task"
        title="Edit task"
        className="gw-press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 100,
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg-muted)",
          border: "1px solid var(--gw-border)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Icons.Pencil width={12} height={12} />
      </button>
      <AssigneePicker
        members={members}
        ownerId={action.owner_member_id}
        supporterIds={supporterIds}
        onSetOwner={onSetOwner}
        onToggleSupporter={onToggleSupporter}
      />
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
                  if (i.id === "things")
                    openInThings(action.text, recordingTitle, {
                      owner: owner ? memberLabel(owner) : null,
                      supporters: supporters.map(memberLabel),
                    });
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
        </>
      )}
    </div>
  );
}

function pickerToggleStyle(active: boolean): CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 100,
    cursor: "pointer",
    background: active ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
    color: active ? "#fff" : "var(--gw-fg-muted)",
    border: active ? "1px solid var(--rsd-accent)" : "1px solid var(--gw-border)",
  };
}

// People picker for an action item: a search box + a row per member with an
// "Owner" (single) and "Support" (multi) toggle. Styled like the "Send to"
// menu. Lists every approved directory member — no account required.
function AssigneePicker({
  members,
  ownerId,
  supporterIds,
  onSetOwner,
  onToggleSupporter,
}: {
  members: AssignableMember[];
  ownerId: string | null;
  supporterIds: string[];
  onSetOwner: (memberId: string | null) => void;
  onToggleSupporter: (memberId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return members;
    return members.filter(
      m =>
        (m.full_name ?? "").toLowerCase().includes(n) ||
        (m.nickname ?? "").toLowerCase().includes(n)
    );
  }, [q, members]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Assign people"
        title="Assign people"
        className="gw-press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 100,
          background: ownerId ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
          color: ownerId ? "#fff" : "var(--gw-fg-muted)",
          border: "1px solid var(--gw-border)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Icons.Users width={12} height={12} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: 248,
            background: "var(--gw-bg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 10,
            boxShadow: "var(--gw-shadow-3)",
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid var(--gw-border)" }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search members…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--gw-fg)",
                background: "var(--gw-bg-elev)",
                border: "1px solid var(--gw-border)",
                borderRadius: 8,
                padding: "6px 9px",
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflow: "auto", padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                No members
              </div>
            ) : (
              filtered.map(m => {
                const isOwner = m.id === ownerId;
                const isSupporter = supporterIds.includes(m.id);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px" }}>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--gw-fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.full_name || m.nickname || "Member"}
                      {m.full_name && m.nickname ? ` (${m.nickname})` : ""}
                    </span>
                    <button onClick={() => onSetOwner(isOwner ? null : m.id)} className="gw-press" style={pickerToggleStyle(isOwner)}>
                      Owner
                    </button>
                    <button onClick={() => onToggleSupporter(m.id)} className="gw-press" style={pickerToggleStyle(isSupporter)}>
                      Support
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
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
          width: "min(320px, calc(100vw - 32px))",
          maxWidth: 320,
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
