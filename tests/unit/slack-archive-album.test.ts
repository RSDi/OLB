// Unit tests for the Slack archive photo album's pure helpers — which
// attachments become album items, how duplicates and multi-photo posts are
// handled, month grouping in the church's timezone, and the search/filter
// rules the album page applies client-side.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ArchivedFile } from "../../lib/slack-archive/files.ts";
import {
  albumItemMatches,
  albumMediaHref,
  albumMediaKind,
  albumMonthOf,
  albumSearchText,
  albumUrlSearch,
  buildAlbumItems,
  groupAlbumByMonth,
  normalizeForSearch,
  orderAlbumItems,
  parseAlbumQuery,
  parseAlbumUrlState,
  showsInline,
  threadParentKey,
  thumbnailPathFor,
  type AlbumFilters,
  type AlbumSourceMessage,
  type AlbumThreadParent,
} from "../../lib/slack-archive/album.ts";

const TZ = "America/Chicago";

function file(id: string, name: string, mimetype: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    mimetype,
    size: 1000,
    storage_path: `C1/1700000000.000100/${id}-${name}`,
    permalink: null,
    error: null,
    ...overrides,
  };
}

function message(overrides: Partial<AlbumSourceMessage> & { id: string; ts: string }): AlbumSourceMessage {
  return {
    channel_id: "C1",
    thread_ts: null,
    author_name: "Jeff Malone",
    message_text: "",
    posted_at: new Date(parseFloat(overrides.ts) * 1000).toISOString(),
    files: [],
    ...overrides,
  };
}

const noParents = new Map<string, AlbumThreadParent>();
const noFilters: AlbumFilters = { terms: [], kind: null, channelIds: [], people: [] };

test("albumMediaKind: mimetype wins, extension is the fallback", () => {
  assert.equal(albumMediaKind({ mimetype: "image/jpeg", name: "a.jpg" }), "image");
  assert.equal(albumMediaKind({ mimetype: "video/quicktime", name: "a.mov" }), "video");
  assert.equal(albumMediaKind({ mimetype: "application/octet-stream", name: "IMG_1234.HEIC" }), "image");
  assert.equal(albumMediaKind({ mimetype: "application/octet-stream", name: "clip.MOV" }), "video");
  assert.equal(albumMediaKind({ mimetype: "application/pdf", name: "minutes.pdf" }), null);
  assert.equal(albumMediaKind({ mimetype: "audio/mpeg", name: "sermon.mp3" }), null);
});

test("thumbnailPathFor derives a path under its own prefix", () => {
  assert.equal(thumbnailPathFor("C1/1700.1/F1-roof.jpg"), "thumbs/C1/1700.1/F1-roof.jpg.webp");
});

test("albumMediaHref encodes each segment and the download name", () => {
  assert.equal(albumMediaHref("C1/1700.1/F1-roof.jpg"), "/portal/slack-archive/media/C1/1700.1/F1-roof.jpg");
  assert.equal(
    albumMediaHref("C1/1700.1/F1-roof.jpg", { download: "Roof — before.jpg" }),
    "/portal/slack-archive/media/C1/1700.1/F1-roof.jpg?download=Roof%20%E2%80%94%20before.jpg",
  );
});

test("buildAlbumItems keeps stored photos and videos only, oldest post first", () => {
  const items = buildAlbumItems(
    [
      message({
        id: "m2",
        ts: "1700000200.000000",
        files: [file("F3", "walkthrough.mov", "video/quicktime")],
      }),
      message({
        id: "m1",
        ts: "1700000100.000000",
        message_text: "New roof is on",
        files: [
          file("F1", "roof.jpg", "image/jpeg"),
          file("F2", "quote.pdf", "application/pdf"),
          file("F9", "broken.jpg", "image/jpeg", { storage_path: null, error: "Download failed: HTTP 404" }),
        ],
      }),
    ],
    noParents,
  );
  assert.deepEqual(items.map((i) => i.id), ["F1", "F3"]);
  assert.equal(items[0].kind, "image");
  assert.equal(items[0].text, "New roof is on");
  assert.equal(items[1].kind, "video");
  assert.deepEqual(items[0].siblingIds, []);
});

test("buildAlbumItems links every photo in a multi-photo post", () => {
  const items = buildAlbumItems(
    [
      message({
        id: "m1",
        ts: "1700000100.000000",
        files: [file("F1", "a.jpg", "image/jpeg"), file("F2", "b.jpg", "image/jpeg"), file("F3", "c.mp4", "video/mp4")],
      }),
    ],
    noParents,
  );
  for (const item of items) assert.deepEqual(item.siblingIds, ["F1", "F2", "F3"]);
});

