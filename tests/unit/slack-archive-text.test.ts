// Unit tests for the one-line snippet a Slack message gets in global search:
// the markup sync stores is cleaned up, and a match deep in a long message is
// brought into view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageSnippet } from "../../lib/slack-archive/text.ts";

test("decodes entities and reduces links to their labels", () => {
  assert.equal(
    messageSnippet("See the [bracket](https://example.com/b) &amp; the &lt;new&gt; schedule", "bracket"),
    "See the bracket & the <new> schedule",
  );
});

test("drops sync's backslash escapes and bold/strike/code marks", () => {
  assert.equal(
    messageSnippet("@Jeff\\_Malone can you bring the *water* jugs? ~no~ `cups`", "water"),
    "@Jeff_Malone can you bring the water jugs? no cups",
  );
});

test("collapses line breaks and runs of spaces", () => {
  assert.equal(messageSnippet("Practice\n\nmoved   to\tTuesday", "practice"), "Practice moved to Tuesday");
});

test("a match near the start leaves the message as is", () => {
  assert.equal(messageSnippet("Great practice today, thanks coaches", "practice"), "Great practice today, thanks coaches");
});

const LONG =
  "Reminder for everyone about the weekend: bring water, snacks, and both jerseys, " +
  "and remember the tournament bracket is posted on the club website tonight.";

test("a match deep in a message starts the snippet a few words before it", () => {
  const snippet = messageSnippet(LONG, "tourn");
  assert.ok(snippet.startsWith("…"), snippet);
  const at = snippet.indexOf("tournament");
  assert.ok(at > 1 && at <= 30, `match at ${at}: ${snippet}`);
  assert.ok(!snippet.startsWith("… "), "starts on a word, not a space");
});

test("prefers a match at the start of a word", () => {
  const text = "We should improve how we warm up before every single game, starting with practice on Monday";
  const snippet = messageSnippet(text, "pr");
  assert.ok(snippet.startsWith("…"), snippet);
  assert.ok(snippet.indexOf("practice") <= 30, snippet);
});

test("finds a stemmed match by the typed word's first letters", () => {
  const text = "Parents meeting after the game on Saturday to talk about summer coaching and camps";
  const snippet = messageSnippet(text, "coaches");
  assert.ok(snippet.startsWith("…"), snippet);
  assert.ok(snippet.includes("coaching"), snippet);
});

test("uses the earliest match among several words", () => {
  const snippet = messageSnippet(LONG, "website water");
  assert.ok(!snippet.startsWith("…"), `"water" is near the start: ${snippet}`);
});

test("curly quotes and dashes separate words; accented letters don't", () => {
  const text = "Reminder for everyone about the weekend plans and the long trip — we meet at the café by the gym";
  const snippet = messageSnippet(text, "“café”");
  assert.ok(snippet.startsWith("…"), snippet);
  assert.ok(snippet.indexOf("café") <= 30, snippet);
});

test("trims a long message at a word, with an ellipsis", () => {
  const snippet = messageSnippet(LONG, "reminder", 60);
  assert.ok(snippet.endsWith("…"), snippet);
  assert.ok(snippet.length <= 61, `${snippet.length}: ${snippet}`);
  assert.ok(LONG.startsWith(snippet.slice(0, -1)), "cut at the end of a whole word");
});

test("no visible match starts at the beginning", () => {
  assert.equal(messageSnippet("Gym keys are with Dave", "zzz"), "Gym keys are with Dave");
});

test("an empty message gives an empty snippet", () => {
  assert.equal(messageSnippet("", "practice"), "");
});
