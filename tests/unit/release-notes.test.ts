// Release notes (lib/release-notes/model.ts): dated entries, walkthrough
// steps, and a released roadmap item feeding a note.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asReleaseNote,
  cleanHref,
  cleanReleaseNote,
  draftFromRoadmap,
  emptyForm,
  filterByArea,
  formFromNote,
  groupByDay,
  hasHow,
  mediaKind,
  parseSteps,
  vimeoEmbedSrc,
  walkthroughSteps,
  youtubeEmbedSrc,
  type ReleaseNote,
  type ReleaseNoteInput,
} from "../../lib/release-notes/model.ts";

const form: ReleaseNoteInput = {
  title: "  Staying elsewhere ",
  area: "HS Schedule",
  summary: "  Families can mark that they aren't in the hotel block. ",
  releasedOn: "2026-10-16",
  steps: [],
};

function note(partial: Partial<ReleaseNote> & Pick<ReleaseNote, "id" | "title">): ReleaseNote {
  return {
    released_on: "2026-10-16",
    area: "Portal",
    summary: "A summary.",
    steps: [],
    media_url: null,
    href: null,
    roadmap_item_id: null,
    created_at: "2026-10-16T12:00:00Z",
    ...partial,
  };
}

test("a note saves trimmed, with the live day", () => {
  assert.deepEqual(cleanReleaseNote(form), {
    title: "Staying elsewhere",
    area: "HS Schedule",
    summary: "Families can mark that they aren't in the hotel block.",
    released_on: "2026-10-16",
    steps: [],
    media_url: null,
    href: null,
    roadmap_item_id: null,
  });
});

test("title, summary, area and day are checked", () => {
  assert.deepEqual(cleanReleaseNote({ ...form, title: "   " }), { error: "Give it a title." });
  assert.ok("error" in cleanReleaseNote({ ...form, title: "x".repeat(121) }));
  assert.deepEqual(cleanReleaseNote({ ...form, summary: "  " }), { error: "Write a short summary." });
  assert.deepEqual(cleanReleaseNote({ ...form, area: "Somewhere" }), { error: "Pick an area." });
  assert.deepEqual(cleanReleaseNote({ ...form, releasedOn: "" }), { error: "Enter the day it went live." });
  assert.deepEqual(cleanReleaseNote({ ...form, releasedOn: "2026-02-30" }), { error: "Enter the day it went live." });
});

test("a portal path or http(s) page link is kept; junk is refused", () => {
  assert.deepEqual(cleanHref(""), { href: null });
  assert.deepEqual(cleanHref("  /portal/directory  "), { href: "/portal/directory" });
  assert.deepEqual(cleanHref("https://example.com/x"), { href: "https://example.com/x" });
  assert.ok("error" in cleanHref("javascript:alert(1)"));
  assert.ok("error" in cleanHref("/login"));
  const row = cleanReleaseNote({ ...form, href: "/portal/directory" });
  assert.ok(!("error" in row) && row.href === "/portal/directory");
});

test("walkthrough steps are ordered, capped, and may carry media or a page", () => {
  const row = cleanReleaseNote({
    ...form,
    steps: [
      { title: " Open Directory ", body: " Go to **Directory**. ", href: "/portal/directory" },
      { title: "Mark the stay", body: "Pick **Staying elsewhere**.", mediaUrl: "https://img.example.com/stay.png" },
    ],
    mediaUrl: "https://youtu.be/abcdEFG1234",
  });
  assert.ok(!("error" in row));
  assert.equal(row.steps.length, 2);
  assert.equal(row.steps[0].href, "/portal/directory");
  assert.equal(row.steps[1].media_url, "https://img.example.com/stay.png");
  assert.equal(row.media_url, "https://youtu.be/abcdEFG1234");
  assert.ok("error" in cleanReleaseNote({ ...form, steps: [{ title: "", body: "do it" }] }));
  assert.ok("error" in cleanReleaseNote({ ...form, steps: [{ title: "Go", body: "" }] }));
  assert.ok(
    "error" in
      cleanReleaseNote({
        ...form,
        steps: Array.from({ length: 13 }, (_, i) => ({ title: `Step ${i + 1}`, body: "Do this." })),
      })
  );
});

