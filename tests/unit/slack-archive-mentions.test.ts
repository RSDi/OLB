// Unit tests for how sync turns Slack's <...> tokens into message_text, and
// for spotting saved messages whose channel mentions still lack a name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayNeedChannelNames, resolveMentions, type MentionLookups } from "../../lib/slack-archive/mentions.ts";

const CHANNELS: Record<string, string> = { C0ROSTERS: "elementary_rosters", C0GENERAL: "general" };
const HIDDEN = new Set(["G0SECRET"]);

function lookups(calls: string[] = []): MentionLookups {
  return {
    resolveUserId: async (id) => ({ author_name: id === "U0JEFF" ? "Jeff_Malone" : null }),
    resolveChannelName: async (id) => {
      calls.push(id);
      if (CHANNELS[id]) return { name: CHANNELS[id] };
      if (HIDDEN.has(id)) return { hidden: true };
      return { failed: "ratelimited" };
    },
  };
}

test("a channel mention without a name gets the channel's name", async () => {
  assert.equal(
    await resolveMentions("Please join the <#C0ROSTERS> channel to see the rosters! <!channel>", lookups()),
    "Please join the #elementary\\_rosters channel to see the rosters! @channel",
  );
  assert.equal(await resolveMentions("See <#C0GENERAL|>", lookups()), "See #general");
});

test("a name Slack sends is kept, without a lookup", async () => {
  const calls: string[] = [];
  assert.equal(await resolveMentions("In <#C0GENERAL|old-name>", lookups(calls)), "In #old-name");
  assert.deepEqual(calls, []);
});

test("a channel the bot can't see reads as a private channel; a failed lookup as #channel", async () => {
  assert.equal(await resolveMentions("<#G0SECRET> and <#C0MISSING>", lookups()), "#private-channel and #channel");
});

test("a mention repeated in one message is looked up once and replaced everywhere", async () => {
  const calls: string[] = [];
  assert.equal(await resolveMentions("<#C0GENERAL> or <#C0GENERAL>", lookups(calls)), "#general or #general");
  assert.deepEqual(calls, ["C0GENERAL"]);
});

test("people, broadcasts, groups and links still resolve as before", async () => {
  assert.equal(
    await resolveMentions("<@U0JEFF> <@U0NOBODY|bob> <!here> <!subteam^S1|@coaches> <https://example.com|the *plan*> <https://example.com/x> <mailto:a@b.co|a@b.co>", lookups()),
    "@Jeff\\_Malone @bob @here @coaches [the \\*plan\\*](https://example.com) https://example.com/x a@b.co",
  );
});

test("spots saved text that still reads the old way", () => {
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #channel now"), true);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS|> now", "Join # now"), true);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS>", "Join #channel"), true);
});

test("leaves alone text that already has the name, or never had an unnamed mention", () => {
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #elementary\\_rosters now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #private-channel now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #channel-updates now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0GENERAL|general>", "Join #channel"), false);
  assert.equal(mayNeedChannelNames("We're #1", "We're #1"), false);
});
