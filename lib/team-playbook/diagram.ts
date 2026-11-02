// A Team Playbook play, as stored in team_plays.diagram (0162). Plain module:
// shared by the page, the server actions and the video reader, and tested
// on its own (tests/unit/team-playbook-diagram.test.ts).
//
// Court coordinates are tenths of a foot on a half court with the basket at
// the top: x runs 0–500 across the baseline (50 ft), y runs from the baseline
// (0) to half court (470). Out of bounds under the basket (inbounds plays)
// goes up to y = -40. COURT_SPOTS names the landmarks; the video reader is
// given the same list.

export interface Pt {
  x: number;
  y: number;
}

export type MoveKind = "cut" | "dribble" | "screen";

// s and e: when, inside its step, the action starts and ends (0–1), so a cut
// can wait for a screen. Missing means the whole step.
export type PlayAction =
  | { type: MoveKind; player: string; path: Pt[]; s?: number; e?: number }
  | { type: "pass"; from: string; to: string; s?: number; e?: number };

export interface PlayStep {
  title: string;
  note: string; // the caption: what the coach says about this step
  // Where this step is in the coach's video, in seconds. When every step has
  // them, Sound plays the coach's own voice and the animation follows it.
  startSec?: number | null;
  endSec?: number | null;
  actions: PlayAction[];
}

export interface PlayPlayer extends Pt {
  id: string; // "1"–"5"
}

export interface PlayDiagram {
  version: 1;
  players: PlayPlayer[];
  ball: string; // who starts with the ball (the inbounder on an inbounds play)
  steps: PlayStep[];
}

export const COURT = { minX: 0, maxX: 500, minY: -40, maxY: 470 } as const;
export const BASKET: Pt = { x: 250, y: 52 };

export const COURT_SPOTS: { name: string; x: number; y: number }[] = [
  { name: "basket", x: 250, y: 52 },
  { name: "left block", x: 180, y: 85 },
  { name: "right block", x: 320, y: 85 },
  { name: "left elbow", x: 190, y: 190 },
  { name: "right elbow", x: 310, y: 190 },
  { name: "free-throw line, middle", x: 250, y: 190 },
  { name: "left short corner", x: 120, y: 50 },
  { name: "right short corner", x: 380, y: 50 },
  { name: "left corner", x: 35, y: 30 },
  { name: "right corner", x: 465, y: 30 },
  { name: "left wing", x: 90, y: 215 },
  { name: "right wing", x: 410, y: 215 },
  { name: "top of the key", x: 250, y: 290 },
  { name: "left slot", x: 160, y: 270 },
  { name: "right slot", x: 340, y: 270 },
  { name: "half court, middle", x: 250, y: 450 },
  { name: "inbounder under the basket, left of the lane", x: 170, y: -22 },
  { name: "inbounder under the basket, right of the lane", x: 330, y: -22 },
];

export const MAX_STEPS = 12;
export const MAX_ACTIONS = 8;
export const MAX_PLAYERS = 5;

