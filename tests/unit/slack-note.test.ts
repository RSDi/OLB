// Saving a Slack Archive message to a player's notes (lib/teams/slack-note.ts):
// the note's words and which files come along.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNoteFiles, slackNoteBody, slackToMarkdown } from "../../lib/teams/slack-note.ts";

const msg = (text: string, files: { name: string; mimetype: string; size: number; storage_path: string | null }[] = []) => ({
  author_name: "Pat Coach",
  posted_at: "2026-10-03T14:14:00Z",
  message_text: text,
  files,
});

test("Slack's bold and strike become markdown; entities are decoded", () => {
  assert.equal(slackToMarkdown("*No reply* in ~two~ weeks &amp; counting"), "**No reply** in ~~two~~ weeks & counting");
  assert.equal(slackToMarkdown("2 * 3 = 6"), "2 * 3 = 6");
  assert.equal(slackToMarkdown("_italic_ stays"), "_italic_ stays");
});

test("pictures and PDFs come along; videos and missing files are named instead", () => {
  const { copy, skipped } = pickNoteFiles([
    msg("a", [
      { name: "texts.png", mimetype: "image/png", size: 1000, storage_path: "C1/1.2/F1-texts.png" },
      { name: "clip.mov", mimetype: "video/quicktime", size: 1000, storage_path: "C1/1.2/F2-clip.mov" },
      { name: "lost.jpg", mimetype: "image/jpeg", size: 1000, storage_path: null },
      { name: "huge.pdf", mimetype: "application/pdf", size: 20 * 1024 * 1024, storage_path: "C1/1.2/F3-huge.pdf" },
    ]),
  ]);
  assert.deepEqual(copy.map((f) => [f.name, f.ext]), [["texts.png", "png"]]);
  assert.deepEqual(skipped, ["clip.mov", "lost.jpg", "huge.pdf"]);
});

test("the note quotes each message under who wrote it and when, with a link back", () => {
  const body = slackNoteBody({
    comment: "The board's discussion.",
    channelLabel: "board",
    href: "/portal/slack-archive/C1#msg-1.2",
    messages: [msg("First line\nSecond line"), msg("")],
    skipped: ["clip.mov"],
  });
  assert.equal(
    body,
    [
      "The board's discussion.",
      "From Slack, #board ([open in the Slack Archive](/portal/slack-archive/C1#msg-1.2)):",
      "**Pat Coach** · Oct 3, 2026, 9:14 AM\n> First line\n> Second line",
      "**Pat Coach** · Oct 3, 2026, 9:14 AM\n> _(attachments only)_",
      "_Not copied (open the Slack Archive for these): clip.mov_",
    ].join("\n\n")
  );
});

test("a long thread is cut short to fit a note", () => {
  const body = slackNoteBody({
    comment: "",
    channelLabel: "board",
    href: "/x",
    messages: Array.from({ length: 50 }, () => msg("x".repeat(400))),
    skipped: [],
  });
  assert.ok(body.length <= 10000);
  assert.ok(body.endsWith("_…more in the Slack Archive._"));
});
