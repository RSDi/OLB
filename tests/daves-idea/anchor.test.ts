// Unit tests for resolveAnchorMs (B4) — the deterministic quote→ms resolver.
// Pure, no network: the matcher is the riskiest piece (the LLM only emits a
// quote; this code turns it into a real utterance offset or null).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAnchorMs } from "../../lib/daves-idea/anchor.ts";

const utts = [
  { text: "Okay so the bus deposit, somebody's gotta get that in by the 15th.", start: 12000 },
  { text: "Right, and Dave said he'd bring the cigars to the men's retreat.", start: 21500 },
  { text: "We should also probably book the venue soon.", start: 30000 },
];

test("tier 1: exact verbatim substring, smart-punctuation folded", () => {
  // curly apostrophe in the quote vs straight in utterance → normalizer folds both
  assert.equal(resolveAnchorMs("somebody’s gotta get that in", utts), 12000);
});

test("tier 1: quote spanning a speaker boundary anchors to the earlier utterance", () => {
  assert.equal(resolveAnchorMs("by the 15th right and dave", utts), 12000);
});

test("tier 1: second utterance matches to its own start", () => {
  assert.equal(resolveAnchorMs("bring the cigars to the men's retreat", utts), 21500);
});

test("tier 3: paraphrase-ish token overlap clears the bar", () => {
  assert.equal(resolveAnchorMs("dave bring cigars men's retreat", utts), 21500);
});

test("tier 2: a too-long quote that contains a full utterance verbatim", () => {
  // The LLM over-copies — the quote isn't a verbatim transcript substring
  // (tier 1 fails on the "so listen" prefix) but it fully contains utterance 2,
  // so reverse-contains anchors to that utterance's start.
  assert.equal(
    resolveAnchorMs("so listen, right and Dave said he'd bring the cigars to the men's retreat, that was decided", utts),
    21500,
  );
});

test("tier 3 epsilon: an exact 0.6 score with a 0.2 gap still anchors", () => {
  // Forces the Jaccard tier (no verbatim substring either direction — the
  // connectors differ, so tier 1 + tier 2 both miss) at the EXACT float
  // boundary: best = 3/5 = 0.6, runner-up = 2/5 = 0.4, gap = 0.2 which IEEE-754
  // computes as 0.19999999999999998. Without the epsilon guard this returns
  // null; with it, the legitimately-confident match anchors.
  const u = [
    { text: "alpha the bravo the charlie", start: 1000 }, // {alpha,bravo,charlie} ∩ q = 3 → 3/5 = 0.6
    { text: "alpha to bravo", start: 2000 }, // {alpha,bravo} ∩ q = 2 → 2/5 = 0.4
    { text: "nothing here", start: 3000 },
  ];
  assert.equal(resolveAnchorMs("alpha and bravo and charlie and delta and echo", u), 1000);
});

test("null: no utterances", () => {
  assert.equal(resolveAnchorMs("anything", []), null);
});

test("null: hallucinated quote not present in transcript", () => {
  assert.equal(resolveAnchorMs("schedule the fireworks budget meeting", utts), null);
});

test("null: anchor_quote omitted", () => {
  assert.equal(resolveAnchorMs(null, utts), null);
});

test("tier 1 has no length floor: a short verbatim substring still anchors", () => {
  // "book the venue" appears verbatim in utterance 3 — exact substring wins
  // regardless of length. (The LLM is instructed to emit 4-15 word spans, so a
  // spuriously-short anchor is unlikely in practice.)
  assert.equal(resolveAnchorMs("book the venue", utts), 30000);
});

test("null: weak token overlap (below the Jaccard bar) does not fire tier 3", () => {
  // Shares only book/venue with utterance 3 against a large union → low
  // Jaccard, no verbatim substring → stays null rather than mis-seeking.
  assert.equal(resolveAnchorMs("reconfirm whether the venue booking covers parking too", utts), null);
});
