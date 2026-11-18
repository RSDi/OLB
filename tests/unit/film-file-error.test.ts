import { test } from "node:test";
import assert from "node:assert/strict";
import { filmFileErrorMessage } from "../../lib/film/file-error.ts";

test("a missing storage object becomes a plain-words message", () => {
  const msg = filmFileErrorMessage(new Error("Object not found"), "IMG_0060.MOV");
  assert.match(msg, /IMG_0060\.MOV never finished uploading/);
  assert.doesNotMatch(msg, /Object not found/);
});

test("other errors pass through", () => {
  assert.equal(filmFileErrorMessage(new Error("Bucket offline"), "a.mov"), "Bucket offline");
  assert.equal(filmFileErrorMessage("x", "a.mov"), "Couldn't make a download link.");
});
