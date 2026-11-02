// The Team Playbook animation, as plain math: where every player and the ball
// are at a moment of the play, and which arrows are drawn so far. The page
// (app/portal/team-playbook/Court.tsx) turns this into SVG. Tested in
// tests/unit/team-playbook-engine.test.ts.
//
// Time T runs in steps: T = 2.5 is halfway through the third step, and
// T = steps.length is the end of the play.

import type { PlayAction, PlayDiagram, Pt } from "./diagram.ts";

export interface Curve {
  pts: Pt[];
  len: number[];
  total: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Two points: a straight line. Three: a curve bending toward the middle one.
// More: straight segments.
export function sampleCurve(pts: Pt[], n = 40): Curve {
  const out: Pt[] = [];
  if (pts.length === 1) out.push(pts[0], pts[0]);
  else if (pts.length === 3) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push({
        x: u * u * pts[0].x + 2 * u * t * pts[1].x + t * t * pts[2].x,
        y: u * u * pts[0].y + 2 * u * t * pts[1].y + t * t * pts[2].y,
      });
    }
  } else {
    for (let k = 0; k < pts.length - 1; k++) {
      for (let i = k === 0 ? 0 : 1; i <= n; i++) {
        const t = i / n;
        out.push({ x: lerp(pts[k].x, pts[k + 1].x, t), y: lerp(pts[k].y, pts[k + 1].y, t) });
      }
    }
  }
  const len = [0];
  for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y));
  return { pts: out, len, total: len[len.length - 1] || 0 };
}

// The point at fraction f of the curve's length, and the part drawn so far.
export function pointAt(c: Curve, f: number): { p: Pt; drawn: Pt[] } {
  if (c.total === 0) return { p: c.pts[c.pts.length - 1], drawn: [c.pts[0]] };
  const d = clamp01(f) * c.total;
  let i = 1;
  while (i < c.len.length - 1 && c.len[i] < d) i++;
  const seg = c.len[i] - c.len[i - 1] || 1;
  const t = clamp01((d - c.len[i - 1]) / seg);
  const p = { x: lerp(c.pts[i - 1].x, c.pts[i].x, t), y: lerp(c.pts[i - 1].y, c.pts[i].y, t) };
  return { p, drawn: c.pts.slice(0, i).concat([p]) };
}

export interface Prepared {
  diagram: PlayDiagram;
  // Court state at the start of each step, plus one more for the end.
  starts: { pos: Record<string, Pt>; holder: string }[];
  // curves[step][action]: the moving player's path, from where they stood.
  curves: (Curve | null)[][];
}

export function prepare(d: PlayDiagram): Prepared {
  const pos: Record<string, Pt> = {};
  for (const p of d.players) pos[p.id] = { x: p.x, y: p.y };
  let holder = d.ball;
  const starts: Prepared["starts"] = [];
  const curves: Prepared["curves"] = [];
  for (const step of d.steps) {
    starts.push({ pos: { ...pos }, holder });
    const row: (Curve | null)[] = [];
    for (const a of step.actions) {
      if (a.type === "pass") {
        row.push(null);
        continue;
      }
      row.push(sampleCurve([pos[a.player], ...a.path]));
    }
    for (const a of step.actions) {
      if (a.type !== "pass") pos[a.player] = a.path[a.path.length - 1];
    }
    for (const a of step.actions) if (a.type === "pass") holder = a.to;
    curves.push(row);
  }
  starts.push({ pos: { ...pos }, holder });
  return { diagram: d, starts, curves };
}

function progress(a: PlayAction, u: number): number {
  const s = a.s ?? 0;
  const e = a.e ?? 1;
  return ease(clamp01((u - s) / (e - s || 1)));
}

// Where a player is at fraction u of step i.
function playerAt(p: Prepared, i: number, id: string, u: number): Pt {
  const step = p.diagram.steps[i];
  const k = step.actions.findIndex((a) => a.type !== "pass" && a.player === id);
  if (k < 0) return p.starts[i].pos[id];
  return pointAt(p.curves[i][k] as Curve, progress(step.actions[k], u)).p;
}

