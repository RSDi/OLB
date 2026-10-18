import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmailHtml } from "../../lib/email-archive/sanitize.ts";

test("keeps ordinary email markup", () => {
  const html = "<p>Hi!</p><ul><li>Decorate a trunk</li></ul><a href=\"https://nelson.farm\">sign up</a>";
  const out = sanitizeEmailHtml(html);
  assert.match(out, /<p>Hi!<\/p>/);
  assert.match(out, /<li>Decorate a trunk<\/li>/);
  assert.match(out, /href="https:\/\/nelson.farm"/);
});

test("drops scripts, images, and javascript URLs", () => {
  const dirty = `<p>Hi</p><script>alert(1)</script><img src="https://evil/pixel.gif" onerror="alert(1)"><a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe>`;
  const out = sanitizeEmailHtml(dirty);
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("iframe"), false);
  assert.equal(out.includes("<img"), false);
  assert.equal(out.includes("javascript:"), false);
  assert.equal(out.includes("onerror"), false);
  assert.match(out, /Hi/);
});

test("empty input is empty output", () => {
  assert.equal(sanitizeEmailHtml(""), "");
  assert.equal(sanitizeEmailHtml(null), "");
});
