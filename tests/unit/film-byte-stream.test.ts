import { test } from "node:test";
import assert from "node:assert/strict";
import { ByteReader } from "../../lib/film/byte-stream.ts";
import { isTransientFilmError } from "../../lib/film/transient.ts";

function source(chunks: number[], delayMs = 0): AsyncIterator<Uint8Array> {
  let i = 0;
  return {
    async next() {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (i >= chunks.length) return { done: true, value: undefined };
      const n = chunks[i++];
      return { done: false, value: new Uint8Array(n).fill(i) };
    },
  };
}

test("hands out exact-size pieces across uneven chunks and tracks position", async () => {
  const r = new ByteReader(source([3, 5, 2, 7]), 100);
  const far = Date.now() + 5000;
  const a = await r.read(4, far);
  assert.ok("bytes" in a);
  assert.equal(a.bytes.length, 4);
  assert.equal(r.position, 104);
  const b = await r.read(10, far);
  assert.ok("bytes" in b);
  assert.equal(b.bytes.length, 10);
  const c = await r.read(10, far);
  assert.ok("bytes" in c);
  assert.equal(c.bytes.length, 3, "short piece at the end of the file");
  assert.equal(r.position, 117);
  assert.deepEqual(await r.read(10, far), { ended: true });
});

test("gives up at the deadline instead of waiting forever", async () => {
  const r = new ByteReader(source([4], 200), 0);
  const started = Date.now();
  const res = await r.read(4, Date.now() + 30);
  assert.deepEqual(res, { timedOut: true });
  assert.ok(Date.now() - started < 150);
  r.close();
});

test("dropped connections are temporary; refusals are not", () => {
  assert.equal(isTransientFilmError(new TypeError("terminated")), true);
  assert.equal(isTransientFilmError(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })), true);
  const body = Object.assign(new Error("Body Timeout Error"), { code: "UND_ERR_BODY_TIMEOUT" });
  assert.equal(isTransientFilmError(body), true);
  assert.equal(isTransientFilmError(new Error("YouTube 503: backend error")), true);
  assert.equal(isTransientFilmError(new Error("YouTube returned 500.")), true);
  assert.equal(isTransientFilmError(new Error("YouTube upload session expired.")), false);
  assert.equal(isTransientFilmError(new Error("YouTube refused the upload (check the connected channel and API quota).")), false);
  assert.equal(isTransientFilmError(new Error("Object not found")), false);
});
