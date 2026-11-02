// Team Playbook (0162): the play format (lib/team-playbook/diagram.ts), the
// animation math (engine.ts) and the caption lines (transcript.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankDiagram, hasVideoTiming, normalizeAbout, normalizeDiagram, type PlayDiagram } from "../../lib/team-playbook/diagram.ts";
import { BALL_OFFSET, frameAt, prepare, stepOverview, timeToT, tToTime } from "../../lib/team-playbook/engine.ts";
import { linesForPrompt, wordsToLines } from "../../lib/team-playbook/transcript.ts";

const horns = (): PlayDiagram => ({
  version: 1,
  players: [
    { id: "1", x: 250, y: 300 },
    { id: "4", x: 190, y: 195 },
    { id: "5", x: 310, y: 195 },
  ],
  ball: "1",
  steps: [
    { title: "Enter", note: "1 to 4.", startSec: 2, endSec: 6, actions: [{ type: "pass", from: "1", to: "4" }] },
    {
      title: "Flare",
      note: "5 screens, 1 fades.",
      startSec: 6,
      endSec: 12,
      actions: [
        { type: "screen", player: "5", path: [{ x: 300, y: 255 }], e: 0.5 },
        { type: "cut", player: "1", path: [{ x: 300, y: 300 }, { x: 405, y: 235 }], s: 0.4 },
      ],
    },
  ],
});

test("normalizeDiagram keeps a good play as it is", () => {
  assert.deepEqual(normalizeDiagram(horns()), horns());
});

test("normalizeDiagram drops what doesn't fit and keeps players on the court", () => {
  const d = normalizeDiagram({
    players: [
      { id: 1, x: 600, y: -100 },
      { id: "2", x: "90", y: 215 },
      { id: "2", x: 1, y: 1 },
      { id: "", x: 1, y: 1 },
    ],
    ball: "9",
    steps: [
      {
        title: "  Go  ",
        note: "",
        actions: [
          { type: "cut", player: "7", path: [{ x: 1, y: 1 }] }, // nobody called 7
          { type: "cut", player: "1", path: [] }, // nowhere to go
          { type: "dribble", p: "1", path: [[100, 100]] },
          { type: "cut", player: "1", path: [{ x: 5, y: 5 }] }, // 1 already moves
          { type: "pass", from: "1", to: "1" },
          { type: "pass", from: "1", to: "2", s: 0.9, e: 0.92 }, // too short: the whole step
          { type: "teleport", player: "2" },
        ],
      },
    ],
  });
  assert.ok(d);
  assert.deepEqual(d.players, [
    { id: "1", x: 500, y: -40 },
    { id: "2", x: 90, y: 215 },
  ]);
  assert.equal(d.ball, "1");
  assert.equal(d.steps[0].title, "Go");
  assert.deepEqual(d.steps[0].actions, [
    { type: "dribble", player: "1", path: [{ x: 100, y: 100 }] },
    { type: "pass", from: "1", to: "2" },
  ]);
});

test("normalizeDiagram: no players or no steps is no play", () => {
  assert.equal(normalizeDiagram(null), null);
  assert.equal(normalizeDiagram({ players: [], steps: [{ title: "x", actions: [] }] }), null);
  assert.equal(normalizeDiagram({ players: [{ id: "1", x: 1, y: 1 }], steps: [] }), null);
});

test("step times that run backwards are dropped from every step", () => {
  const d = horns();
  d.steps[1].startSec = 1;
  const n = normalizeDiagram(d)!;
  assert.equal(hasVideoTiming(n), false);
  assert.equal(n.steps[0].startSec, undefined);
  assert.equal(hasVideoTiming(normalizeDiagram(horns())!), true);
  assert.equal(hasVideoTiming(blankDiagram()), false);
});

test("the engine moves players along their paths and passes the ball", () => {
  const p = prepare(horns());
  const start = frameAt(p, 0);
  assert.deepEqual(start.pos["1"], { x: 250, y: 300 });
  assert.deepEqual(start.ball, { x: 250 + BALL_OFFSET.x, y: 300 + BALL_OFFSET.y });

  // After the entry pass, 4 has it.
  const afterPass = frameAt(p, 1);
  assert.deepEqual(afterPass.ball, { x: 190 + BALL_OFFSET.x, y: 195 + BALL_OFFSET.y });

  // Halfway through the pass the ball is between them, with a pass trail.
  const mid = frameAt(p, 0.5);
  assert.ok(mid.ball.x < 250 && mid.ball.x > 190);
  assert.equal(mid.trails[0].kind, "pass");
  assert.equal(mid.trails[0].done, false);

  // The flare: 1 waits for the screen, then ends on the wing.
  assert.deepEqual(frameAt(p, 1.3).pos["1"], { x: 250, y: 300 });
  const end = frameAt(p, 2);
  assert.equal(end.ended, true);
  assert.deepEqual(end.pos["1"], { x: 405, y: 235 });
  assert.deepEqual(end.pos["5"], { x: 300, y: 255 });
  // The step before shows faded.
  assert.ok(end.trails.some((t) => t.faded && t.kind === "pass"));
  assert.ok(!frameAt(p, 2, false).trails.some((t) => t.faded));
});

test("stepOverview shows a step's start with its moves drawn out", () => {
  const p = prepare(horns());
  const o = stepOverview(p, 1);
  assert.deepEqual(o.pos["1"], { x: 250, y: 300 });
  assert.equal(o.trails.length, 2);
  assert.ok(o.trails.every((t) => t.done));
});

test("the play follows the coach's video", () => {
  const d = horns();
  assert.equal(timeToT(d, 0), 0);
  assert.equal(timeToT(d, 4), 0.5);
  assert.equal(timeToT(d, 6), 1);
  assert.equal(timeToT(d, 9), 1.5);
  assert.equal(timeToT(d, 30), 2);
  assert.equal(tToTime(d, 1.5), 9);
  assert.equal(tToTime(d, 0), 2);
});

test("caption lines break at sentences, pauses and long runs", () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });
  const lines = wordsToLines([
    w("One", 0, 200),
    w("passes", 250, 500),
    w("in.", 550, 800),
    w("Five", 900, 1100),
    w("screens", 1150, 1400),
    w("then", 3000, 3200), // a long pause first
    w("fades", 3250, 3500),
  ]);
  assert.deepEqual(lines, [
    { text: "One passes in.", start: 0, end: 0.8 },
    { text: "Five screens", start: 0.9, end: 1.4 },
    { text: "then fades", start: 3, end: 3.5 },
  ]);
  assert.equal(linesForPrompt(lines.slice(0, 1)), "[0.0–0.8s] One passes in.");
  const many = Array.from({ length: 30 }, (_, i) => w("go", i * 100, i * 100 + 50));
  assert.equal(wordsToLines(many).length, 3);
});

test("coach's notes are kept, trimmed, and dropped when empty", () => {
  const d = normalizeDiagram({
    ...horns(),
    about: { why: "  Get our shooter a look.  ", when: "", keys: ["Sell the cut", "", 7, ...Array(10).fill("Wait")] },
  })!;
  assert.deepEqual(d.about, { why: "Get our shooter a look.", when: "", keys: ["Sell the cut", "Wait", "Wait", "Wait", "Wait", "Wait"] });
  assert.equal(normalizeDiagram({ ...horns(), about: { why: " ", when: "", keys: [] } })!.about, undefined);
  assert.equal(normalizeAbout(null), null);
  assert.equal("about" in normalizeDiagram(horns())!, false);
});
