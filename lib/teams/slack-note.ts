// Saving a Slack Archive message (or its whole thread) to a player's notes
// (0124): the note's words, written from the archived messages, and which of
// their files can come along as attachments. Plain module, no I/O.

import { decodeSlackEntities } from "../slack-archive/text.ts"; // explicit extension so node --test can load this file
import { CHURCH_TZ } from "../dates/today.ts";
import { NOTE_BODY_MAX, NOTE_FILES_MAX, NOTE_FILE_EXT, NOTE_FILE_MAX_BYTES } from "./player-notes.ts";

export interface SlackNoteMessage {
  author_name: string | null;
  posted_at: string;
  message_text: string;
  files: { name: string; mimetype: string; size: number; storage_path: string | null }[];
}

export interface CopyFile {
  storage_path: string;
  name: string;
  type: string;
  ext: string;
  size: number;
}

// Pictures and PDFs saved in the archive, up to a note's limit; the rest
// (videos, a file that never downloaded, one past the limit) are named in
// the note instead.
export function pickNoteFiles(messages: SlackNoteMessage[]): { copy: CopyFile[]; skipped: string[] } {
  const copy: CopyFile[] = [];
  const skipped: string[] = [];
  for (const f of messages.flatMap((m) => m.files ?? [])) {
    const type = (f.mimetype ?? "").toLowerCase();
    const ext = NOTE_FILE_EXT[type];
    if (f.storage_path && ext && f.size <= NOTE_FILE_MAX_BYTES && copy.length < NOTE_FILES_MAX) {
      copy.push({ storage_path: f.storage_path, name: f.name || `Attachment.${ext}`, type, ext, size: f.size });
    } else {
      skipped.push(f.name || "a file");
    }
  }
  return { copy, skipped };
}

// Slack's *bold* and ~strike~ as the markdown the notes use (_italic_ is
// the same in both).
export function slackToMarkdown(text: string): string {
  return decodeSlackEntities(text)
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=$|[\s).,!?;:])/gm, "$1**$2**")
    .replace(/(^|[\s(])~(\S(?:[^~\n]*\S)?)~(?=$|[\s).,!?;:])/gm, "$1~~$2~~");
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CHURCH_TZ,
  });
}

// The note: an optional line from whoever saved it, where it came from with
// a link back, then each message as a quote under who wrote it and when.
export function slackNoteBody(input: {
  comment: string;
  channelLabel: string;
  href: string;
  messages: SlackNoteMessage[];
  skipped: string[];
}): string {
  const head = [
    input.comment.trim(),
    `From Slack, #${input.channelLabel.replace(/^#/, "")} ([open in the Slack Archive](${input.href})):`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const parts = input.messages.map((m) => {
    const text = slackToMarkdown(m.message_text ?? "").trim();
    const quoted = text ? text.split("\n").map((line) => `> ${line}`).join("\n") : "> _(attachments only)_";
    return `**${m.author_name ?? "Unknown"}** · ${when(m.posted_at)}\n${quoted}`;
  });
  const tail = input.skipped.length > 0 ? `_Not copied (open the Slack Archive for these): ${input.skipped.join(", ")}_` : "";

  const more = "\n\n_…more in the Slack Archive._";
  let body = head;
  for (const part of parts) {
    const next = `${body}\n\n${part}`;
    if (next.length + tail.length + more.length + 4 > NOTE_BODY_MAX) return `${body}${more}${tail ? `\n\n${tail}` : ""}`;
    body = next;
  }
  return tail ? `${body}\n\n${tail}` : body;
}