test("buildAlbumItems shows a file shared into two channels once, under both channels", () => {
  const items = buildAlbumItems(
    [
      message({ id: "m2", ts: "1700000900.000000", channel_id: "C2", files: [file("F1", "a.jpg", "image/jpeg")] }),
      message({ id: "m1", ts: "1700000100.000000", channel_id: "C1", message_text: "first", files: [file("F1", "a.jpg", "image/jpeg")] }),
    ],
    noParents,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].messageId, "m1");
  assert.equal(items[0].text, "first");
  assert.deepEqual(items[0].channelIds, ["C1", "C2"]);
});

test("buildAlbumItems carries the thread a reply was posted in", () => {
  const parents = new Map([[threadParentKey("C1", "1700000000.000000"), { author: "Dave", text: "Roof repair update" }]]);
  const [reply] = buildAlbumItems(
    [
      message({
        id: "m2",
        ts: "1700000500.000000",
        thread_ts: "1700000000.000000",
        author_name: null,
        files: [file("F1", "a.jpg", "image/jpeg")],
      }),
    ],
    parents,
  );
  assert.equal(reply.author, "Unknown");
  assert.equal(reply.parentAuthor, "Dave");
  assert.equal(reply.parentText, "Roof repair update");
});

test("buildAlbumItems trims essay-length captions at a word boundary", () => {
  const [item] = buildAlbumItems(
    [message({ id: "m1", ts: "1700000100.000000", message_text: "word ".repeat(400), files: [file("F1", "a.jpg", "image/jpeg")] })],
    noParents,
  );
  assert.ok(item.text.length <= 1001);
  assert.ok(item.text.endsWith("word…"));
});

test("orderAlbumItems newest-first flips posts but keeps each post's own order", () => {
  const items = buildAlbumItems(
    [
      message({ id: "m1", ts: "1700000100.000000", files: [file("A1", "a.jpg", "image/jpeg"), file("A2", "b.jpg", "image/jpeg")] }),
      message({ id: "m2", ts: "1700000200.000000", files: [file("B1", "c.jpg", "image/jpeg"), file("B2", "d.jpg", "image/jpeg")] }),
    ],
    noParents,
  );
  assert.deepEqual(orderAlbumItems(items, "oldest").map((i) => i.id), ["A1", "A2", "B1", "B2"]);
  assert.deepEqual(orderAlbumItems(items, "newest").map((i) => i.id), ["B1", "B2", "A1", "A2"]);
});

test("albumMonthOf files a late-evening post under the church's local month", () => {
  // 03:00 UTC on Sept 1 is 10pm on Aug 31 in Omaha.
  assert.deepEqual(albumMonthOf("2025-09-01T03:00:00.000Z", TZ), { key: "2025-08", year: 2025, month: 8 });
  assert.deepEqual(albumMonthOf("2025-09-01T12:00:00.000Z", TZ), { key: "2025-09", year: 2025, month: 9 });
});

test("groupAlbumByMonth starts a new group whenever the month changes", () => {
  const items = buildAlbumItems(
    [
      message({ id: "m1", ts: "1754049600.000000", files: [file("F1", "a.jpg", "image/jpeg")] }), // Aug 1 2025
      message({ id: "m2", ts: "1754136000.000000", files: [file("F2", "b.jpg", "image/jpeg")] }), // Aug 2 2025
      message({ id: "m3", ts: "1757000000.000000", files: [file("F3", "c.jpg", "image/jpeg")] }), // Sep 4 2025
    ],
    noParents,
  );
  const groups = groupAlbumByMonth(orderAlbumItems(items, "newest"), TZ);
  assert.deepEqual(groups.map((g) => [g.key, g.items.length]), [["2025-09", 1], ["2025-08", 2]]);
});

test("normalizeForSearch folds case, accents, curly quotes, and markdown escapes", () => {
  assert.equal(normalizeForSearch("Café  Team’s David\\_Orrick"), "cafe team's david_orrick");
});

test("parseAlbumQuery splits words and keeps quoted phrases together", () => {
  assert.deepEqual(parseAlbumQuery('roof  "east   wall" Crème'), ["roof", "east wall", "creme"]);
  assert.deepEqual(parseAlbumQuery("“new roof”"), ["new roof"]);
  assert.deepEqual(parseAlbumQuery('"unterminated phrase'), ["unterminated phrase"]);
  assert.deepEqual(parseAlbumQuery('   ""  '), []);
});

