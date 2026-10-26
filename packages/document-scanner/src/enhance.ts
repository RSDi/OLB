// The document scanner's clean-up looks, like a phone's built-in scanner:
// shadows and yellow indoor light lifted off the paper so it reads white,
// and the writing darkened. Pure and safe to import from client components.

import type { RgbaImage } from "./geometry.ts"; // explicit extension so node --test can load this file

export type ScanFilter = "color" | "gray" | "bw" | "photo";

export const SCAN_FILTERS: { key: ScanFilter; label: string }[] = [
  { key: "color", label: "Color" },
  { key: "gray", label: "Grayscale" },
  { key: "bw", label: "B&W" },
  { key: "photo", label: "Photo" },
];

// How bright the bare paper is around each pixel, one channel at a time:
// the brightest patch in each small block (patches are averaged first, so
// camera grain doesn't count as paper, and writing drops out), spread a block
// further (so a thick stroke or a logo drops out too), smoothed, and then
// read back smoothly between blocks.
// `values` holds one channel, every `stride`th entry starting at `offset`.
function paperLevel(
  values: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  stride: number,
  offset: number
): Float32Array {
  const patch = Math.max(2, Math.round(Math.max(width, height) / 192));
  const block = patch * 4;
  const pw = Math.ceil(width / patch);
  const ph = Math.ceil(height / patch);
  const sums = new Float32Array(pw * ph);
  const counts = new Float32Array(pw * ph);
  for (let y = 0; y < height; y++) {
    const py = ((y / patch) | 0) * pw;
    const row = y * width * stride + offset;
    for (let x = 0; x < width; x++) {
      const g = py + ((x / patch) | 0);
      sums[g] += values[row + x * stride];
      counts[g]++;
    }
  }
  const gw = Math.ceil(pw / 4);
  const gh = Math.ceil(ph / 4);
  const grid = new Float32Array(gw * gh);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const mean = sums[y * pw + x] / counts[y * pw + x];
      const g = (y >> 2) * gw + (x >> 2);
      if (mean > grid[g]) grid[g] = mean;
    }
  }
  const spread = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          if (grid[yy * gw + xx] > m) m = grid[yy * gw + xx];
        }
      }
      spread[y * gw + x] = m;
    }
  }
  const smooth = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          sum += spread[yy * gw + xx];
          count++;
        }
      }
      // Never divide by a near-black "paper": a dark photo stays dark.
      smooth[y * gw + x] = Math.max(48, sum / count);
    }
  }

  const level = new Float32Array(width * height);
  const col0 = new Int32Array(width);
  const col1 = new Int32Array(width);
  const colF = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const g = Math.min(gw - 1, Math.max(0, (x + 0.5) / block - 0.5));
    col0[x] = Math.floor(g);
    col1[x] = Math.min(gw - 1, col0[x] + 1);
    colF[x] = g - col0[x];
  }
  for (let y = 0; y < height; y++) {
    const g = Math.min(gh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const r0 = Math.floor(g) * gw;
    const r1 = Math.min(gh - 1, Math.floor(g) + 1) * gw;
    const fy = g - Math.floor(g);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const top = smooth[r0 + col0[x]] + (smooth[r0 + col1[x]] - smooth[r0 + col0[x]]) * colF[x];
      const bottom = smooth[r1 + col0[x]] + (smooth[r1 + col1[x]] - smooth[r1 + col0[x]]) * colF[x];
      level[row + x] = top + (bottom - top) * fy;
    }
  }
  return level;
}

// Paper at 1 and ink near 0 before this; stretched so paper is pure white
// and writing comes out dark.
function levels(r: number, lo: number, hi: number): number {
  const v = (r - lo) / (hi - lo);
  return v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
}

// Applies a look in place. "photo" leaves the picture as taken.
export function applyScanFilter(img: RgbaImage, filter: ScanFilter): void {
  if (filter === "photo") return;
  const { data, width, height } = img;
  const n = width * height;
  if (filter === "color") {
    for (let c = 0; c < 3; c++) {
      const bg = paperLevel(data, width, height, 4, c);
      for (let i = 0, j = c; i < n; i++, j += 4) data[j] = levels(data[j] / bg[i], 0.2, 0.9);
    }
    return;
  }
  // Grey and black & white work on brightness alone.
  const gray = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  const bg = paperLevel(gray, width, height, 1, 0);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = gray[i] / bg[i];
    // B&W keeps a short ramp, not a hard cut, so strokes stay smooth.
    const v = filter === "bw" ? levels(r, 0.62, 0.8) : levels(r, 0.2, 0.9);
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
  }
}
