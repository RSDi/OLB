// Hotel stays (0135): who a stay covers, status words, siblings, form clean-up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanHotelStayInput,
  cleanStayPlayerMark,
  indexStayRows,
  siblingsOnStay,
  STAY_ELSEWHERE_NOTE_REQUIRED,
  stayAppliesTo,
  stayDoneWord,
  stayFilterLabel,
  stayMissingWord,
  stayStateFor,
  stayWaivedWord,
  type HotelStayInput,
  type StaySiblingPlayer,
} from "../../lib/hs-hotel-stays/logic.ts";
import type { HotelStayPlayer } from "../../lib/hs-hotel-stays/types.ts";

const base: HotelStayInput = {
  weekendId: "w1",
  hotelContactId: "h1",
  name: "Regionals",
  teamIds: null,
  bookingInstructions: "",
  bookingUrl: "",
  bookingCode: "",
  cutoffOn: "",
  rateNotes: "",
  status: "open",
};

function row(playerId: string, stayId: string, status: "done" | "waived"): HotelStayPlayer {
  return {
    stay_id: stayId,
    player_id: playerId,
    status,
    completed_on: "2026-10-14",
    note: null,
    marked_by: null,
    updated_at: "2026-10-14T12:00:00Z",
  };
}

test("stay status words: booked in block, staying elsewhere, not yet known", () => {
  assert.equal(stayDoneWord(), "Booked in block");
  assert.equal(stayWaivedWord(), "Staying elsewhere");
  assert.equal(stayMissingWord(), "Not yet known");
});

test("a stay with no teams covers everyone", () => {
  assert.equal(stayAppliesTo({ team_ids: null }, { team_id: "t1" }), true);
  assert.equal(stayAppliesTo({ team_ids: [] }, { team_id: null }), true);
});

test("a team-scoped stay covers only those teams", () => {
  assert.equal(stayAppliesTo({ team_ids: ["t1", "t2"] }, { team_id: "t2" }), true);
  assert.equal(stayAppliesTo({ team_ids: ["t1"] }, { team_id: "t3" }), false);
  assert.equal(stayAppliesTo({ team_ids: ["t1"] }, { team_id: null }), false);
});

test("player state on a stay: booked, waived, missing or n/a", () => {
  const rows = indexStayRows([row("p1", "s1", "done"), row("p2", "s1", "waived")]);
  const stay = { id: "s1", team_ids: null };
  assert.equal(stayStateFor({ id: "p1", team_id: null }, stay, rows), "done");
  assert.equal(stayStateFor({ id: "p2", team_id: null }, stay, rows), "waived");
  assert.equal(stayStateFor({ id: "p3", team_id: null }, stay, rows), "missing");
  assert.equal(stayStateFor({ id: "p1", team_id: "t9" }, { id: "s1", team_ids: ["t1"] }, rows), "n/a");
});

test("filter label names the stay, hotel and dates", () => {
  assert.equal(
    stayFilterLabel({
      name: "Regionals",
      hotel_name: "Hampton Inn",
      weekend_starts_on: "2026-03-12",
      weekend_ends_on: "2026-03-14",
    }),
    "Regionals · Hampton Inn · Mar 12–14"
  );
});

test("cleans a regionals stay", () => {
  const c = cleanHotelStayInput({
    ...base,
    name: "  Regionals ",
    bookingInstructions: "  Use the link  ",
    bookingUrl: "https://example.com/book",
    bookingCode: "OLB26",
    cutoffOn: "2026-02-01",
  });
  assert.ok(!("error" in c));
  assert.equal(c.name, "Regionals");
  assert.equal(c.booking_instructions, "Use the link");
  assert.equal(c.booking_url, "https://example.com/book");
  assert.equal(c.booking_code, "OLB26");
  assert.equal(c.cutoff_on, "2026-02-01");
  assert.equal(c.team_ids, null);
});

