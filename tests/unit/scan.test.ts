// The document scanner's image work (lib/scan): putting corners in order,
// finding the page in a frame, laying it flat, cleaning it up, bundling the
// pages into a PDF, and knowing when to take the picture by itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyHomography,
  fullFrame,
  homography,
  isConvexQuad,
  orderCorners,
  outputSize,
  pageAspect,
  warpPerspective,
  type Point,
  type Quad,
  type RgbaImage,
} from "../../lib/scan/geometry.ts";
import { newSteadyTracker, pageFingerprint, samePage, steadyFor } from "../../lib/scan/autocapture.ts";
import { jpegName, looksLikeHeic } from "../../lib/scan/heic.ts";
import { convexHull, detectDocument, largestQuad, otsuThreshold, toGray } from "../../lib/scan/detect.ts";
import { applyScanFilter } from "../../lib/scan/enhance.ts";
import { buildPdf, jpegInfo } from "../../lib/scan/pdf.ts";

function near(a: Point, b: Point, within: number, what: string) {
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= within, `${what}: (${a.x}, ${a.y}) vs (${b.x}, ${b.y})`);
}

function inside(q: Quad, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (c === 0) continue;
    if (sign === 0) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}

// A photo-like frame: a darker, grainy table with a tilted sheet of paper on
// it, lit unevenly, with lines of writing.
function scene(width: number, height: number, page: Quad): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 21) - 10;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v: [number, number, number];
      if (inside(page, x + 0.5, y + 0.5)) {
        const light = 215 + 25 * (x / width);
        const writing = y % 14 < 2 && x % 40 > 6;
        v = writing ? [50, 50, 70] : [light, light - 4, light - 18];
      } else {
        v = [95, 70, 50];
      }
      const n = noise();
      rgba[i] = v[0] + n;
      rgba[i + 1] = v[1] + n;
      rgba[i + 2] = v[2] + n;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

test("orders corners top-left, top-right, bottom-right, bottom-left", () => {
  const tl = { x: 10, y: 12 };
  const tr = { x: 200, y: 20 };
  const br = { x: 190, y: 300 };
  const bl = { x: 5, y: 280 };
  for (const mixed of [
    [br, tl, bl, tr],
    [bl, br, tr, tl],
    [tr, bl, tl, br],
  ]) {
    assert.deepEqual(orderCorners(mixed), [tl, tr, br, bl]);
  }
  // A page turned nearly on its point still starts from the top-left-most.
  const diamond = orderCorners([
    { x: 100, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 95 },
  ]);
  assert.deepEqual(diamond[0], { x: 0, y: 95 });
  assert.deepEqual(diamond[1], { x: 100, y: 0 });
});

test("tells a proper page outline from a folded one", () => {
  assert.equal(isConvexQuad(fullFrame(100, 50)), true);
  const crossed: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
    { x: 100, y: 0 },
    { x: 0, y: 50 },
  ];
  assert.equal(isConvexQuad(crossed), false);
  const dented: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 100 },
  ];
  assert.equal(isConvexQuad(dented), false);
});

test("sizes the flat page from its longer edges, shrinking but never growing it", () => {
  const q: Quad = [
    { x: 0, y: 0 },
    { x: 850, y: 0 },
    { x: 800, y: 1100 },
    { x: 30, y: 1080 },
  ];
  assert.deepEqual(outputSize(q, 5000), { width: 850, height: Math.round(Math.hypot(50, 1100)) });
  const big = outputSize(q, 550);
  assert.equal(Math.max(big.width, big.height), 550);
});

// A letter page photographed by a pinhole camera from some angle: where its
// corners land in a 3000 × 4000 photo.
function photographLetter(tiltX: number, tiltY: number, turn: number, shift: [number, number, number]): Quad {
  const rad = Math.PI / 180;
  const f = 3100;
  const corners: [number, number][] = [
    [-4.25, -5.5],
    [4.25, -5.5],
    [4.25, 5.5],
    [-4.25, 5.5],
  ];
  return corners.map(([x0, y0]) => {
    // Turn in the page's plane, then tip it back and to the side.
    let x = x0 * Math.cos(turn * rad) - y0 * Math.sin(turn * rad);
    let y = x0 * Math.sin(turn * rad) + y0 * Math.cos(turn * rad);
    let z = 0;
    [y, z] = [y * Math.cos(tiltX * rad) - z * Math.sin(tiltX * rad), y * Math.sin(tiltX * rad) + z * Math.cos(tiltX * rad)];
    [x, z] = [x * Math.cos(tiltY * rad) + z * Math.sin(tiltY * rad), -x * Math.sin(tiltY * rad) + z * Math.cos(tiltY * rad)];
    x += shift[0];
    y += shift[1];
    z += shift[2];
    return { x: (f * x) / z + 1500, y: (f * y) / z + 2000 };
  }) as Quad;
}

