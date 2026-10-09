"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Pill, Textarea } from "../../../components/ui";
import { ErrorNote, capStyle } from "../../payments/parts";
import { muted } from "./PlayerParts";
import { addPlayerNote, deletePlayerNote, discardNoteUploads, openNoteFile, updatePlayerNote } from "../../../../lib/teams/player-note-actions";
import { uploadNoteFile } from "../../../../lib/teams/player-note-upload";
import {
  NOTE_BODY_MAX,
  NOTE_FILES_MAX,
  NOTE_FILE_ACCEPT,
  isShowableImage,
  type NoteAttachment,
  type NoteOwner,
  type PlayerNote,
} from "../../../../lib/teams/player-notes";

// Notes on a player (0124), for the board and the Registrations grant: a log
// of what happened with the family, newest first, with screenshots or PDFs
// attached and links that open (a Slack Archive thread, say). On the
// player's page and on their registration while they're on the waitlist.
export function PlayerNotes({
  owner,
  notes,
  framed = true,
}: {
  owner: NoteOwner;
  notes: PlayerNote[];
  // A card of its own (the player page), or a section inside one (the waitlist).
  framed?: boolean;
}) {
  const [adding, setAdding] = useState(false);

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ ...capStyle, fontSize: framed ? 11 : 10 }}>
        Notes{notes.length > 0 ? ` · ${notes.length}` : ""}
      </span>
      {!adding && (
        <span data-tour="player-notes-add" style={{ display: "inline-flex" }}>
          <Pill size="sm" variant="light" onClick={() => setAdding(true)}>
            <Icons.Plus width={13} height={13} /> Add a note
          </Pill>
        </span>
      )}
    </div>
  );

  const body = (
    <>
      {header}
      {adding && <NoteComposer owner={owner} onDone={() => setAdding(false)} />}
      {notes.length === 0 && !adding && (
        <div style={muted}>Nothing logged yet. Notes are for the board and Registrations; families don&apos;t see them.</div>
      )}
      {notes.map((n, i) => (
        <NoteItem key={n.id} note={n} border={i > 0 || adding} />
      ))}
    </>
  );

  return framed ? (
    <div className="rsd-card" data-tour="player-notes" style={{ padding: "16px 20px", gap: 12 }}>
      {body}
    </div>
  ) : (
    <div data-tour="player-notes" style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--gw-border)" }}>
      {body}
    </div>
  );
}

// ─── Writing a note ─────────────────────────────────────────────────────────

function NoteComposer({ owner, onDone }: { owner: NoteOwner; onDone: () => void }) {
  const router = useRouter();
  // The note's id up front, so its files upload under it before it's saved.
  const [id] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [files, setFiles] = useState<(NoteAttachment & { preview: string | null })[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function addFiles(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    const room = NOTE_FILES_MAX - files.length - uploading;
    if (list.length > room) {
      setError(`A note can have up to ${NOTE_FILES_MAX} attachments.`);
      list = list.slice(0, Math.max(room, 0));
    }
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        const res = await uploadNoteFile(id, file);
        setUploading((n) => n - 1);
        if (res.error || !res.file) return setError(res.error ?? "That file didn't upload. Try again.");
        const uploaded = res.file;
        const preview = isShowableImage(uploaded.type) ? URL.createObjectURL(file) : null;
        setFiles((prev) => [...prev, { ...uploaded, preview }]);
      })
    );
    if (picker.current) picker.current.value = "";
  }

  function removeFile(path: string) {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    void discardNoteUploads(id, [path]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await addPlayerNote({
      id,
      owner,
      body: text,
      attachments: files.map(({ path, name, type, size }) => ({ path, name, type, size })),
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onDone();
  }

  function cancel() {
    if (files.length > 0) void discardNoteUploads(id, files.map((f) => f.path));
    onDone();
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        void addFiles([...e.dataTransfer.files]);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 12,
        background: "var(--gw-bg)",
        border: `1px ${dragging ? "dashed var(--rsd-accent)" : "solid var(--gw-border)"}`,
      }}
    >
      <Textarea
        label="New note"
        help="What happened, when, and who. Paste a link (a Slack Archive message, say) and it opens from the note, or write [the words to show](the link)."
        value={text}
        maxLength={NOTE_BODY_MAX}
        rows={5}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = [...e.clipboardData.files];
          if (pasted.length === 0) return;
          e.preventDefault();
          void addFiles(pasted);
        }}
        placeholder="e.g. Oct 9: texted the family again. No reply in two weeks, so their spot went to the next family on the waitlist."
      />

      {(files.length > 0 || uploading > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {files.map((f) => (
            <div key={f.path} style={{ position: "relative" }}>
              <FileTile name={f.name} type={f.type} src={f.preview} />
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => removeFile(f.path)}
                disabled={busy}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: "1px solid var(--gw-border)",
                  background: "var(--gw-bg-elev)",
                  color: "var(--gw-fg)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Icons.Cross width={11} height={11} />
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div style={{ ...tile, display: "grid", placeItems: "center", ...muted }}>Uploading…</div>
          )}
        </div>
      )}

      {error && <ErrorNote text={error} />}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pill variant="dark" onClick={save} disabled={busy || uploading > 0 || (!text.trim() && files.length === 0)}>
          {busy ? "Saving…" : "Save note"}
        </Pill>
        <input
          ref={picker}
          type="file"
          accept={NOTE_FILE_ACCEPT}
          multiple
          hidden
          onChange={(e) => void addFiles([...(e.target.files ?? [])])}
        />
        <Pill variant="light" onClick={() => picker.current?.click()} disabled={busy || files.length + uploading >= NOTE_FILES_MAX}>
          <Icons.Image width={13} height={13} /> Attach screenshots or files
        </Pill>
        <Pill variant="ghost" onClick={cancel} disabled={busy}>
          Cancel
        </Pill>
        <span style={{ ...muted, flex: "1 1 200px" }}>Pictures or PDFs, up to 10 MB each. You can also paste or drag them in.</span>
      </div>
    </div>
  );
}

