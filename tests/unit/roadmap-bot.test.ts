// The Product Manager bot's roadmap route (lib/roadmap/bot.ts): Bearer
// token, the proposed-only lock, and the same title/area checks as the form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { botInsertFields, cleanBotRoadmapItem, roadmapBotAuthorized } from "../../lib/roadmap/bot.ts";

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
