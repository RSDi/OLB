// Notes on a player (0124): what the board and the Registrations grant log
// about a family ("texted twice, no answer"), with screenshots or PDFs
// attached. Families never see them. A note belongs to the player while
// they're on the roster and to their registration while they're on the
// waitlist, and follows them between the two.

// Safe to import anywhere; the uploader is in player-note-upload.ts.
export const PLAYER_NOTE_FILES_BUCKET = "player-note-files";
export const NOTE_BODY_MAX = 10000;
export const NOTE_FILES_MAX = 10;
export const NOTE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const NOTE_FILE_ACCEPT = "image/*,application/pdf,.heic,.heif";

export interface NoteAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

// Messages saved from the Slack Archive (0125), kept on the note as they
// were, so the note shows them the way the archive does: a thread's first
// message, then its replies. A file with a path is one of the note's
// attachments; one without stayed in the archive.
export interface SlackSnapshot {
  channel_id: string;
  channel_label: string;
  // The message it was saved from, for the link back.
  ts: string;
  messages: {
    ts: string;
    author_name: string | null;
    posted_at: string;
    message_text: string;
    edited: boolean;
    reactions: { name: string; count: number; users: { name: string | null }[] }[];
    files: { name: string; type: string; path: string | null }[];
  }[];
}

export interface PlayerNote {
  id: string;
  body: string;
  // Saved from the Slack Archive; null for a note written here.
  slack: SlackSnapshot | null;
  attachments: (NoteAttachment & { url: string | null })[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author_name: string | null;
  // The viewer wrote it, or is a super-admin: Edit and Delete show.
  can_edit: boolean;
}

// Which record a note hangs off: a player on the roster, or a registration
// (the waitlist).
export type NoteOwner = { playerId: string } | { registrationId: string };

export const NOTE_FILE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

// Browsers show these inline; HEIC and PDFs open as files.
export function isShowableImage(type: string): boolean {
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type);
}

// The attachments a note is saved with, as the browser sent them: each one
// under the note's own folder, a known kind, a sensible name. An error means
// the list can't be trusted.
export function cleanAttachments(noteId: string, list: unknown): { value: NoteAttachment[] } | { error: string } {
  if (!Array.isArray(list)) return { value: [] };
  if (list.length > NOTE_FILES_MAX) return { error: `A note can have up to ${NOTE_FILES_MAX} attachments.` };
  const value: NoteAttachment[] = [];
  for (const raw of list) {
    const a = raw as Partial<NoteAttachment> | null;
    const path = typeof a?.path === "string" ? a.path : "";
    const ext = path.slice(path.lastIndexOf(".") + 1);
    const type = typeof a?.type === "string" ? a.type.toLowerCase() : "";
    if (!new RegExp(`^${noteId}/[0-9a-f-]{36}\\.[a-z]{3,4}$`).test(path) || NOTE_FILE_EXT[type] !== ext) {
      return { error: "An attachment didn't upload properly. Remove it and add it again." };
    }
    const name = (typeof a?.name === "string" ? a.name.trim() : "").slice(0, 200) || `Attachment.${ext}`;
    const size = typeof a?.size === "number" && a.size >= 0 ? Math.round(a.size) : 0;
    value.push({ path, name, type, size });
  }
  return { value };
}

// Plain text with links: the note's body as markdown, where a bare
// https://… link or [words](link) is clickable, and so is a link to a portal
// page such as a Slack Archive message ([the thread](/portal/slack-archive/…)).
export function cleanNoteBody(body: unknown): string {
  return (typeof body === "string" ? body : "").replace(/\r\n/g, "\n").trim().slice(0, NOTE_BODY_MAX);
}
