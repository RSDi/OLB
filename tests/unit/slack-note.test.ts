// Saving a Slack Archive message to a player's notes (lib/teams/slack-note.ts):
// the messages kept on the note, and which files come along.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropFailedCopies, slackSnapshot, type ArchivedNoteMessage } from "../../lib/teams/slack-note.ts";

const msg = (ts: string, files: ArchivedNoteMessage["files"] = []): ArchivedNoteMessage => ({
  ts,
  author_name: "Pat Coach",
  posted_at: "2026-10-03T14:14:00Z",
  message_text: "*No reply* :eyes:",
  edited: null,
  reactions: [{ name: "+1", count: 1, users: [{ name: "Sam" }] }],
  files,
});

test("each message keeps its text, reactions and its own files", () => {
  let n = 0;
  const { snapshot, copy } = slackSnapshot(
    {
      channelId: "C1",
      channelLabel: "#board",
      ts: "1.1",
      messages: [
        msg("1.1", [
          { name: "texts.png", mimetype: "image/png", size: 1000, storage_path: "C1/1.1/F1-texts.png" },
          { name: "clip.mov", mimetype: "video/quicktime", size: 1000, storage_path: "C1/1.1/F2-clip.mov" },
        ]),
        msg("1.2", [
          { name: "lost.jpg", mimetype: "image/jpeg", size: 1000, storage_path: null },
          { name: "huge.pdf", mimetype: "application/pdf", size: 20 * 1024 * 1024, storage_path: "C1/1.2/F3-huge.pdf" },
          { name: "form.pdf", mimetype: "application/pdf", size: 1000, storage_path: "C1/1.2/F4-form.pdf" },
        ]),
      ],
    },
    (ext) => `note/${++n}.${ext}`
  );
  assert.equal(snapshot.channel_label, "board");
  assert.equal(snapshot.messages[0].message_text, "*No reply* :eyes:");
  assert.equal(snapshot.messages[0].edited, false);
  assert.deepEqual(snapshot.messages[0].reactions, [{ name: "+1", count: 1, users: [{ name: "Sam" }] }]);
  assert.deepEqual(snapshot.messages[0].files, [
    { name: "texts.png", type: "image/png", path: "note/1.png" },
    { name: "clip.mov", type: "video/quicktime", path: null },
  ]);
  assert.deepEqual(snapshot.messages[1].files.map((f) => f.path), [null, null, "note/2.pdf"]);
  assert.deepEqual(copy.map((c) => [c.storage_path, c.path]), [
    ["C1/1.1/F1-texts.png", "note/1.png"],
    ["C1/1.2/F4-form.pdf", "note/2.pdf"],
  ]);
});

test("a copy that failed stays named, not linked", () => {
  const { snapshot } = slackSnapshot(
    { channelId: "C1", channelLabel: "board", ts: "1.1", messages: [msg("1.1", [{ name: "a.png", mimetype: "image/png", size: 1, storage_path: "x" }])] },
    () => "note/a.png"
  );
  assert.equal(dropFailedCopies(snapshot, new Set(["note/a.png"])).messages[0].files[0].path, null);
});
