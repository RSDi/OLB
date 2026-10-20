// The Product Manager bot's roadmap route (lib/roadmap/bot.ts): Bearer
// token, the proposed-only lock, and the same title/area checks as the form.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_ACTOR,
  botInsertFields,
  botListItem,
  botListStatusFilter,
  botPatchEvent,
  botPatchFields,
  botPatchUpdated,
  botStatusStep,
  cleanBotNote,
  cleanBotRoadmapItem,
  cleanBotStatusPatch,
  roadmapBotAuthorized,
} from "../../lib/roadmap/bot.ts";

const TOKEN = "roadmap-bot-test-token-not-a-secret";

test("a matching Bearer token is accepted; anything else is not", () => {
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(roadmapBotAuthorized(`bearer ${TOKEN}`, TOKEN), false);
  assert.equal(roadmapBotAuthorized(TOKEN, TOKEN), false);
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN), false);
  assert.equal(roadmapBotAuthorized("Bearer ", TOKEN), false);
  assert.equal(roadmapBotAuthorized("", TOKEN), false);
  assert.equal(roadmapBotAuthorized(null, TOKEN), false);
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN}`, undefined), false);
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN}`, ""), false);
  assert.equal(roadmapBotAuthorized(`Bearer ${TOKEN}`, `${TOKEN}x`), false);
});

test("the bot always saves proposed with no date, even if a status is sent", () => {
  const body = {
    title: "  Push notifications ",
    description: "On your phone. ",
    area: "Portal",
    status: "released",
    releasedOn: "2026-10-16",
    released_on: "2026-10-16",
  };
  const row = cleanBotRoadmapItem(body);
  assert.deepEqual(row, {
    title: "Push notifications",
    description: "On your phone.",
    area: "Portal",
    status: "proposed",
    released_on: null,
    preview_url: null,
  });
  assert.ok(!("error" in row));
  assert.deepEqual(botInsertFields(row), {
    title: "Push notifications",
    description: "On your phone.",
    area: "Portal",
    status: "proposed",
    released_on: null,
  });
  for (const status of ["progress", "planned", "proposed", "done", ""]) {
    const again = cleanBotRoadmapItem({ ...body, status });
    assert.ok(!("error" in again) && again.status === "proposed" && again.released_on === null);
    assert.equal(botInsertFields(again).status, "proposed");
    assert.equal(botInsertFields(again).released_on, null);
  }
});

test("title, description and area use the form's checks; a missing object is a 400", () => {
  const ok = { title: "Clinic reminders", description: "", area: "Registration" };
  assert.ok(!("error" in cleanBotRoadmapItem(ok)));
  assert.deepEqual(cleanBotRoadmapItem({ ...ok, title: "   " }), { error: "Give it a title." });
  assert.deepEqual(cleanBotRoadmapItem({ ...ok, title: "x".repeat(121) }), {
    error: "Keep the title to 120 characters or fewer.",
  });
  assert.deepEqual(cleanBotRoadmapItem({ ...ok, description: "x".repeat(2001) }), {
    error: "Keep the description to 2000 characters or fewer.",
  });
  assert.deepEqual(cleanBotRoadmapItem({ ...ok, area: "Somewhere" }), { error: "Pick an area." });
  assert.deepEqual(cleanBotRoadmapItem({ ...ok, area: 1 }), { error: "Pick an area." });
  assert.deepEqual(cleanBotRoadmapItem({ title: 12, description: "", area: "Portal" }), { error: "Give it a title." });
  assert.deepEqual(cleanBotRoadmapItem(null), { error: "Send a JSON object with title, description, and area." });
  assert.deepEqual(cleanBotRoadmapItem(["Portal"]), { error: "Send a JSON object with title, description, and area." });
  assert.deepEqual(cleanBotRoadmapItem("item"), { error: "Send a JSON object with title, description, and area." });
});