test("works out a page's real shape from a photo taken at an angle", () => {
  const letter = 8.5 / 11;
  for (const [tiltX, tiltY, turn, shift] of [
    [0, 0, 0, [0, 0, 18]],
    [30, 0, 0, [0, 0, 18]],
    [35, 15, 8, [1, -1, 17]],
    [-25, -20, -12, [-1.5, 1, 20]],
    [45, 10, 3, [0, 0.5, 16]],
  ] as [number, number, number, [number, number, number]][]) {
    const q = photographLetter(tiltX, tiltY, turn, shift);
    const aspect = pageAspect(q, 3000, 4000);
    assert.ok(Math.abs(aspect - letter) < 0.01, `tilted ${tiltX}°/${tiltY}°: ${aspect.toFixed(3)}`);
    const size = outputSize(q, 2200, aspect);
    assert.ok(Math.abs(size.width / size.height - letter) < 0.01);
    assert.ok(Math.max(size.width, size.height) <= 2200);
  }
  // Tipped back, the page looks squat; going by its edges alone gets it wrong.
  const tipped = photographLetter(45, 10, 3, [0, 0.5, 16]);
  const byEdges = outputSize(tipped, 5000);
  assert.ok(byEdges.width / byEdges.height - letter > 0.1);
});

test("the perspective transform lands each corner where it belongs", () => {
  const from = fullFrame(400, 500);
  const to: Quad = [
    { x: 31, y: 40 },
    { x: 380, y: 12 },
    { x: 420, y: 510 },
    { x: 8, y: 470 },
  ];
  const h = homography(from, to);
  from.forEach((p, i) => near(applyHomography(h, p), to[i], 1e-6, `corner ${i}`));
});

test("laying the whole frame flat gives the same picture back", () => {
  const w = 40;
  const h = 30;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 37) % 256;
    data[i * 4 + 1] = (i * 11) % 256;
    data[i * 4 + 2] = (i * 3) % 256;
    data[i * 4 + 3] = 255;
  }
  const out = warpPerspective({ data, width: w, height: h }, fullFrame(w, h), w, h);
  assert.deepEqual(out.data, data);
});

test("finds the largest four-cornered shape on a hull", () => {
  const hull = convexHull([
    { x: 0, y: 0 },
    { x: 50, y: -2 },
    { x: 100, y: 0 },
    { x: 102, y: 50 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: -1, y: 50 },
    { x: 40, y: 40 }, // inside: not on the hull
  ]);
  assert.equal(hull.length, 7);
  const q = largestQuad(hull);
  assert.ok(q);
  near(q[0], { x: 0, y: 0 }, 0.01, "top-left");
  near(q[1], { x: 100, y: 0 }, 0.01, "top-right");
  near(q[2], { x: 100, y: 100 }, 0.01, "bottom-right");
  near(q[3], { x: 0, y: 100 }, 0.01, "bottom-left");
});

test("splits dark from light", () => {
  const gray = new Uint8Array(1000);
  gray.fill(40, 0, 600);
  gray.fill(220, 600);
  const t = otsuThreshold(gray);
  assert.ok(t >= 40 && t < 220, String(t));
});

test("finds a tilted page on a table", () => {
  const w = 320;
  const h = 240;
  const page: Quad = [
    { x: 92, y: 28 },
    { x: 248, y: 44 },
    { x: 236, y: 222 },
    { x: 70, y: 204 },
  ];
  const found = detectDocument(toGray(scene(w, h, page), w, h), w, h);
  assert.ok(found, "no page found");
  found.forEach((p, i) => near(p, page[i], 4, `corner ${i}`));
});

