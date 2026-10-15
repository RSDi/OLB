// Hotel rooming-list parse + match (Staybridge Group Rooming List).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoomingListText, splitPersonName } from "../../lib/hotel-rooming-import/parse.ts";
import {
  buildMatchPlan,
  matchGuest,
  personKey,
  pickHotel,
  pickWeekend,
  scoreHotelName,
} from "../../lib/hotel-rooming-import/match.ts";

const fixture = readFileSync(join(import.meta.dirname, "../fixtures/staybridge-rooming-list.txt"), "utf8");

test("parses Staybridge Group Rooming List text", () => {
  const p = parseRoomingListText(fixture);
  assert.equal(p.format, "group_rooming_list");
  assert.match(p.hotelName ?? "", /Staybridge/i);
  assert.equal(p.groupCode, "MKCVL");
  assert.ok(p.guests.length >= 35);
  const amanda = p.guests.find((g) => g.firstName === "Amanda" && g.lastName === "Fisher");
  assert.ok(amanda);
  assert.equal(amanda!.confirmation, "68915684");
  assert.equal(amanda!.checkIn, "2027-02-18");
  assert.equal(amanda!.checkOut, "2027-02-20");
  assert.equal(amanda!.rate, 139);
});

test("splits glued ALLCAPS first names", () => {
  assert.deepEqual(splitPersonName("ANDREWSCOTT WEHRLI"), {
    firstName: "Andrew Scott",
    lastName: "Wehrli",
  });
});

test("scores hotel names with soft city match", () => {
  const hotels = [
    { id: "1", name: "Staybridge Suites Overland Park", city: "Overland Park" },
    { id: "2", name: "Hampton Inn Des Moines", city: "Des Moines" },
  ];
  assert.ok(scoreHotelName("Staybridge Suites Overland Park Kansas City Area", hotels[0]) >= 70);
  const pick = pickHotel("Staybridge Suites Overland Park Kansas City Area", hotels);
  assert.equal(pick.pick?.id, "1");
});

test("picks the overlapping weekend", () => {
  const weekends = [
    {
      id: "w1",
      seasonId: "s",
      season: 2026,
      event: "Regionals",
      startsOn: "2027-02-18",
      endsOn: "2027-02-20",
      location: "Overland Park",
    },
    {
      id: "w2",
      seasonId: "s",
      season: 2026,
      event: "Local",
      startsOn: "2027-01-08",
      endsOn: "2027-01-10",
      location: "Omaha",
    },
  ];
  const pick = pickWeekend("2027-02-18", "2027-02-20", weekends);
  assert.equal(pick.pick?.id, "w1");
  assert.ok(pick.score >= 90);
});

test("matches a parent name to their players", () => {
  const people = [
    { kind: "player" as const, id: "p1", name: "Sam Malone", playerIds: ["p1"], teamId: "t1" },
    { kind: "parent" as const, id: "m1", name: "Melanie Malone", playerIds: ["p1"], teamId: null },
  ];
  const g = matchGuest(
    {
      confirmation: "1",
      firstName: "Melanie",
      lastName: "Malone",
      checkIn: "2027-02-18",
      checkOut: "2027-02-20",
      roomType: null,
      rateCode: null,
      rate: null,
    },
    people
  );
  assert.equal(g.confidence, "exact");
  assert.deepEqual(g.playerIds, ["p1"]);
});

test("buildMatchPlan wires hotel, weekend and guests", () => {
  const parsed = parseRoomingListText(fixture);
  const plan = buildMatchPlan(
    parsed,
    [{ id: "h1", name: "Staybridge Suites Overland Park", city: "Overland Park" }],
    [
      {
        id: "w1",
        seasonId: "s",
        season: 2026,
        event: "Regionals",
        startsOn: "2027-02-18",
        endsOn: "2027-02-20",
        location: "KC",
      },
    ],
    [],
    [
      { kind: "parent", id: "m1", name: "Melanie Malone", playerIds: ["p1"], teamId: null },
      { kind: "player", id: "p1", name: "Sam Malone", playerIds: ["p1"], teamId: null },
    ]
  );
  assert.equal(plan.hotel.pick?.id, "h1");
  assert.equal(plan.weekend.pick?.id, "w1");
  assert.equal(plan.stay.willCreate, true);
  const mel = plan.guests.find((g) => personKey(g.displayName) === personKey("Melanie Malone"));
  assert.ok(mel);
  assert.deepEqual(mel!.playerIds, ["p1"]);
});

test("parses a simple CSV export", () => {
  const csv = [
    "confirmation,first_name,last_name,check_in,check_out,room_type,rate",
    "111,Jane,Doe,2027-02-18,2027-02-20,O2ON,139",
  ].join("\n");
  const p = parseRoomingListText(csv);
  assert.equal(p.format, "csv");
  assert.equal(p.guests.length, 1);
  assert.equal(p.guests[0].lastName, "Doe");
});
