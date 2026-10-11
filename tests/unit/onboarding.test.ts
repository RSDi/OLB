// The registration workflow (0130): the switches, the email words, the
// family checklist, the registration form's extra questions, uniform counts
// and charges, the Venmo statement, and the waitlist form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanModes, cleanSettings, defaultSettings, modeOf } from "../../lib/onboarding/automations.ts";
import { WORKFLOW_EMAILS, cleanWords, fill, wordsFor } from "../../lib/onboarding/email-text.ts";
import { addDays, daysBetween, longDay, weekOf, weekday } from "../../lib/onboarding/dates.ts";
import { buildChecklist, itemsText, openItems, statusDots, type ChecklistInput } from "../../lib/onboarding/checklist.ts";
import { cleanInputExtras, emptyExtras, extrasProblem, inputExtras, itemsFor, needsSizesStep, type FormExtras } from "../../lib/onboarding/form-extras.ts";
import { chargePlan, countSizes, orderCsv, parseSizes } from "../../lib/onboarding/uniforms.ts";
import { alreadyRecorded, matchPlayers, parseVenmoCsv, venmoAmount, venmoReference } from "../../lib/onboarding/venmo.ts";
import { emptyWaitlist, intakeOf, waitlistProblem } from "../../lib/onboarding/waitlist-form.ts";
import { FEE_TIERS, newKid } from "../../lib/teams/registration-form.ts";

test("nothing sends unless the workflow is on, not paused, and the email's switch is on or ask", () => {
  const s = { ...defaultSettings("b"), modes: { welcome: "on" as const, open_items: "ask" as const } };
  assert.equal(modeOf(s, "welcome"), "off"); // workflow off
  s.enabled = true;
  assert.equal(modeOf(s, "welcome"), "on");
  assert.equal(modeOf(s, "open_items"), "ask");
  assert.equal(modeOf(s, "countdown"), "off"); // no switch set
  s.paused = true;
  assert.equal(modeOf(s, "welcome"), "off");
  assert.equal(modeOf(null, "welcome"), "off");
});

test("settings are checked before saving", () => {
  assert.deepEqual(cleanModes({ welcome: "on", bogus: "on", countdown: "loud", open_items: "off" }), { welcome: "on" });
  const ok = cleanSettings({ enabled: true, offer_days: 5, handbook_url: " https://drive.google.com/x ", first_practice_on: "2026-09-28", parent_meeting: "" });
  assert.ok(!("error" in ok));
  if (!("error" in ok)) {
    assert.equal(ok.handbook_url, "https://drive.google.com/x");
    assert.equal(ok.parent_meeting, null);
    assert.equal(ok.enabled, true);
  }
  assert.ok("error" in cleanSettings({ slack_invite_url: "join.slack.com/abc" }));
  assert.ok("error" in cleanSettings({ first_practice_on: "Sept 28" }));
  assert.ok("error" in cleanSettings({ offer_days: 1 }));
});

test("email words fill in, and a line with nothing to fill is dropped", () => {
  const out = fill("Hi {parent},\n\n{meeting}\n{practice}\n\nBye", { parent: "Megan", meeting: "", practice: "First practice: Monday" });
  assert.equal(out, "Hi Megan,\n\nFirst practice: Monday\n\nBye");
  assert.equal(fill("Hi {Parent}", { parent: "Jo" }), "Hi Jo");
  // Saved words win; the originals otherwise.
  assert.equal(wordsFor("welcome", { "welcome.subject": "Welcome!" }).subject, "Welcome!");
  assert.equal(wordsFor("welcome", {}).subject, WORKFLOW_EMAILS.find((e) => e.key === "welcome")!.subject);
  // The original again means no saved change.
  const original = WORKFLOW_EMAILS.find((e) => e.key === "offer")!;
  assert.deepEqual(cleanWords("offer.subject", original.subject), { key: "offer.subject", value: null });
  assert.ok("error" in cleanWords("nope.subject", "x"));
  assert.ok("error" in cleanWords("offer.body", "   "));
  // Every email the workflow writes has both parts and its tokens in use.
  for (const e of WORKFLOW_EMAILS) {
    assert.ok(e.subject && e.body, e.key);
    for (const t of e.tokens) assert.ok(e.subject.includes(`{${t}}`) || e.body.includes(`{${t}}`), `${e.key} lists {${t}} but doesn't use it`);
  }
});

