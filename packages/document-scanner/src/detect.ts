// Finds a sheet of paper in a camera frame, for the document scanner's live
// outline and its starting corners. The page is taken to be the biggest
// bright patch (paper on a table, a desk, a clipboard); its outline is
// boiled down to the four-cornered shape that covers the most of it.
// Anything else — no page, a page against a white wall — returns null and
// the scanner starts from the whole frame so the corners can be dragged in.
// Pure and safe to import from client components.

import { orderCorners, quadArea, type Point, type Quad } from "./geometry.ts"; // explicit extension so node --test can load this file

// Brightness (0–255) of every pixel of an RGBA image.
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return out;
}

// A quick blur (box, run across then down) to wash out paper grain and text.
function blur(gray: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(gray.length);
  const out = new Uint8Array(gray.length);
  const pass = (src: Uint8Array, dst: Uint8Array, len: number, lines: number, step: number, lineStep: number) => {
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      let sum = 0;
      let count = 0;
      for (let k = 0; k <= radius && k < len; k++) {
        sum += src[base + k * step];
        count++;
      }
      for (let i = 0; i < len; i++) {
        dst[base + i * step] = Math.round(sum / count);
        const add = i + radius + 1;
        const drop = i - radius;
        if (add < len) {
          sum += src[base + add * step];
          count++;
        }
        if (drop >= 0) {
          sum -= src[base + drop * step];
          count--;
        }
      }
    }
  };
  pass(gray, tmp, width, height, 1, width);
  pass(tmp, out, height, width, width, 1);
  return out;
}

// Otsu's threshold: the brightness that best splits the image in two.
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    weightBack += hist[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += t * hist[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

// The largest patch of connected pixels above the threshold, as each row's
// leftmost and rightmost pixel (-1 where the row has none), plus its size.
function largestPatch(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number
): { area: number; left: Int32Array; right: Int32Array } | null {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let bestLabel = 0;
  let bestArea = 0;
  let next = 0;
  for (let start = 0; start < gray.length; start++) {
    if (labels[start] !== 0 || gray[start] <= threshold) continue;
    next++;
    let area = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const x = p % width;
      if (x > 0 && labels[p - 1] === 0 && gray[p - 1] > threshold) {
        labels[p - 1] = next;
        stack[top++] = p - 1;
      }
      if (x < width - 1 && labels[p + 1] === 0 && gray[p + 1] > threshold) {
        labels[p + 1] = next;
        stack[top++] = p + 1;
      }
      if (p >= width && labels[p - width] === 0 && gray[p - width] > threshold) {
        labels[p - width] = next;
        stack[top++] = p - width;
      }
      if (p < gray.length - width && labels[p + width] === 0 && gray[p + width] > threshold) {
        labels[p + width] = next;
        stack[top++] = p + width;
      }
    }
    if (area > bestArea) {
      bestArea = area;
      bestLabel = next;
    }
  }
  if (!bestLabel) return null;
  const left = new Int32Array(height).fill(-1);
  const right = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (labels[row + x] !== bestLabel) continue;
      if (left[y] < 0) left[y] = x;
      right[y] = x;
    }
  }
  return { area: bestArea, left, right };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Convex hull (Andrew's monotone chain), counter-clockwise on screen.
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function triangle(a: Point, b: Point, c: Point): number {
  return Math.abs(cross(a, b, c)) / 2;
}

// The four hull corners enclosing the most area. For each diagonal i–k, the
// best third corner on each side only moves forward as k does, so this is
// quadratic rather than quartic in the hull's size.
export function largestQuad(hull: Point[]): Quad | null {
  const n = hull.length;
  if (n < 4) return null;
  const at = (i: number) => hull[i % n];
  let best = 0;
  let found: Point[] | null = null;
  for (let i = 0; i < n; i++) {
    let j = i + 1;
    let l = i + 3;
    for (let k = i + 2; k < i + n - 1; k++) {
      if (j >= k) j = k - 1;
      while (j + 1 < k && triangle(at(i), at(j + 1), at(k)) >= triangle(at(i), at(j), at(k))) j++;
      if (l <= k) l = k + 1;
      while (l + 1 < i + n && triangle(at(k), at(l + 1), at(i)) >= triangle(at(k), at(l), at(i))) l++;
      const area = triangle(at(i), at(j), at(k)) + triangle(at(k), at(l), at(i));
      if (area > best) {
        best = area;
        found = [at(i), at(j), at(k), at(l)];
      }
    }
  }
  return found ? orderCorners(found) : null;
}

function angleAt(prev: Point, p: Point, next: Point): number {
  const a = Math.atan2(prev.y - p.y, prev.x - p.x);
  const b = Math.atan2(next.y - p.y, next.x - p.x);
  let d = Math.abs(a - b);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

// Where the page is in a grey image, or null when there isn't a clear one.
// Meant for a small copy of the frame (a few hundred pixels across); scale
// the corners back up for the full-size photo.
export function detectDocument(gray: Uint8Array, width: number, height: number): Quad | null {
  if (width < 16 || height < 16) return null;
  const soft = blur(gray, width, height, Math.max(1, Math.round(Math.min(width, height) / 120)));
  const threshold = otsuThreshold(soft);
  const patch = largestPatch(soft, width, height, threshold);
  const frame = width * height;
  // Too small to be the page being scanned.
  if (!patch || patch.area < frame * 0.08) return null;

  const edge: Point[] = [];
  for (let y = 0; y < height; y++) {
    if (patch.left[y] < 0) continue;
    edge.push({ x: patch.left[y], y }, { x: patch.right[y] + 1, y }, { x: patch.left[y], y: y + 1 }, { x: patch.right[y] + 1, y: y + 1 });
  }
  const quad = largestQuad(convexHull(edge));
  if (!quad) return null;
  const area = quadArea(quad);
  // A page nearly fills its outline; a blob that doesn't isn't a page.
  if (area < frame * 0.08 || patch.area < area * 0.85) return null;
  // Nothing found but the frame itself (a white wall, or the threshold split
  // the page rather than the page from the table).
  const near = Math.min(width, height) * 0.03;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  if (quad.every((p, i) => Math.hypot(p.x - corners[i].x, p.y - corners[i].y) < near)) return null;
  // Tilted in perspective is fine; a sliver isn't a page.
  for (let i = 0; i < 4; i++) {
    const a = angleAt(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4]);
    if (a < 35 || a > 145) return null;
  }
  // Pull the corners in a hair: the outline comes from a blurred copy and
  // runs a touch wide, which would leave a sliver of table along the edges.
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const inset = Math.max(1.5, Math.min(width, height) * 0.006);
  return quad.map((p) => {
    const d = Math.hypot(cx - p.x, cy - p.y);
    return { x: p.x + ((cx - p.x) * inset) / d, y: p.y + ((cy - p.y) * inset) / d };
  }) as Quad;
}
