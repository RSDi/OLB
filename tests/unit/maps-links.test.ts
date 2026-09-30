// Apple / Google Maps links for an address (lib/maps/links.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { appleMapsUrl, googleMapsUrl, mapQuery } from "../../lib/maps/links.ts";

test("a multi-line address becomes one comma-separated line", () => {
  assert.equal(mapQuery("11628 Farnam St\nOmaha, NE 68154"), "11628 Farnam St, Omaha, NE 68154");
  assert.equal(mapQuery("  1 Main St,\r\n\r\n  Lincoln,  NE  "), "1 Main St, Lincoln, NE");
});

test("each map app gets the address as its search", () => {
  const addr = "11628 Farnam St, Omaha, NE 68154";
  assert.equal(appleMapsUrl(addr), "https://maps.apple.com/?q=11628%20Farnam%20St%2C%20Omaha%2C%20NE%2068154");
  assert.equal(
    googleMapsUrl(addr),
    "https://www.google.com/maps/search/?api=1&query=11628%20Farnam%20St%2C%20Omaha%2C%20NE%2068154",
  );
  assert.match(googleMapsUrl("12 Oak & Elm #3"), /query=12%20Oak%20%26%20Elm%20%233$/);
});