export interface Trail {
  kind: PlayAction["type"];
  pts: Pt[];
  done: boolean; // finished: gets its arrowhead (or screen bar)
  faded: boolean; // from the step before
}

export interface Frame {
  step: number; // the step being shown (the last one once the play is over)
  u: number; // how far through it, 0–1
  ended: boolean;
  pos: Record<string, Pt>;
  ball: Pt; // the ball's centre
  trails: Trail[];
}

export const BALL_OFFSET = { x: 14, y: -14 };

function stepTrails(p: Prepared, i: number, u: number, faded: boolean): Trail[] {
  const out: Trail[] = [];
  p.diagram.steps[i].actions.forEach((a, k) => {
    const f = progress(a, u);
    if (f <= 0) return;
    if (a.type === "pass") {
      const from = playerAt(p, i, a.from, a.s ?? 0);
      const to = playerAt(p, i, a.to, a.e ?? 1);
      out.push({ kind: "pass", pts: [from, { x: lerp(from.x, to.x, f), y: lerp(from.y, to.y, f) }], done: f >= 1, faded });
    } else {
      out.push({ kind: a.type, pts: pointAt(p.curves[i][k] as Curve, f).drawn, done: f >= 1, faded });
    }
  });
  return out;
}

export function frameAt(p: Prepared, T: number, showPrevious = true): Frame {
  const n = p.diagram.steps.length;
  const t = Math.max(0, Math.min(n, T));
  const ended = t >= n;
  const i = ended ? n - 1 : Math.floor(t);
  const u = ended ? 1 : t - i;
  const step = p.diagram.steps[i];

  const pos: Record<string, Pt> = {};
  for (const id of Object.keys(p.starts[i].pos)) pos[id] = playerAt(p, i, id, u);

  let holder = p.starts[i].holder;
  let flying: Pt | null = null;
  for (const a of step.actions) {
    if (a.type !== "pass") continue;
    const s = a.s ?? 0;
    const e = a.e ?? 1;
    if (u >= e) holder = a.to;
    else if (u > s) {
      const from = playerAt(p, i, a.from, s);
      const to = pos[a.to];
      const f = progress(a, u);
      flying = { x: lerp(from.x, to.x, f), y: lerp(from.y, to.y, f) };
    }
  }
  const at = pos[holder] ?? Object.values(pos)[0];
  const ball = flying ?? { x: at.x + BALL_OFFSET.x, y: at.y + BALL_OFFSET.y };

  const trails = [...(showPrevious && i > 0 ? stepTrails(p, i - 1, 1, true) : []), ...stepTrails(p, i, u, false)];
  return { step: i, u, ended, pos, ball, trails };
}

// For Edit: everyone where they stand at the start of step i, with the whole
// step's moves and passes drawn out.
export function stepOverview(p: Prepared, i: number): Frame {
  const start = p.starts[i];
  const at = start.pos[start.holder] ?? Object.values(start.pos)[0];
  return {
    step: i,
    u: 0,
    ended: false,
    pos: { ...start.pos },
    ball: { x: at.x + BALL_OFFSET.x, y: at.y + BALL_OFFSET.y },
    trails: stepTrails(p, i, 1, false),
  };
}

// The second in the coach's video where moment T of the play is said.
export function tToTime(d: PlayDiagram, T: number): number {
  const n = d.steps.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(T)));
  const s = d.steps[i].startSec ?? 0;
  const e = d.steps[i].endSec ?? s;
  return s + (e - s) * Math.max(0, Math.min(1, T - i));
}

// Following the coach's video: which moment of the play matches second `sec`.
// Before a step's start the play waits at that step; between steps it holds
// the finished step.
export function timeToT(d: PlayDiagram, sec: number): number {
  const steps = d.steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i].startSec;
    const e = steps[i].endSec;
    if (s == null || e == null) return 0;
    if (sec >= s) return Math.min(i + 1, i + (sec - s) / (e - s || 1));
  }
  return 0;
}

// The zigzag drawn for a dribble, through the same points.
export function zigzag(pts: Pt[]): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const off = i === 0 || i === pts.length - 1 ? 0 : (i % 6 < 3 ? 1 : -1) * 6;
    return { x: p.x - (dy / L) * off, y: p.y + (dx / L) * off };
  });
}
