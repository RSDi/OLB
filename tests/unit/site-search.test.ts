// The /search page's engine (lib/site-search/text.ts): reading a rendered
// page, ranking its passages, and numbering sources for the AI answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerContext, extractPage, search, snippet, stem } from "../../lib/site-search/text.ts";

const html = (title: string, main: string) =>
  `<html><head><title>${title} — Omaha Lightning Basketball</title>` +
  `<meta name="description" content="About &amp; more"></head>` +
  `<body><header><nav>Coaches Sponsors Contact</nav></header>` +
  `<main id="page">${main}</main><footer>Col 3:23</footer>` +
  `<script>self.__next_f.push("practice")</script></body></html>`;

const programs = extractPage(
  "/programs",
  html(
    "2026-27 Season",
    `<h1>2026-27 Season</h1><h2>8U-12U Competitive</h2>` +
      `<p>Two practices per week.</p><p><strong>Tuesday:</strong><br>10u, 5-7pm @ St. Mark&rsquo;s</p>` +
      `<svg><text>icon</text></svg><h3>Cost</h3><p>Season fee is $525.</p>`,
  ),
);
const coaches = extractPage(
  "/coaches",
  html("Coaches", `<h1>Coaches</h1><p>Our volunteer coaches love the game.</p>`),
);

test("extractPage reads only <main>, splits at headings and decodes entities", () => {
  assert.equal(programs.title, "2026-27 Season");
  assert.equal(programs.description, "About & more");
  const all = programs.passages.map((p) => `${p.heading}: ${p.text}`).join("\n");
  assert.doesNotMatch(all, /Sponsors|Col 3:23|icon|__next_f/);
  const tuesday = programs.passages.find((p) => p.text.includes("Tuesday"));
  assert.equal(tuesday?.heading, "8U-12U Competitive");
  assert.match(tuesday!.text, /St\. Mark’s/);
  assert.equal(programs.passages.find((p) => p.text.includes("$525"))?.heading, "Cost");
});

test("stem joins common word forms", () => {
  assert.equal(stem("practices"), stem("practice"));
  assert.equal(stem("practicing"), stem("practice"));
  assert.equal(stem("coaches"), stem("coach"));
  assert.equal(stem("games"), stem("game"));
});

test("search ranks the page that answers the question first", () => {
  const results = search([coaches, programs], "When are practices?");
  assert.equal(results[0].path, "/programs");
  assert.equal(results[0].heading, "8U-12U Competitive");
  assert.ok(results[0].snippet.some((p) => p.hit && /practices/i.test(p.text)));
  assert.match(results[0].href, /^\/programs#:~:text=/);
  assert.equal(search([coaches, programs], "the and of").length, 0);
});

test("snippet windows long text around the first match", () => {
  const long = `${"filler words here ".repeat(40)}the season fee is $525 ${"more filler ".repeat(40)}`;
  const parts = snippet(long, "fee");
  const text = parts.map((p) => p.text).join("");
  assert.ok(text.startsWith("… "));
  assert.ok(text.endsWith(" …"));
  assert.ok(parts.some((p) => p.hit && p.text === "fee"));
});

test("answerContext numbers every page, best match first", () => {
  const { sources, context } = answerContext([coaches, programs], "season fee");
  assert.deepEqual(sources.map((s) => s.path), ["/programs", "/coaches"]);
  assert.match(context, /^\[1\] 2026-27 Season \(\/programs\)/);
  assert.match(context, /\[2\] Coaches \(\/coaches\)/);
});
