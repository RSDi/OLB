// Unit tests for how sync turns Slack's <...> tokens into message_text, and
// for spotting saved messages whose channel mentions still lack a name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayNeedChannelNames, repairedMessageText, resolveMentions, type MentionLookups } from "../../lib/slack-archive/mentions.ts";

const CHANNELS: Record<string, { name: string; isPrivate: boolean }> = {
  C0ROSTERS: { name: "elementary_rosters", isPrivate: false },
  C0GENERAL: { name: "general", isPrivate: false },
  G0BOARD: { name: "board-discipline", isPrivate: true },
};
const HIDDEN = new Set(["G0SECRET"]);

function lookups(calls: string[] = []): MentionLookups {
  return {
    resolveUserId: async (id) => ({ author_name: id === "U0JEFF" ? "Jeff_Malone" : null }),
    resolveChannelName: async (id) => {
      calls.push(id);
      if (CHANNELS[id]) return CHANNELS[id];
      if (HIDDEN.has(id)) return { hidden: true };
      return { failed: "ratelimited" };
    },
  };
}

const resolve = (text: string, calls?: string[], inChannel = "C0GENERAL") => resolveMentions(text, lookups(calls), inChannel);

test("a channel mention without a name gets the channel's name", async () => {
  assert.equal(
    await resolve("Please join the <#C0ROSTERS> channel to see the rosters! <!channel>"),
    "Please join the #elementary\\_rosters channel to see the rosters! @channel",
  );
  assert.equal(await resolve("See <#C0GENERAL|>"), "See #general");
});

test("a channel is shown by its current name, and by the name Slack sent when the lookup fails", async () => {
  assert.equal(await resolve("In <#C0GENERAL|old-name>"), "In #general");
  assert.equal(await resolve("In <#C0MISSING|announcements>"), "In #announcements");
});

test("a private channel is named only in its own messages", async () => {
  assert.equal(await resolve("Minutes are in <#G0BOARD> and <#G0BOARD|board-discipline>"), "Minutes are in #private-channel and #private-channel");
  assert.equal(await resolve("Minutes are in <#G0BOARD>", [], "G0BOARD"), "Minutes are in #board-discipline");
});

test("a channel the bot can't see reads as a private channel; a failed lookup as #channel", async () => {
  assert.equal(await resolve("<#G0SECRET> <#G0SECRET|secret-plans> and <#C0MISSING>"), "#private-channel #private-channel and #channel");
});

test("a mention repeated in one message is looked up once and replaced everywhere", async () => {
  const calls: string[] = [];
  assert.equal(await resolve("<#C0GENERAL> or <#C0GENERAL>", calls), "#general or #general");
  assert.deepEqual(calls, ["C0GENERAL"]);
});

test("people, broadcasts, groups and links still resolve as before; email links keep their address", async () => {
  assert.equal(
    await resolve("<@U0JEFF> <@U0NOBODY|bob> <!here> <!subteam^S1|@coaches> <https://example.com|the *plan*> <https://example.com/x> <mailto:first_last@b.co|first_last@b.co> <mailto:coach@b.co|Email me>"),
    "@Jeff\\_Malone @bob @here @coaches [the \\*plan\\*](https://example.com) https://example.com/x [first\\_last@b.co](mailto:first_last@b.co) [Email me](mailto:coach@b.co)",
  );
});

test("spots saved text that still reads the old way", () => {
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #channel now"), true);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS|> now", "Join # now"), true);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS>", "Join #channel"), true);
  // An empty-name mention whose lookup failed was saved as "#channel".
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS|> now", "Join #channel now"), true);
  assert.equal(mayNeedChannelNames("Send the # of players to <#C0ROSTERS|>", "Send the # of players to #"), true);
});

test("leaves alone text that already has the name, or never had an unnamed mention", () => {
  assert.equal(mayNeedChannelNames("Send the # of players to <#C0ROSTERS>", "Send the # of players to #general"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #elementary\\_rosters now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #private-channel now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS> now", "Join #channel-updates now"), false);
  assert.equal(mayNeedChannelNames("Join <#C0GENERAL|general>", "Join #channel"), false);
  assert.equal(mayNeedChannelNames("We're #1", "We're #1"), false);
  assert.equal(mayNeedChannelNames("Send the # of players to <#C0ROSTERS|>", "Send the # of players to #rosters"), false);
  assert.equal(mayNeedChannelNames("Say #channel in <#C0ROSTERS>", "Say #channel in #rosters"), false);
  assert.equal(mayNeedChannelNames("Join <#C0ROSTERS>", "Join #channel\\_updates"), false);
});

test("a repair rewrites saved text with the channel's name", async () => {
  assert.equal(
    await repairedMessageText("<@U0JEFF> join <#C0ROSTERS>", "@Jeff\\_Malone join #channel", lookups(), "C0GENERAL"),
    "@Jeff\\_Malone join #elementary\\_rosters",
  );
});

test("a repair never makes a message read worse", async () => {
  // A channel lookup failed: it would still read "#channel", so leave it.
  assert.equal(await repairedMessageText("<#C0GENERAL> and <#C0MISSING>", "#channel and #channel", lookups(), "C0GENERAL"), null);
  // A person's name came back missing: keep the name the saved text has.
  assert.equal(await repairedMessageText("<@U0GONE> join <#C0ROSTERS>", "@Pat join #channel", lookups(), "C0GENERAL"), null);
  // Nothing to change.
  assert.equal(await repairedMessageText("join <#C0GENERAL>", "join #general", lookups(), "C0GENERAL"), null);
});

test("a repair still goes ahead when the person never had a name", async () => {
  assert.equal(await repairedMessageText("<@U0GONE> join <#C0ROSTERS>", "@someone join #channel", lookups(), "C0GENERAL"), "@someone join #elementary\\_rosters");
});