test("PATCH accepts status, preview_url, and note; nothing else", () => {
  assert.deepEqual(cleanBotStatusPatch({ status: "planned" }), { status: "planned" });
  assert.deepEqual(cleanBotStatusPatch({ status: "parked" }), { status: "parked" });
  assert.deepEqual(cleanBotStatusPatch({ status: "preview", preview_url: "https://olb-git-preview.vercel.app" }), {
    status: "preview",
    preview_url: "https://olb-git-preview.vercel.app",
  });
  assert.deepEqual(cleanBotStatusPatch({ status: "parked", note: "  Waiting on the vendor.  " }), {
    status: "parked",
    note: "Waiting on the vendor.",
  });
  assert.deepEqual(cleanBotStatusPatch({ note: "Just a note" }), { note: "Just a note" });
  assert.deepEqual(cleanBotStatusPatch({ status: "planned", title: "Nope" }), {
    error: "The bot can only set status, preview_url, and note.",
  });
  assert.deepEqual(cleanBotStatusPatch({ status: "planned", released_on: "2026-10-16" }), {
    error: "The bot can only set status, preview_url, and note.",
  });
  assert.deepEqual(cleanBotStatusPatch({ status: "parked", deleted_at: "2026-10-19" }), {
    error: "The bot can only set status, preview_url, and note.",
  });
  assert.deepEqual(cleanBotStatusPatch({}), { error: "Send a status or a note." });
  assert.deepEqual(cleanBotStatusPatch({ note: "   " }), { error: "Send a status or a note." });
  assert.deepEqual(cleanBotStatusPatch({ status: "done" }), { error: "Pick a column." });
  assert.deepEqual(cleanBotStatusPatch({ status: "Parked" }), { error: "Pick a column." });
  assert.deepEqual(cleanBotStatusPatch({ status: 1 }), { error: "Pick a column." });
  assert.deepEqual(cleanBotStatusPatch(null), { error: "Send a JSON object with status or a note." });
});

test("a note is trimmed, capped, and must be text", () => {
  assert.deepEqual(cleanBotNote("  Hello  "), { note: "Hello" });
  assert.deepEqual(cleanBotNote("   "), {});
  assert.deepEqual(cleanBotNote(undefined), {});
  assert.deepEqual(cleanBotNote(12), { error: "The note has to be text." });
  assert.deepEqual(cleanBotNote("x".repeat(2001)), { error: "Keep the note to 2000 characters or fewer." });
  assert.ok(!("error" in cleanBotNote("x".repeat(2000))));
});

test("the bot may move to any column, including Parked, a skip, backwards, and the same column", () => {
  assert.deepEqual(botStatusStep("proposed", "planned"), { status: "planned" });
  assert.deepEqual(botStatusStep("planned", "progress"), { status: "progress" });
  assert.deepEqual(botStatusStep("progress", "preview"), { status: "preview" });
  assert.deepEqual(botStatusStep("preview", "released"), { status: "released" });
  assert.deepEqual(botStatusStep("proposed", "parked"), { status: "parked" });
  assert.deepEqual(botStatusStep("released", "parked"), { status: "parked" });
  assert.deepEqual(botStatusStep("parked", "planned"), { status: "planned" });
  assert.deepEqual(botStatusStep("proposed", "proposed"), { status: "proposed" });
  assert.deepEqual(botStatusStep("proposed", "progress"), { status: "progress" });
  assert.deepEqual(botStatusStep("progress", "planned"), { status: "planned" });
  assert.deepEqual(botStatusStep("released", "preview"), { status: "preview" });
  assert.deepEqual(botStatusStep("proposed", "released"), { status: "released" });
});

test("landing on preview needs a preview_url unless the card already has one; released sets the live day", () => {
  const now = new Date(2026, 9, 16);
  const current = { status: "progress" as const, preview_url: null, released_on: null };
  assert.deepEqual(botPatchFields(current, { status: "preview" }), { error: "Add the preview link." });
  assert.deepEqual(botPatchFields({ ...current, status: "parked" }, { status: "preview" }), {
    error: "Add the preview link.",
  });
  const preview = botPatchFields(current, { status: "preview", preview_url: "https://olb-git-preview.vercel.app" }, now);
  assert.deepEqual(preview, {
    status: "preview",
    preview_url: "https://olb-git-preview.vercel.app",
    released_on: null,
    updated_at: now.toISOString(),
  });
  const kept = botPatchFields(
    { status: "preview", preview_url: "https://olb-git-preview.vercel.app", released_on: null },
    { note: "Still in preview" },
    now,
  );
  assert.ok(!("error" in kept));
  assert.equal(kept.status, "preview");
  assert.equal(kept.preview_url, "https://olb-git-preview.vercel.app");
  const released = botPatchFields(
    { status: "preview", preview_url: "https://olb-git-preview.vercel.app", released_on: null },
    { status: "released" },
    now,
  );
  assert.ok(!("error" in released));
  assert.equal(released.status, "released");
  assert.equal(released.released_on, "2026-10-16");
  assert.equal(released.preview_url, "https://olb-git-preview.vercel.app");
  assert.equal(released.updated_at, now.toISOString());
  const parked = botPatchFields(
    { status: "released", preview_url: "https://olb-git-preview.vercel.app", released_on: "2026-10-09" },
    { status: "parked", note: "Not shipping this." },
    now,
  );
  assert.ok(!("error" in parked));
  assert.equal(parked.status, "parked");
  assert.equal(parked.released_on, null);
  const skip = botPatchFields(current, { status: "released" }, now);
  assert.ok(!("error" in skip));
  assert.equal(skip.status, "released");
  assert.equal(skip.released_on, "2026-10-16");
});