test("notes group by day, newest first, and filter by area", () => {
  const notes = [
    note({ id: "a", title: "Alpha", released_on: "2026-10-16", area: "Portal" }),
    note({ id: "b", title: "Bravo", released_on: "2026-10-16", area: "HS Schedule" }),
    note({ id: "c", title: "Charlie", released_on: "2026-10-15", area: "Portal" }),
  ];
  const groups = groupByDay(notes);
  assert.deepEqual(
    groups.map((g) => [g.day, g.notes.map((n) => n.id)]),
    [
      ["2026-10-16", ["a", "b"]],
      ["2026-10-15", ["c"]],
    ]
  );
  assert.deepEqual(filterByArea(notes, "all").map((n) => n.id), ["a", "b", "c"]);
  assert.deepEqual(filterByArea(notes, "Portal").map((n) => n.id), ["a", "c"]);
});

test("Show me how is on when there are steps or a screenshot; a media-only note is one slide", () => {
  const none = note({ id: "n", title: "Plain" });
  assert.equal(hasHow(none), false);
  assert.deepEqual(walkthroughSteps(none), []);
  const stepped = note({
    id: "s",
    title: "Stepped",
    steps: [{ title: "One", body: "Do it.", media_url: null, href: null }],
  });
  assert.equal(hasHow(stepped), true);
  assert.equal(walkthroughSteps(stepped).length, 1);
  const media = note({ id: "m", title: "Clip", media_url: "https://cdn.example.com/how.mp4", summary: "Watch this." });
  assert.equal(hasHow(media), true);
  assert.deepEqual(walkthroughSteps(media), [
    { title: "Clip", body: "Watch this.", media_url: "https://cdn.example.com/how.mp4", href: null },
  ]);
});

test("a released roadmap item prefills a note; other columns don't", () => {
  const item = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Preview column",
    description: "A Preview column with a Vercel link.",
    area: "Portal" as const,
    status: "released" as const,
    released_on: "2026-10-16",
  };
  assert.deepEqual(draftFromRoadmap(item), {
    title: "Preview column",
    area: "Portal",
    summary: "A Preview column with a Vercel link.",
    releasedOn: "2026-10-16",
    steps: [],
    roadmapItemId: item.id,
  });
  assert.deepEqual(draftFromRoadmap({ ...item, status: "preview" }), {
    error: "Only released roadmap items can become a release note.",
  });
  assert.deepEqual(draftFromRoadmap({ ...item, released_on: null }), {
    error: "That released item is missing its live date.",
  });
  const uuid = cleanReleaseNote({ ...form, roadmapItemId: item.id });
  assert.ok(!("error" in uuid) && uuid.roadmap_item_id === item.id);
  assert.ok("error" in cleanReleaseNote({ ...form, roadmapItemId: "not-a-uuid" }));
});

test("jsonb steps round-trip, and a stored row maps for the list", () => {
  assert.deepEqual(parseSteps(null), []);
  assert.deepEqual(parseSteps([{ title: "Go", body: "Open it.", media_url: null, href: "/portal" }]), [
    { title: "Go", body: "Open it.", media_url: null, href: "/portal" },
  ]);
  const row = asReleaseNote({
    id: "n1",
    released_on: "2026-10-16",
    title: "Tick families",
    area: "Slack & email",
    summary: "Leave a family out of a send.",
    steps: [{ title: "Open Email families", body: "From the Directory." }],
    media_url: null,
    href: "/portal/directory",
    roadmap_item_id: null,
    created_at: "2026-10-16T18:00:00Z",
  });
  assert.equal(row.area, "Slack & email");
  assert.equal(row.steps[0].title, "Open Email families");
  const back = formFromNote(row);
  assert.equal(back.releasedOn, "2026-10-16");
  assert.equal(back.steps[0].body, "From the Directory.");
  assert.equal(emptyForm("2026-10-16").area, "Portal");
});

test("screenshot, video and YouTube/Vimeo links are classified for the overlay", () => {
  assert.equal(mediaKind("https://cdn.example.com/shot.png"), "image");
  assert.equal(mediaKind("https://cdn.example.com/demo.mp4"), "video");
  assert.equal(mediaKind("https://youtu.be/abcdEFG1234"), "youtube");
  assert.equal(mediaKind("https://www.youtube.com/watch?v=abcdEFG1234"), "youtube");
  assert.equal(youtubeEmbedSrc("https://www.youtube.com/watch?v=abcdEFG1234"), "https://www.youtube-nocookie.com/embed/abcdEFG1234");
  assert.equal(mediaKind("https://vimeo.com/123456789"), "vimeo");
  assert.equal(vimeoEmbedSrc("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(mediaKind("https://docs.google.com/file/d/x"), "link");
  assert.equal(mediaKind(null), null);
});
