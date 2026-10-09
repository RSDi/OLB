// Saving a Slack Archive message (or its whole thread) to a player's notes
// (0124, 0125): the messages as they're kept on the note, so the note shows
// them the way the Slack Archive does, and which of their files come along
// as the note's attachments. Plain module, no I/O.

import { NOTE_FILES_MAX, NOTE_FILE_EXT, NOTE_FILE_MAX_BYTES } from "./player-notes.ts"; // explicit extension so node --test can load this file
import type { SlackSnapshot } from "./player-notes.ts";

export interface ArchivedNoteMessage {
  ts: string;
  author_name: string | null;
  posted_at: string;
  message_text: string;
  edited: boolean | null;
  reactions: { name: string; count: number; users: { name: string | null }[] }[] | null;
  files: { name: string; mimetype: string; size: number; storage_path: string | null }[] | null;
}

export interface CopyFile {
  storage_path: string;
  // Where it goes in the notes bucket, under the note's folder.
  path: string;
  name: string;
  type: string;
  size: number;
}

// The snapshot kept on the note, and the files to copy into it. Pictures and
// PDFs the archive saved come along (up to a note's limit), each shown under
// its own message; anything else (a video, a file that never downloaded) is
// named under its message, to open in the Slack Archive. `newPath` names
// each copy's place in the notes bucket.
export function slackSnapshot(
  input: { channelId: string; channelLabel: string; ts: string; messages: ArchivedNoteMessage[] },
  newPath: (ext: string) => string
): { snapshot: SlackSnapshot; copy: CopyFile[] } {
  const copy: CopyFile[] = [];
  const messages = input.messages.map((m) => ({
    ts: m.ts,
    author_name: m.author_name,
    posted_at: m.posted_at,
    message_text: m.message_text ?? "",
    edited: !!m.edited,
    reactions: (m.reactions ?? []).map((r) => ({ name: r.name, count: r.count, users: (r.users ?? []).map((u) => ({ name: u.name })) })),
    files: (m.files ?? []).map((f) => {
      const type = (f.mimetype ?? "").toLowerCase();
      const ext = NOTE_FILE_EXT[type];
      const name = f.name || (ext ? `Attachment.${ext}` : "A file");
      if (f.storage_path && ext && f.size <= NOTE_FILE_MAX_BYTES && copy.length < NOTE_FILES_MAX) {
        const path = newPath(ext);
        copy.push({ storage_path: f.storage_path, path, name, type, size: f.size });
        return { name, type, path };
      }
      return { name, type, path: null };
    }),
  }));
  return {
    snapshot: { channel_id: input.channelId, channel_label: input.channelLabel.replace(/^#/, ""), ts: input.ts, messages },
    copy,
  };
}

// A copy that didn't go through stays named under its message instead.
export function dropFailedCopies(snapshot: SlackSnapshot, failed: Set<string>): SlackSnapshot {
  if (failed.size === 0) return snapshot;
  return {
    ...snapshot,
    messages: snapshot.messages.map((m) => ({
      ...m,
      files: m.files.map((f) => (f.path && failed.has(f.path) ? { ...f, path: null } : f)),
    })),
  };
}