test("every bot PATCH logs who, from, to, note, and when", () => {
  const now = new Date(Date.UTC(2026, 9, 19, 18, 5, 0));
  assert.deepEqual(botPatchEvent("proposed", "parked", "Waiting on the vendor.", now), {
    actor: BOT_ACTOR,
    from_status: "proposed",
    to_status: "parked",
    note: "Waiting on the vendor.",
    created_at: now.toISOString(),
  });
  assert.deepEqual(botPatchEvent("planned", "planned", undefined, now), {
    actor: BOT_ACTOR,
    from_status: "planned",
    to_status: "planned",
    note: null,
    created_at: now.toISOString(),
  });
  assert.equal(BOT_ACTOR, "bot");
});

test("GET ?status= accepts a column and rejects anything else", () => {
  assert.deepEqual(botListStatusFilter(null), { status: null });
  assert.deepEqual(botListStatusFilter(""), { status: null });
  assert.deepEqual(botListStatusFilter("planned"), { status: "planned" });
  assert.deepEqual(botListStatusFilter("preview"), { status: "preview" });
  assert.deepEqual(botListStatusFilter("released"), { status: "released" });
  assert.deepEqual(botListStatusFilter("parked"), { status: "parked" });
  assert.deepEqual(botListStatusFilter("done"), { error: "Pick a column." });
});

test("GET items include approved_by_name and approved_at", () => {
  assert.deepEqual(
    botListItem({
      id: "b6a607ae-2798-4a33-aa41-6934c96623f0",
      title: "Push notifications",
      area: "Portal",
      status: "planned",
      approved_at: "2026-10-16T19:10:00.000Z",
      approver: { full_name: "Jeff Malone" },
    }),
    {
      id: "b6a607ae-2798-4a33-aa41-6934c96623f0",
      title: "Push notifications",
      area: "Portal",
      status: "planned",
      approved_by_name: "Jeff Malone",
      approved_at: "2026-10-16T19:10:00.000Z",
    },
  );
  assert.deepEqual(
    botListItem({
      id: "a",
      title: "Idea",
      area: "Website",
      status: "proposed",
      approved_at: null,
      approver: null,
    }),
    {
      id: "a",
      title: "Idea",
      area: "Website",
      status: "proposed",
      approved_by_name: null,
      approved_at: null,
    },
  );
});

test("PATCH row writes only status, preview_url, released_on, and updated_at", () => {
  const now = new Date(2026, 9, 19);
  const row = botPatchFields(
    { status: "proposed", preview_url: null, released_on: null },
    { status: "parked", note: "Waiting on the vendor." },
    now,
  );
  assert.ok(!("error" in row));
  assert.deepEqual(Object.keys(row).sort(), ["preview_url", "released_on", "status", "updated_at"]);
  assert.equal(row.status, "parked");
});

test("PATCH with 0 rows updated is a 409, not a 200", () => {
  assert.deepEqual(botPatchUpdated(null), { ok: false, status: 409, error: "That item could not be updated." });
  assert.deepEqual(botPatchUpdated([]), { ok: false, status: 409, error: "That item could not be updated." });
  const item = { id: "a", status: "preview" };
  assert.deepEqual(botPatchUpdated([item]), { ok: true, status: 200, item });
  assert.deepEqual(botPatchUpdated(item), { ok: true, status: 200, item });
});