test("search matches caption, thread, file name, person, channel, kind, and month", () => {
  const parents = new Map([[threadParentKey("C1", "1700000000.000000"), { author: "Dave", text: "Parking lot resurfacing" }]]);
  const [item] = buildAlbumItems(
    [
      message({
        id: "m1",
        ts: "1757000000.000000", // Sep 4 2025
        thread_ts: "1700000000.000000",
        message_text: "Looks great from the east side",
        files: [file("F1", "IMG_4410.jpg", "image/jpeg")],
      }),
    ],
    parents,
  );
  const labels = new Map([["C1", "Building Committee"]]);
  const text = albumSearchText(item, labels, TZ);
  const matches = (q: string) => albumItemMatches(item, text, { ...noFilters, terms: parseAlbumQuery(q) });

  assert.ok(matches("east"));
  assert.ok(matches("parking lot"));
  assert.ok(matches("img_4410"));
  assert.ok(matches("jeff"));
  assert.ok(matches("building committee"));
  assert.ok(matches("photo"));
  assert.ok(matches("september 2025"));
  assert.ok(matches('"east side" jeff'));
  assert.ok(!matches("west"));
  assert.ok(!matches('"side east"'));
  assert.ok(!matches("video"));
});

test("albumItemMatches applies facets, and `ignore` drops exactly one of them", () => {
  const [photo, video] = buildAlbumItems(
    [
      message({ id: "m1", ts: "1700000100.000000", channel_id: "C1", author_name: "Ann", files: [file("F1", "a.jpg", "image/jpeg")] }),
      message({ id: "m2", ts: "1700000200.000000", channel_id: "C2", author_name: "Bo", files: [file("F2", "b.mp4", "video/mp4")] }),
    ],
    noParents,
  );
  const filters: AlbumFilters = { terms: [], kind: "image", channelIds: ["C2"], people: [] };
  assert.equal(albumItemMatches(photo, "", filters), false); // wrong channel
  assert.equal(albumItemMatches(video, "", filters), false); // wrong kind
  assert.equal(albumItemMatches(video, "", filters, "kind"), true);
  assert.equal(albumItemMatches(photo, "", filters, "channel"), true);
  assert.equal(albumItemMatches(photo, "", { ...noFilters, people: ["Bo"] }), false);
  assert.equal(albumItemMatches(video, "", { ...noFilters, people: ["Bo"] }), true);
});

test("URL state round-trips, ignoring junk and duplicate values", () => {
  const state = parseAlbumUrlState({
    q: " roof ",
    type: "videos",
    channel: ["C1", "C2", "C1"],
    person: "Jeff Malone",
    sort: "oldest",
    photo: "F9",
  });
  assert.deepEqual(state, {
    q: "roof",
    kind: "video",
    channelIds: ["C1", "C2"],
    people: ["Jeff Malone"],
    sort: "oldest",
    photo: "F9",
  });
  assert.equal(albumUrlSearch(state), "?q=roof&type=videos&channel=C1&channel=C2&person=Jeff+Malone&sort=oldest&photo=F9");
  assert.deepEqual(parseAlbumUrlState({ type: "bogus", sort: "sideways" }), {
    q: "",
    kind: null,
    channelIds: [],
    people: [],
    sort: "newest",
    photo: null,
  });
  assert.equal(albumUrlSearch(parseAlbumUrlState({})), "");
});

test("photos and videos show in place; HEIC only from its preview; failed, external and other files don't", () => {
  const file = (over: Partial<ArchivedFile>): ArchivedFile => ({
    id: "F1", name: "IMG_0125.jpg", mimetype: "image/jpeg", size: 1, storage_path: "C1/1.0/F1-IMG_0125.jpg", permalink: null, error: null, ...over,
  });
  assert.equal(showsInline(file({}), false), true);
  assert.equal(showsInline(file({ name: "clip.mov", mimetype: "video/quicktime" }), false), true);
  assert.equal(showsInline(file({ name: "IMG_1.HEIC", mimetype: "image/heic" }), false), false);
  assert.equal(showsInline(file({ name: "IMG_1.HEIC", mimetype: "image/heic" }), true), true);
  assert.equal(showsInline(file({ error: "Download failed: HTTP 404", storage_path: null }), false), false);
  assert.equal(showsInline(file({ external: true, storage_path: null }), false), false);
  assert.equal(showsInline(file({ name: "minutes.pdf", mimetype: "application/pdf" }), false), false);
  assert.equal(showsInline(file({ name: "song.mp3", mimetype: "audio/mpeg" }), false), false);
});
