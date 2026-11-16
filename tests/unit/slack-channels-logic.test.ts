import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelsForFamily,
  cleanChannelList,
  inviteDone,
  inviteErrorWords,
  STOP_ERRORS,
  teamChannelId,
} from "../../lib/onboarding/slack-channels-logic.ts";

test("cleanChannelList keeps real channels once, and strips #", () => {
  assert.deepEqual(
    cleanChannelList([
      { id: "C0123456789", name: "#lightning-family" },
      { id: "C0123456789", name: "again" },
      { id: "nope", name: "bad" },
      { id: "G0123456789" },
      null,
    ]),
    [
      { id: "C0123456789", name: "lightning-family" },
      { id: "G0123456789", name: "G0123456789" },
    ]
  );
  assert.deepEqual(cleanChannelList("x"), []);
});

test("teamChannelId prefers the team's own channel, then film's", () => {
  assert.equal(teamChannelId({ slack_channel_id: " C1111111111 ", film_slack_channel_id: "C2222222222" }), "C1111111111");
  assert.equal(teamChannelId({ slack_channel_id: "", film_slack_channel_id: "C2222222222" }), "C2222222222");
  assert.equal(teamChannelId({ slack_channel_id: null, film_slack_channel_id: null }), null);
});

test("channelsForFamily: team channels first, then everyone's, no repeats", () => {
  const everyone = [
    { id: "CFAM0000000", name: "lightning-family" },
    { id: "CPIX0000000", name: "photos-videos" },
  ];
  const teams = new Map([
    ["t1", { id: "C12U0000000", name: "12U Gold" }],
    ["t2", { id: "CFAM0000000", name: "same as family" }],
  ]);
  assert.deepEqual(
    channelsForFamily(everyone, teams, ["t1", null, "t1", "t2", "t3"]).map((c) => c.id),
    ["C12U0000000", "CFAM0000000", "CPIX0000000"]
  );
  assert.deepEqual(channelsForFamily([], new Map(), [null]), []);
});

test("invite answers", () => {
  assert.equal(inviteDone("already_in_channel"), true);
  assert.equal(inviteDone("not_in_channel"), false);
  assert.ok(STOP_ERRORS.has("missing_scope"));
  assert.match(inviteErrorWords("not_in_channel", "12u-gold"), /isn't in #12u-gold/);
  assert.match(inviteErrorWords("missing_scope", "x"), /Reinstall/);
  assert.match(inviteErrorWords("weird_thing", "x"), /weird_thing/);
});