test("finds nothing when there's no page, or only the frame", () => {
  const w = 160;
  const h = 120;
  const empty = new Uint8Array(w * h).fill(90);
  assert.equal(detectDocument(empty, w, h), null);
  const all = toGray(scene(w, h, fullFrame(w, h)), w, h);
  assert.equal(detectDocument(all, w, h), null);
});

test("lifts shadows off the paper and keeps the writing dark", () => {
  const w = 200;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const paper = 140 + x / 2; // shadowed on the left
      const ink = y >= 48 && y < 52 && x > 20 && x < 180;
      data[i] = ink ? 40 : paper;
      data[i + 1] = ink ? 40 : paper - 5;
      data[i + 2] = ink ? 60 : paper - 30; // yellow indoor light
      data[i + 3] = 255;
    }
  }
  for (const filter of ["color", "gray", "bw"] as const) {
    const img = { data: new Uint8ClampedArray(data), width: w, height: h };
    applyScanFilter(img, filter);
    const px = (x: number, y: number) => Array.from(img.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
    for (const x of [5, 100, 195]) {
      for (const c of px(x, 10)) assert.ok(c >= 245, `${filter}: paper at x=${x} is ${px(x, 10)}`);
    }
    for (const c of px(100, 50)) assert.ok(c <= 80, `${filter}: ink is ${px(100, 50)}`);
    if (filter !== "color") {
      const [r, g, b] = px(100, 50);
      assert.ok(r === g && g === b, `${filter} has no colour`);
    }
  }
  const photo = { data: new Uint8ClampedArray(data), width: w, height: h };
  applyScanFilter(photo, "photo");
  assert.deepEqual(photo.data, data);
});

// Just enough of a JPEG for its header to be read: start, a JFIF block, the
// frame header, end.
function fakeJpeg(width: number, height: number, components = 3): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 8 + components * 3, 8, height >> 8, height & 255, width >> 8, width & 255, components];
  for (let c = 0; c < components; c++) sof.push(c + 1, 0x11, 0);
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ...sof,
    0xff, 0xd9,
  ]);
}