test("dates count in whole days, and a week starts on Monday", () => {
  assert.equal(addDays("2026-09-28", -10), "2026-09-18");
  assert.equal(daysBetween("2026-09-18", "2026-09-28"), 10);
  assert.equal(weekday("2026-10-12"), 1); // a Monday
  assert.equal(weekOf("2026-10-11"), "2026-10-05"); // Sunday belongs to the week before
  assert.equal(weekOf("2026-10-14"), "2026-10-12");
  assert.equal(longDay("2026-09-28"), "Monday, Sep 28");
});

const base: ChecklistInput = {
  registeredOn: "2026-07-23",
  players: [{ first: "Eli", status: "approved", team: null, handbookSigned: true, sizesNeeded: 2, sizesIn: 2 }],
  balanceCents: 37500,
  expectedCents: 37500,
  slackJoined: false,
  slackUrl: "https://join.slack.com/x",
  handbookUrl: "https://drive.google.com/h",
  parentMeeting: "7pm in the gym",
  parentMeetingOn: "2026-09-21",
  firstPracticeOn: "2026-09-28",
  tryOn: "Sep 14",
  venmo: "@OmahaLightning-Basketball",
};

test("the checklist lists what's done and what's left", () => {
  const items = buildChecklist(base);
  const open = openItems(items).map((i) => i.key);
  assert.deepEqual(open, ["fee", "slack"]);
  assert.equal(itemsText(openItems(items)), "• Pay $375\n• Join Slack");
  assert.deepEqual(statusDots(items), { fee: false, handbook: true, slack: false, sizes: true });
  assert.equal(items.find((i) => i.key === "slack")!.link!.href, "https://join.slack.com/x");

  const done = buildChecklist({ ...base, balanceCents: 0, slackJoined: true, players: [{ ...base.players[0], team: "10u Black" }] });
  assert.deepEqual(openItems(done), []);
  assert.equal(done.find((i) => i.key === "team")!.detail, "Eli: 10u Black");
});

test("before approval, money and Slack aren't asked for yet, but the handbook is", () => {
  const items = buildChecklist({ ...base, balanceCents: null, players: [{ ...base.players[0], status: "pending", handbookSigned: false }] });
  assert.deepEqual(openItems(items).map((i) => i.key), ["handbook"]);
  assert.equal(items.find((i) => i.key === "approved")!.done, false);
  assert.equal(items.find((i) => i.key === "fee")!.label, "Pay $375");
});

const config: FormExtras = {
  handbookUrl: "https://drive.google.com/h",
  tryOn: null,
  items: [
    { id: "j", name: "Jersey", who: "all", price_cents: 6000, sizes: ["YM", "YL"] },
    { id: "g", name: "Grays", who: "hs", price_cents: 5000, sizes: ["AM", "AL"] },
    { id: "w", name: "Warm-up", who: "optional", price_cents: null, sizes: ["YM", "YL"] },
  ],
};

test("players are sized for what they need, and sign the handbook", () => {
  const kid = newKid({ athlete_first: "Eli", athlete_last: "M", needs_uniform: true, needs_grays: null, fee_tier: FEE_TIERS[0] });
  const hs = newKid({ athlete_first: "Sam", athlete_last: "M", needs_uniform: false, needs_grays: true, fee_tier: FEE_TIERS[2] });
  assert.deepEqual(itemsFor(kid, config.items).map((i) => i.id), ["j", "w"]);
  assert.deepEqual(itemsFor(hs, config.items).map((i) => i.id), ["g", "w"]);
  assert.ok(needsSizesStep([kid], config.items));

  let x = emptyExtras();
  assert.match(extrasProblem([kid], x, config) ?? "", /jersey size/);
  x = { ...x, kids: { [kid.key]: { handbook_player_name: "", sizes: { j: "YM" } } } };
  assert.match(extrasProblem([kid], x, config) ?? "", /sign the handbook/);
  x = { kids: { [kid.key]: { handbook_player_name: "Eli M", sizes: { j: "YM", g: "AM" } } }, family: { handbook_agreed: true, handbook_parent_name: "Megan M" } };
  assert.equal(extrasProblem([kid], x, config), null);
  assert.equal(extrasProblem([kid], emptyExtras(), null), null); // workflow off: nothing extra

  // Sizes for items that don't apply are dropped before saving.
  const sent = inputExtras(kid, x, config)!;
  assert.deepEqual(sent.sizes, { j: "YM" });
  const clean = cleanInputExtras(kid, sent, config);
  assert.ok(!("error" in clean));
  assert.ok("error" in cleanInputExtras(kid, { sizes: { j: "XXXL" }, handbook: sent.handbook }, config));
  assert.ok("error" in cleanInputExtras(kid, { sizes: { j: "YM" }, handbook: null }, config));
});

