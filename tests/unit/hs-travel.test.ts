// Where to stay and eat on a weekend away (lib/hs-schedule/travel.ts): the
// hotels and places to eat near a weekend's place, by city or by tag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeKey, placesNear, travelKind, weekendCity, type TravelPlace } from "../../lib/hs-schedule/travel.ts";

function place(over: Partial<TravelPlace> & { id: string; name: string }): TravelPlace {
  return {
    kind: "hotel",
    city: null,
    state: null,
    website: null,
    phone: null,
    email: null,
    notes: null,
    tags: [],
    people: [],
    ...over,
  };
}

const PLACES = [
  place({ id: "sb", name: "Staybridge Suites Ankeny", city: "Ankeny", state: "IA", tags: ["des moines"] }),
  place({ id: "hie", name: "Holiday Inn Express Ankeny", city: "Ankeny", state: "IA", tags: ["Des Moines"] }),
  place({ id: "jb", name: "Jethro's BBQ Ankeny", kind: "food", city: "Ankeny", state: "IA", tags: ["des moines"] }),
  place({ id: "wof", name: "Who's On First", kind: "food", tags: ["des moines", "closed"] }),
  place({ id: "dm", name: "Downtown Des Moines Hotel", city: "Des Moines", state: "IA", tags: ["favorite"] }),
  place({ id: "ind", name: "Holiday Inn Express Independence", city: "Independence", state: "MO", tags: ["kansas city", "favorite"] }),
  place({ id: "op", name: "Staybridge Suites Overland Park", city: "Overland Park", state: "KS", tags: ["kansas city"] }),
  place({ id: "hgi", name: "Hilton Garden Inn Wichita Airport", city: "Wichita", state: "KS" }),
];

const ids = (near: ReturnType<typeof placesNear>) => (near ? [...near.hotels, ...near.food].map((p) => p.id) : []);

test("a weekend's city comes from its Where", () => {
  assert.equal(weekendCity("Des Moines, IA"), "Des Moines");
  assert.equal(weekendCity("Des Moines"), "Des Moines");
  assert.equal(weekendCity("  "), null);
  assert.equal(weekendCity(null), null);
  assert.equal(placeKey("Who's  On First."), "whos on first");
});

test("places show by their city or a tag with the weekend's city", () => {
  // Des Moines: the one in town first, then the Ankeny ones tagged des moines;
  // the closed restaurant stays off.
  const dm = placesNear("Des Moines, IA", PLACES)!;
  assert.equal(dm.city, "Des Moines");
  assert.deepEqual(dm.hotels.map((p) => p.id), ["dm", "hie", "sb"]);
  assert.deepEqual(dm.food.map((p) => p.id), ["jb"]);
  // Ankeny: by city. Another tag ("favorite") doesn't pull in other places.
  assert.deepEqual(ids(placesNear("Ankeny, IA", PLACES)), ["hie", "sb", "jb"]);
  // Kansas City: both tagged; Overland Park: just the one there.
  assert.deepEqual(ids(placesNear("Kansas City, MO", PLACES)), ["ind", "op"]);
  assert.deepEqual(ids(placesNear("Overland Park, KS", PLACES)), ["op"]);
  assert.deepEqual(ids(placesNear("Wichita, KS", PLACES)), ["hgi"]);
  // Nothing saved there, or no place at all.
  assert.equal(placesNear("Hastings, NE", PLACES), null);
  assert.equal(placesNear(null, PLACES), null);
});

test("places with notes come first, ahead of the ones in town", () => {
  const withNotes = [...PLACES, place({ id: "wdm", name: "Hampton Inn West Des Moines", city: "West Des Moines", tags: ["des moines"], notes: "Block of 12 at $119." })];
  assert.deepEqual(placesNear("Des Moines, IA", withNotes)!.hotels.map((p) => p.id), ["wdm", "dm", "hie", "sb"]);
});

test("the Hotels and Food types, by the names people give them", () => {
  assert.equal(travelKind("Hotels"), "hotel");
  assert.equal(travelKind(" lodging "), "hotel");
  assert.equal(travelKind("Food"), "food");
  assert.equal(travelKind("Restaurants"), "food");
  assert.equal(travelKind("Programs"), null);
  assert.equal(travelKind(null), null);
});
