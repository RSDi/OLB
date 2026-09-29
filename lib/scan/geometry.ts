// Corner maths for the document scanner (app/components/DocumentScanner.tsx):
// putting a page's four corners in order, sizing the straightened page, and
// the perspective transform that maps it flat. Pure and safe to import from
// client components.

export interface Point {
  x: number;
  y: number;
}

// Top-left, top-right, bottom-right, bottom-left, in image pixels (y down).
export type Quad = [Point, Point, Point, Point];

// A 3×3 perspective transform, row by row, with the last entry fixed at 1.
export type Homography = [number, number, number, number, number, number, number, number, number];

// Puts four corners in the order top-left, top-right, bottom-right,
// bottom-left, whatever order they came in and however the page is turned.
export function orderCorners(points: Point[]): Quad {
  if (points.length !== 4) throw new Error("A page has four corners.");
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  // Clockwise on screen (y runs down), then start from the top-left-most.
  const round = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (round[i].x + round[i].y < round[start].x + round[start].y) start = i;
  }
  return [0, 1, 2, 3].map((i) => ({ ...round[(start + i) % 4] })) as Quad;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// True when the corners, in order, make a proper four-sided shape: no edges
// crossing and no corner folded in, so the page can be straightened.
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-9) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type Vec3 = [number, number, number];

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// The page's real width ÷ height, undoing the perspective of a photo taken at
// an angle (which makes the near edge look longer than the far one). This is
// Zhang & He's method ("Whiteboard scanning and image enhancement", 2007),
// taking the lens's centre to be the photo's centre. When the corners can't
// pin down the lens (a page shot nearly square-on), a typical phone lens is
// assumed instead; square-on, any lens gives the same answer.
export function pageAspect(q: Quad, imageWidth: number, imageHeight: number): number {
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  // Zhang & He number the corners top-left, top-right, bottom-left, bottom-right.
  const [m1, m2, m3, m4] = [q[0], q[1], q[3], q[2]].map((p): Vec3 => [p.x - cx, p.y - cy, 1]);
  const k2 = dot3(cross3(m1, m4), m3) / dot3(cross3(m2, m4), m3);
  const k3 = dot3(cross3(m1, m4), m2) / dot3(cross3(m3, m4), m2);
  const n2: Vec3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: Vec3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const side = Math.max(imageWidth, imageHeight);
  let f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  // A phone's main camera (about 26 mm, full-frame equivalent) has a focal
  // length of about ¾ of the photo's long side, in pixels. Far outside that,
  // the estimate is noise.
  if (!Number.isFinite(f2) || f2 < (side * 0.3) ** 2 || f2 > (side * 3) ** 2) f2 = (side * 0.75) ** 2;
  const aspect = Math.sqrt(
    (n2[0] ** 2 + n2[1] ** 2 + f2 * n2[2] ** 2) / (n3[0] ** 2 + n3[1] ** 2 + f2 * n3[2] ** 2)
  );
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

// The straightened page's size. Without `aspect` it's the longer of each pair
// of opposite edges; with it, the shorter way is stretched to match. Either
// way it's scaled down (never up) so the long side fits in maxSide.
export function outputSize(q: Quad, maxSide: number, aspect?: number): { width: number; height: number } {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  if (aspect && Number.isFinite(aspect) && aspect > 0) {
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
  }
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// The corners of the whole image, for when no page was found.
export function fullFrame(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

// The transform taking each `from` corner to the matching `to` corner.
export function homography(from: Quad, to: Quad): Homography {
  // Eight equations in eight unknowns, solved by Gaussian elimination.
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("Those corners don't make a page.");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c];
    }
  }
  const h = m.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(h: Homography, p: Point): Point {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
}

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Cuts the page out of `src` and lays it flat at width × height, sampling
// between pixels so edges stay smooth.
export function warpPerspective(src: RgbaImage, q: Quad, width: number, height: number): RgbaImage {
  const h = homography(fullFrame(width, height), q);
  const out = new Uint8ClampedArray(width * height * 4);
  const { data, width: sw, height: sh } = src;
  const maxX = sw - 1;
  const maxY = sh - 1;
  let o = 0;
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    // Everything that depends only on the row, so the inner loop just adds.
    const bx = h[1] * py + h[2];
    const by = h[4] * py + h[5];
    const bd = h[7] * py + h[8];
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const d = h[6] * px + bd;
      let sx = (h[0] * px + bx) / d - 0.5;
      let sy = (h[3] * px + by) / d - 0.5;
      if (sx < 0) sx = 0;
      else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0;
      else if (sy > maxY) sy = maxY;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
        const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
  return { data: out, width, height };
}