test("uniform sizes are counted, listed for the vendor and charged once", () => {
  assert.deepEqual(parseSizes(" ys, ym\nYL, ym "), ["YS", "YM", "YL"]);
  const rows = [
    { id: "1", item_id: "j", size: "YM", player: "Eli M", team: "10u", confirmed: true, charged: false },
    { id: "2", item_id: "j", size: "YM", player: "Ann B", team: "10u", confirmed: false, charged: false },
    { id: "3", item_id: "g", size: "AL", player: "Sam M", team: "HS", confirmed: false, charged: false },
  ];
  const t = countSizes(config.items, rows);
  assert.deepEqual(t.sizes, ["YM", "YL", "AM", "AL"]);
  assert.equal(t.rows[0].counts.YM, 2);
  assert.equal(t.rows[1].total, 1);
  assert.equal(orderCsv(config.items, rows).split("\n")[1], "Jersey,YM,Ann B,10u,");

  const plan = chargePlan(config.items, [
    { id: "a", item_id: "j", size: "YM", player_id: "p1", charge_id: null },
    { id: "b", item_id: "j", size: "YL", player_id: "p2", charge_id: "c1" }, // charged already
    { id: "c", item_id: "w", size: "YM", player_id: "p1", charge_id: null }, // no price yet
    { id: "d", item_id: "g", size: "AL", player_id: null, charge_id: null }, // not approved yet
  ]);
  assert.deepEqual(plan.charges, [{ size_id: "a", player_id: "p1", description: "Jersey (YM)", amount_cents: 6000 }]);
  assert.deepEqual(plan.noPrice, ["Warm-up"]);
  assert.equal(plan.notOnRoster, 1);
});

const STATEMENT = `Account Statement - (@OmahaLightning-Basketball) ,,,,,,,,
Account Activity,,,,,,,,
,ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (fee)
,4011,2026-07-24T14:22:01,Payment,Complete,"Eli Miller 10u",Megan Miller,Omaha Lightning,+ $375.00,
,4012,2026-07-25T09:00:00,Payment,Complete,Brooks boys reg,Jen Brooks,Omaha Lightning,"+ $1,150.00",
,4013,2026-07-25T10:00:00,Payment,Complete,refund,Omaha Lightning,Kim Tran,- $65.00,
,4014,2026-07-26T10:00:00,Standard Transfer,Issued,,,,- $900.00,
,4015,2026-07-27T10:00:00,Payment,Complete,"warmups, thanks!",Kim Tran,Omaha Lightning,+ $65.00,`;

test("a Venmo statement reads the money that came in and suggests whose it is", () => {
  assert.equal(venmoAmount("+ $1,150.00"), 115000);
  assert.equal(venmoAmount("- $65.00"), -6500);
  const { payments, error } = parseVenmoCsv(STATEMENT);
  assert.equal(error, undefined);
  assert.deepEqual(payments.map((p) => p.id), ["4011", "4012", "4015"]);
  assert.equal(payments[0].date, "2026-07-24");
  assert.equal(payments[2].note, "warmups, thanks!");

  const players = [
    { id: "eli", full_name: "Eli Miller" },
    { id: "max", full_name: "Max Brooks" },
    { id: "leo", full_name: "Leo Brooks" },
    { id: "ann", full_name: "Ann Tran" },
  ];
  assert.deepEqual(matchPlayers(payments[0], players), ["eli"]);
  assert.deepEqual(matchPlayers(payments[1], players), ["max", "leo"]);
  assert.deepEqual(matchPlayers(payments[2], players), []); // can't tell: the Treasurer picks
  assert.ok(parseVenmoCsv("hello").error);

  const ref = venmoReference(payments[0]);
  assert.equal(ref, "Venmo 4011: Eli Miller 10u");
  assert.ok(alreadyRecorded(payments[0], [ref]));
  assert.ok(!alreadyRecorded({ id: "401" }, [ref]));
});

test("the waitlist form asks what Rachel asks", () => {
  const w = emptyWaitlist();
  assert.match(waitlistProblem(w) ?? "", /son's first and last name/);
  Object.assign(w, { athlete_first: "Eli", athlete_last: "Miller", athlete_dob: "2016-03-04", homeschooled: true, parent_first: "Megan", parent_last: "Miller", email: "megan@example.com" });
  assert.match(waitlistProblem(w) ?? "", /played before/);
  w.experience = "Rec league";
  assert.equal(waitlistProblem(w), null);
  assert.deepEqual(intakeOf({ ...w, friends: "  the Garcias " }), { homeschooled: true, experience: "Rec league", friends: "the Garcias", heard_from: "", notes: "" });
});