test("reads a JPEG's size", () => {
  assert.deepEqual(jpegInfo(fakeJpeg(1700, 2200)), { width: 1700, height: 2200, components: 3 });
  assert.deepEqual(jpegInfo(fakeJpeg(640, 480, 1)), { width: 640, height: 480, components: 1 });
  assert.equal(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
});

test("bundles pages into a PDF whose index points at every object", () => {
  const pdf = buildPdf([fakeJpeg(1700, 2200), fakeJpeg(2200, 1700, 1)]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.match(text, /\/Count 2/);
  // Letter-width portrait page, then a landscape one 8½ inches tall.
  assert.match(text, /\/MediaBox \[0 0 612 792\]/);
  assert.match(text, /\/MediaBox \[0 0 792 612\]/);
  assert.match(text, /\/ColorSpace \/DeviceRGB/);
  assert.match(text, /\/ColorSpace \/DeviceGray/);

  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
  assert.ok(text.startsWith("xref\n", startxref));
  const table = text.slice(startxref).split("\n");
  const count = Number(table[1].split(" ")[1]);
  assert.equal(count, 9);
  for (let id = 1; id < count; id++) {
    const offset = Number(table[2 + id].slice(0, 10));
    assert.ok(text.startsWith(`${id} 0 obj\n`, offset), `object ${id} at ${offset}`);
  }
  // Each stream's stated length is what's in it.
  for (const m of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.ok(text.startsWith("\nendstream", start + Number(m[1])), "stream length");
  }
  assert.throws(() => buildPdf([]));
});

// ─── Auto-capture ───────────────────────────────────────────────

// A frame with a page at `page` whose writing is `ink(u, v)` (u, v from 0 to
// 1 across and down the page), under light of the given brightness.
function framed(width: number, height: number, page: Quad, ink: (u: number, v: number) => boolean, light = 1): RgbaImage {
  const toPage = homography(page, fullFrame(1, 1));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const { x: u, y: v } = applyHomography(toPage, { x: x + 0.5, y: y + 0.5 });
      const onPage = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      const g = onPage ? (ink(u, v) ? 45 : 225) : 80;
      data[i] = data[i + 1] = data[i + 2] = g * light;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// Handbook-ish pages: two of lines of text all the way down (set a little
// differently), and a short page with a heading, a paragraph and two
// signature lines.
const textPage = (u: number, v: number) =>
  u > 0.1 && u < 0.9 && v > 0.08 && v < 0.92 && v * 40 - Math.floor(v * 40) < 0.35 && u < 0.9 - (Math.floor(v * 40) % 3) * 0.15;
const otherTextPage = (u: number, v: number) =>
  u > 0.12 && u < 0.88 && v > 0.1 && v < 0.9 && v * 38 - Math.floor(v * 38) < 0.35 && u < 0.88 - (Math.floor(v * 38) % 4) * 0.12;
const signaturePage = (u: number, v: number) =>
  (v > 0.08 && v < 0.13 && u > 0.1 && u < 0.6) ||
  (v > 0.2 && v < 0.45 && u > 0.1 && u < 0.9 && v * 30 - Math.floor(v * 30) < 0.35) ||
  (v > 0.8 && v < 0.81 && ((u > 0.1 && u < 0.45) || (u > 0.55 && u < 0.9)));

test("counts how long the page has held still", () => {
  const t = newSteadyTracker();
  const q = fullFrame(100, 100);
  const nudge = (d: number) => q.map((p) => ({ x: p.x + d, y: p.y })) as Quad;
  assert.equal(steadyFor(t, q, 1000, 5), 0);
  assert.equal(steadyFor(t, nudge(2), 1200, 5), 200);
  // Small wobbles add up against where it came to rest, not the last frame.
  assert.equal(steadyFor(t, nudge(4), 1400, 5), 400);
  assert.equal(steadyFor(t, nudge(6), 1600, 5), 0);
  assert.equal(steadyFor(t, nudge(6), 1900, 5), 300);
  assert.equal(steadyFor(t, null, 2000, 5), 0);
  assert.equal(steadyFor(t, nudge(6), 2100, 5), 0);
});

test("knows the page it just scanned from the next one", () => {
  const w = 320;
  const h = 240;
  const at: Quad = [
    { x: 100, y: 30 },
    { x: 240, y: 42 },
    { x: 228, y: 220 },
    { x: 84, y: 206 },
  ];
  // The same page held a little differently, in dimmer light.
  const moved = at.map((p, i) => ({ x: p.x + [3, -2, 2, -3][i], y: p.y + [2, 3, -2, -2][i] })) as Quad;
  const scanned = pageFingerprint(framed(w, h, at, textPage), at);
  assert.equal(samePage(scanned, pageFingerprint(framed(w, h, moved, textPage, 0.8), moved)), true);
  assert.equal(samePage(scanned, pageFingerprint(framed(w, h, moved, otherTextPage), moved)), false);
  assert.equal(samePage(scanned, pageFingerprint(framed(w, h, moved, signaturePage), moved)), false);
  const signature = pageFingerprint(framed(w, h, at, signaturePage), at);
  assert.equal(samePage(signature, pageFingerprint(framed(w, h, moved, signaturePage, 1.1), moved)), true);
  assert.equal(samePage(signature, pageFingerprint(framed(w, h, moved, textPage), moved)), false);
});

test("spots iPhone photos by type, or by name when the type is missing", () => {
  assert.equal(looksLikeHeic({ name: "IMG_4821.HEIC", type: "image/heic" }), true);
  assert.equal(looksLikeHeic({ name: "photo", type: "image/heif" }), true);
  assert.equal(looksLikeHeic({ name: "burst", type: "image/heic-sequence" }), true);
  // Windows often doesn't know the type.
  assert.equal(looksLikeHeic({ name: "IMG_4821.heic", type: "" }), true);
  assert.equal(looksLikeHeic({ name: "scan.HEIF", type: "" }), true);
  assert.equal(looksLikeHeic({ name: "IMG_4821.jpg", type: "image/jpeg" }), false);
  assert.equal(looksLikeHeic({ name: "heic-notes.pdf", type: "application/pdf" }), false);
});

test("names the JPEG after the iPhone photo", () => {
  assert.equal(jpegName("IMG_4821.HEIC"), "IMG_4821.jpg");
  assert.equal(jpegName("signed page.heif"), "signed page.jpg");
  assert.equal(jpegName(".heic"), "Photo.jpg");
});