const MOVE_KINDS: MoveKind[] = ["cut", "dribble", "screen"];

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function point(v: unknown): Pt | null {
  if (Array.isArray(v)) v = { x: v[0], y: v[1] };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const x = num(o.x);
  const y = num(o.y);
  if (x == null || y == null) return null;
  return { x: Math.round(clamp(x, COURT.minX, COURT.maxX)), y: Math.round(clamp(y, COURT.minY, COURT.maxY)) };
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function playerId(v: unknown): string {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return s.slice(0, 3);
}

// Fractions inside a step. A pair that makes no sense becomes the whole step.
function timing(sv: unknown, ev: unknown): { s?: number; e?: number } {
  const s = num(sv);
  const e = num(ev);
  const out: { s?: number; e?: number } = {};
  const cs = s == null ? 0 : clamp(s, 0, 1);
  const ce = e == null ? 1 : clamp(e, 0, 1);
  if (ce - cs < 0.05) return out;
  if (s != null && cs > 0) out.s = Math.round(cs * 100) / 100;
  if (e != null && ce < 1) out.e = Math.round(ce * 100) / 100;
  return out;
}

// Anything that came from the database, a form or the video reader goes
// through here: unknown players and broken actions are dropped, points are
// kept on the court, and step times run forward. Null when there's no play
// left to show (no players or no steps).
export function normalizeDiagram(raw: unknown): PlayDiagram | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const players: PlayPlayer[] = [];
  for (const p of Array.isArray(o.players) ? o.players : []) {
    if (!p || typeof p !== "object") continue;
    const id = playerId((p as Record<string, unknown>).id);
    const pt = point(p);
    if (!id || !pt || players.some((q) => q.id === id)) continue;
    players.push({ id, ...pt });
    if (players.length === MAX_PLAYERS) break;
  }
  if (!players.length) return null;
  const known = new Set(players.map((p) => p.id));

  const steps: PlayStep[] = [];
  for (const s of Array.isArray(o.steps) ? o.steps : []) {
    if (!s || typeof s !== "object") continue;
    const so = s as Record<string, unknown>;
    const actions: PlayAction[] = [];
    for (const a of Array.isArray(so.actions) ? so.actions : []) {
      if (!a || typeof a !== "object") continue;
      const ao = a as Record<string, unknown>;
      const t = timing(ao.s, ao.e);
      if (ao.type === "pass") {
        const from = playerId(ao.from);
        const to = playerId(ao.to);
        if (known.has(from) && known.has(to) && from !== to) actions.push({ type: "pass", from, to, ...t });
      } else if (MOVE_KINDS.includes(ao.type as MoveKind)) {
        const player = playerId(ao.player ?? ao.p);
        // A player moves once per step; a second move for them is dropped.
        if (!known.has(player) || actions.some((x) => x.type !== "pass" && x.player === player)) continue;
        const path = (Array.isArray(ao.path) ? ao.path : []).map(point).filter((q): q is Pt => !!q).slice(0, 3);
        if (path.length) actions.push({ type: ao.type as MoveKind, player, path, ...t });
      }
      if (actions.length === MAX_ACTIONS) break;
    }
    const step: PlayStep = {
      title: text(so.title, 80) || `Step ${steps.length + 1}`,
      note: text(so.note, 400),
      actions,
    };
    const start = num(so.startSec);
    const end = num(so.endSec);
    if (start != null && end != null && start >= 0 && end > start) {
      step.startSec = Math.round(start * 10) / 10;
      step.endSec = Math.round(end * 10) / 10;
    }
    steps.push(step);
    if (steps.length === MAX_STEPS) break;
  }
  if (!steps.length) return null;

  // Step times must run forward through the video; if they don't, drop them
  // all and fall back to the even pace.
  const timed = steps.every((s) => s.startSec != null);
  const ordered = timed && steps.every((s, i) => i === 0 || (s.startSec as number) >= (steps[i - 1].startSec as number));
  if (!ordered) {
    for (const s of steps) {
      delete s.startSec;
      delete s.endSec;
    }
  }

  const ballId = playerId(o.ball);
  return { version: 1, players, ball: known.has(ballId) ? ballId : players[0].id, steps };
}

// True when every step knows where it is in the coach's video, so playback
// can follow their voice.
export function hasVideoTiming(d: PlayDiagram): boolean {
  return d.steps.length > 0 && d.steps.every((s) => s.startSec != null && s.endSec != null);
}

// A starting point for a play typed in by hand: five players in a 5-out set.
export function blankDiagram(): PlayDiagram {
  return {
    version: 1,
    players: [
      { id: "1", x: 250, y: 290 },
      { id: "2", x: 90, y: 215 },
      { id: "3", x: 410, y: 215 },
      { id: "4", x: 35, y: 30 },
      { id: "5", x: 465, y: 30 },
    ],
    ball: "1",
    steps: [{ title: "Step 1", note: "", actions: [] }],
  };
}
