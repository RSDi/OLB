// Auto-capture for the document scanner: take the picture by itself once the
// page has held still for a moment, like a phone's built-in scanner, but not
// the same page twice in a row (someone who taps Add page and hasn't turned
// the page yet). Pure and safe to import from client components.

import { homography, fullFrame, type Quad, type RgbaImage } from "./geometry.ts"; // explicit extension so node --test can load this file

// How long the page must hold still, and how long the camera gets to settle
// (and a person to aim it) before the first auto shot.
export const AUTO_HOLD_MS = 1000;
export const AUTO_SETTLE_MS = 1200;
// The page must fill at least this much of the frame, so it's shot close
// enough to read.
export const AUTO_MIN_FILL = 0.2;
// How far a corner may wander, as a share of the frame's long side, and still
// count as holding still.
export const AUTO_STEADY_SHIFT = 0.02;

export interface SteadyTracker {
  // Where the page was when it last came to rest, and when that was.
  anchor: Quad | null;
  since: number;
}

export function newSteadyTracker(): SteadyTracker {
  return { anchor: null, since: 0 };
}

// How long (ms) the page has held within `tolerance` pixels of where it came
// to rest. No page, or one that has moved, starts the count again.
export function steadyFor(tracker: SteadyTracker, quad: Quad | null, now: number, tolerance: number): number {
  if (!quad) {
    tracker.anchor = null;
    return 0;
  }
  const moved =
    !tracker.anchor || quad.some((p, i) => Math.hypot(p.x - tracker.anchor![i].x, p.y - tracker.anchor![i].y) > tolerance);
  if (moved) {
    tracker.anchor = quad.map((p) => ({ ...p })) as Quad;
    tracker.since = now;
  }
  return now - tracker.since;
}

const PRINT_W = 24;
const PRINT_H = 32;

// A tiny, brightness-proof summary of what's on a page: the page cut out of
// `img` at `quad`, shrunk to 24 × 32, and evened out so the same page reads
// the same under different light. Compare two with samePage().
export function pageFingerprint(img: RgbaImage, quad: Quad): Float32Array {
  // Sample at twice the size and average each 2 × 2, so fine print blurs
  // together instead of flickering in and out between frames.
  const w = PRINT_W * 2;
  const h = PRINT_H * 2;
  const m = homography(fullFrame(w, h), quad);
  const { data, width, height } = img;
  const fine = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = m[6] * px + m[7] * py + m[8];
      const sx = Math.min(width - 1, Math.max(0, Math.round((m[0] * px + m[1] * py + m[2]) / d - 0.5)));
      const sy = Math.min(height - 1, Math.max(0, Math.round((m[3] * px + m[4] * py + m[5]) / d - 0.5)));
      const i = (sy * width + sx) * 4;
      fine[y * w + x] = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
    }
  }
  const print = new Float32Array(PRINT_W * PRINT_H);
  for (let y = 0; y < PRINT_H; y++) {
    for (let x = 0; x < PRINT_W; x++) {
      const i = y * 2 * w + x * 2;
      print[y * PRINT_W + x] = (fine[i] + fine[i + 1] + fine[i + w] + fine[i + w + 1]) / 4;
    }
  }
  let mean = 0;
  for (const v of print) mean += v;
  mean /= print.length;
  let spread = 0;
  for (const v of print) spread += (v - mean) ** 2;
  spread = Math.sqrt(spread / print.length) || 1;
  for (let i = 0; i < print.length; i++) print[i] = (print[i] - mean) / spread;
  return print;
}

// True when two fingerprints are (very likely) the same page.
export function samePage(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r += a[i] * b[i];
  // The same page, held a little differently, scores about 0.8 to 0.95;
  // different pages, even two of plain text, under 0.5.
  return r / a.length > 0.7;
}