test("rejects a booking link without http", () => {
  assert.ok("error" in cleanHotelStayInput({ ...base, bookingUrl: "example.com" }));
});

test("rejects empty team list when not all players", () => {
  assert.ok("error" in cleanHotelStayInput({ ...base, teamIds: [] }));
});

test("nationals can scope to some teams", () => {
  const c = cleanHotelStayInput({ ...base, name: "Nationals", teamIds: ["t1", "t1", "t2"] });
  assert.ok(!("error" in c));
  assert.deepEqual(c.team_ids, ["t1", "t2"]);
});

test("Booked in block allows an empty note", () => {
  const c = cleanStayPlayerMark({ status: "done", completedOn: "2026-10-16", note: "  " });
  assert.ok(!("error" in c));
  assert.equal(c.note, null);
  assert.equal(c.status, "done");
});

test("Staying elsewhere requires a non-blank note", () => {
  const blank = cleanStayPlayerMark({ status: "waived", completedOn: "2026-10-16", note: "   " });
  assert.ok("error" in blank);
  assert.equal(blank.error, STAY_ELSEWHERE_NOTE_REQUIRED);
  const ok = cleanStayPlayerMark({ status: "waived", completedOn: "2026-10-16", note: " staying with family " });
  assert.ok(!("error" in ok));
  assert.equal(ok.note, "staying with family");
});

function sibling(
  id: string,
  name: string,
  parentIds: string[],
  teamId: string | null = "t1"
): StaySiblingPlayer {
  return { id, full_name: name, team_id: teamId, parent_ids: parentIds };
}

test("siblings on a stay share a parent and are covered by the stay", () => {
  const players = [
    sibling("p1", "Alex Smith", ["mom"]),
    sibling("p2", "Maya Smith", ["mom"]),
    sibling("p3", "Sam Jones", ["dad"]),
  ];
  const found = siblingsOnStay("p1", { team_ids: null }, players);
  assert.deepEqual(
    found.map((p) => p.id),
    ["p2"]
  );
});

test("a player with no siblings on the stay returns none", () => {
  const players = [sibling("p1", "Alex Smith", ["mom"]), sibling("p2", "Sam Jones", ["dad"])];
  assert.deepEqual(siblingsOnStay("p1", { team_ids: null }, players), []);
});

test("a player with no parents has no siblings", () => {
  const players = [sibling("p1", "Alex Smith", []), sibling("p2", "Maya Smith", ["mom"])];
  assert.deepEqual(siblingsOnStay("p1", { team_ids: null }, players), []);
});

test("a team-scoped stay drops siblings who aren't on those teams", () => {
  const players = [
    sibling("p1", "Alex Smith", ["mom"], "t1"),
    sibling("p2", "Maya Smith", ["mom"], "t2"),
  ];
  assert.deepEqual(siblingsOnStay("p1", { team_ids: ["t1"] }, players), []);
  assert.equal(siblingsOnStay("p1", { team_ids: ["t1", "t2"] }, players)[0]?.id, "p2");
});

test("blended families only include kids who share a parent", () => {
  const players = [
    sibling("a", "A", ["mom"]),
    sibling("b", "B", ["mom", "dad"]),
    sibling("c", "C", ["dad"]),
  ];
  assert.deepEqual(
    siblingsOnStay("a", { team_ids: null }, players).map((p) => p.id),
    ["b"]
  );
  assert.deepEqual(
    siblingsOnStay("b", { team_ids: null }, players).map((p) => p.id),
    ["a", "c"]
  );
});

test("siblings are listed by name", () => {
  const players = [
    sibling("p1", "Alex", ["mom"]),
    sibling("p3", "Zoe", ["mom"]),
    sibling("p2", "Maya", ["mom"]),
  ];
  assert.deepEqual(
    siblingsOnStay("p1", { team_ids: null }, players).map((p) => p.full_name),
    ["Maya", "Zoe"]
  );
});
