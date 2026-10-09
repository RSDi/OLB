"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Textarea } from "../../../components/ui";
import { ErrorNote, Sheet } from "../../payments/parts";
import { listNoteTargets, saveSlackToNotes, type NoteTarget } from "../../../../lib/teams/player-note-actions";

const muted: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 };

// Save to player notes, from one archived message: pick the player (on the
// roster, or a registration on New, Waitlist or Removed), add a line if you
// like, and the message (and its replies, for a thread's first message)
// becomes a note with its pictures and a link back here.
export function SaveToNotesSheet({
  channelId,
  ts,
  author,
  replyCount,
  onClose,
}: {
  channelId: string;
  ts: string;
  author: string;
  // Replies under this message; 0 for a reply or a message on its own.
  replyCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<NoteTarget[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<NoteTarget | null>(null);
  const [withReplies, setWithReplies] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<NoteTarget | null>(null);

  useEffect(() => {
    let live = true;
    listNoteTargets().then((res) => {
      if (!live) return;
      if (res.error) setError(res.error);
      setTargets(res.targets ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!targets || !q) return [];
    return targets.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [targets, query]);

  async function save() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const res = await saveSlackToNotes({ channelId, ts, withReplies: replyCount > 0 && withReplies, owner: picked.owner, comment });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSaved(picked);
  }

  const href = (t: NoteTarget) =>
    "playerId" in t.owner
      ? `/portal/directory/players/${t.owner.playerId}`
      : `/portal/directory/registrations?tab=${t.where === "Waitlist" ? "waitlist" : t.where === "Removed" ? "removed" : "waiting"}`;

  return (
    <Sheet eyebrow={`Message from ${author}`} title="Save to player notes" busy={busy} onClose={onClose}>
      {saved ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>Saved to {saved.name}&apos;s notes.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="dark" onClick={() => router.push(href(saved))}>
              Open {saved.name.split(" ")[0]}&apos;s notes
            </Pill>
            <Pill variant="ghost" onClick={onClose}>
              Done
            </Pill>
          </div>
        </div>
      ) : (
        <>
          {picked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--rsd-accent)", background: "var(--rsd-accent-bg)" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{picked.name}</span>
                <span style={muted}>{picked.where}</span>
              </span>
              <Pill size="sm" variant="ghost" onClick={() => setPicked(null)} disabled={busy}>
                Change
              </Pill>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Input
                label="Player"
                value={query}
                autoFocus
                placeholder={targets ? "Type a player's name" : "Loading players…"}
                onChange={(e) => setQuery(e.target.value)}
              />
              {matches.map((t) => (
                <button
                  key={"playerId" in t.owner ? t.owner.playerId : t.owner.registrationId}
                  type="button"
                  onClick={() => setPicked(t)}
                  className="gw-press"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--gw-border)",
                    background: "var(--gw-bg)",
                    color: "var(--gw-fg)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {t.name}
                  <span style={muted}>{t.where}</span>
                </button>
              ))}
              {targets && query.trim() && matches.length === 0 && <span style={muted}>No player by that name.</span>}
            </div>
          )}

          {replyCount > 0 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={withReplies} onChange={(e) => setWithReplies(e.target.checked)} />
              Include the {replyCount === 1 ? "reply" : `${replyCount} replies`}
            </label>
          )}

          <Textarea
            label="Add a line (optional)"
            value={comment}
            rows={2}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. The board's discussion on giving the family a deadline."
          />
          <span style={muted}>
            The note gets each message with who wrote it and when, its pictures and PDFs, and a link back to this
            message. Families never see notes.
          </span>

          {error && <ErrorNote text={error} />}

          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="dark" onClick={save} disabled={busy || !picked}>
              {busy ? "Saving…" : "Save note"}
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