// ─── One note ───────────────────────────────────────────────────────────────

function NoteItem({ note, border }: { note: PlayerNote; border: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = new Date(note.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const edited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 60_000;

  async function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (res.error) return setError(res.error);
    after?.();
    router.refresh();
  }

  async function open(path: string) {
    setError(null);
    // Open the tab now so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    const res = await openNoteFile(note.id, path);
    if (res.url && tab) tab.location.href = res.url;
    else {
      tab?.close();
      setError(res.error ?? "Couldn't open that file.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: border ? 12 : 0, borderTop: border ? "1px solid var(--gw-border)" : "none" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{note.author_name ?? "Someone"}</span>
        <span style={muted}>
          {when}
          {edited && " · edited"}
        </span>
        {note.can_edit && !editing && (
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12 }}>
            <button type="button" style={linkButton} onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
            <button
              type="button"
              style={{ ...linkButton, color: "var(--gw-error)" }}
              disabled={busy}
              onClick={() => {
                if (confirm("Delete this note and its attachments?")) void run(() => deletePlayerNote(note.id));
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea value={text} maxLength={NOTE_BODY_MAX} rows={5} autoFocus onChange={(e) => setText(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Pill size="sm" variant="dark" onClick={() => run(() => updatePlayerNote(note.id, text), () => setEditing(false))} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Pill>
            <Pill
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(note.body);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </Pill>
          </div>
        </div>
      ) : (
        note.body && (
          <div className="rsd-markdown" style={{ fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>
            <MarkdownView>{note.body}</MarkdownView>
          </div>
        )
      )}

      {note.attachments.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {note.attachments.map((a) => (
            <a
              key={a.path}
              href={a.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              title={a.name}
              onClick={(e) => {
                e.preventDefault();
                void open(a.path);
              }}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <FileTile name={a.name} type={a.type} src={isShowableImage(a.type) ? a.url : null} />
            </a>
          ))}
        </div>
      )}

      {error && <ErrorNote text={error} />}
    </div>
  );
}

const tile: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: 10,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  overflow: "hidden",
};

// A screenshot as a thumbnail; anything else as its name.
function FileTile({ name, type, src }: { name: string; type: string; src: string | null }) {
  if (src && isShowableImage(type)) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs and local previews
    return <img src={src} alt={name} style={{ ...tile, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div style={{ ...tile, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 8 }}>
      <Icons.FileText width={22} height={22} style={{ color: "var(--gw-fg-muted)" }} />
      <span style={{ ...muted, fontSize: 11, textAlign: "center", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
        {name}
      </span>
    </div>
  );
}

const linkButton: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
