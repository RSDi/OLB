import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { buildSignsPdf, signsDatesLabel } from "../../lib/hosted/signs-pdf.ts";

const dir = join(import.meta.dirname, "../../lib/hosted/signs-assets");
const asset = (f: string) => readFileSync(join(dir, f));
const assets = {
  display: asset("BarlowCondensed-ExtraBold.ttf"),
  regular: asset("Barlow-Regular.ttf"),
  semibold: asset("Barlow-SemiBold.ttf"),
  bold: asset("Barlow-Bold.ttf"),
  bolt: asset("logo-bolt.png"),
};

test("the signs PDF: one Letter page per sign, two court cards a page", async () => {
  const bytes = await buildSignsPdf(
    {
      event: "Missouri River Shootout",
      dateLine: "Nov 13–14, 2026",
      place: "Iowa West Fieldhouse",
      admission: "Day pass $10 · Weekend pass $15\nPay at the gate.",
      courts: 3,
      liveUrl: "https://omahalightningbasketball.com/shootout",
    },
    assets
  );
  const doc = await PDFDocument.load(bytes);
  const sizes = doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
  // Poster, table tent, four cards, then courts 1–2 and court 3.
  assert.deepEqual(sizes, [
    [612, 792],
    [792, 612],
    [792, 612],
    [612, 792],
    [612, 792],
  ]);
  assert.equal(doc.getTitle(), "Signs — Missouri River Shootout");
});

test("no admission text and one court still makes a full set", async () => {
  const bytes = await buildSignsPdf(
    { event: "Shootout", dateLine: "Nov 13, 2026", place: "", admission: null, courts: 1, liveUrl: "https://omahalightningbasketball.com/shootout" },
    assets
  );
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4);
});

test("signs date line", () => {
  assert.equal(signsDatesLabel("2026-11-13", "2026-11-14"), "Nov 13–14, 2026");
  assert.equal(signsDatesLabel("2026-11-13", "2026-11-13"), "Nov 13, 2026");
  assert.equal(signsDatesLabel("2026-10-31", "2026-11-01"), "Oct 31–Nov 1, 2026");
});

test("the signs route serves the PDF to planners only and never prints the PIN", () => {
  const route = readFileSync(join(import.meta.dirname, "../../app/(standalone)/shootout/signs/route.ts"), "utf8");
  assert.match(route, /viewerHsScheduleAccess\(viewer\)\) !== "edit"/);
  assert.match(route, /application\/pdf/);
  assert.doesNotMatch(route, /scorer_pin/);
  const config = readFileSync(join(import.meta.dirname, "../../next.config.ts"), "utf8");
  assert.match(config, /"\/shootout\/signs": \["\.\/lib\/hosted\/signs-assets\/\*\*\/\*"\]/);
});
