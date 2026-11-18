// Safari Favorites request /apple-touch-icon.png (180×180) instead of the
// tab favicon. The HTML <link> and the well-known path both have to exist,
// and middleware must not send signed-out visitors to /login for the PNG.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

function pngSize(rel: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(join(root, rel));
  assert.equal(buf.subarray(0, 8).toString("binary"), "\x89PNG\r\n\x1a\n", rel);
  assert.equal(buf.subarray(12, 16).toString(), "IHDR");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
  };
}

test("apple-touch-icon is an opaque 180×180 PNG at the well-known paths", () => {
  for (const rel of [
    "public/apple-touch-icon.png",
    "public/apple-touch-icon-precomposed.png",
    "app/apple-icon.png",
  ]) {
    const { width, height, colorType } = pngSize(rel);
    assert.equal(width, 180, rel);
    assert.equal(height, 180, rel);
    // 2 = RGB (opaque). 6 = RGBA; Safari tiles look wrong with transparency.
    assert.equal(colorType, 2, rel);
  }
});

test("every page emits the apple-touch-icon link; login is not gated for the PNG", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /rel:\s*"apple-touch-icon-precomposed"/);
  assert.match(layout, /url:\s*"\/apple-touch-icon-precomposed\.png"/);
  assert.match(layout, /url:\s*"\/apple-touch-icon\.png"/);
  assert.match(layout, /sizes:\s*"180x180"/);

  const mw = readFileSync(join(root, "middleware.ts"), "utf8");
  assert.match(mw, /matcher: \["\/portal\/:path\*", "\/login", "\/pair\/:path\*"\]/);
  assert.equal(mw.includes("apple-touch-icon"), false);

  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /source: "\/apple-touch-icon\.png"/);
  assert.match(config, /source: "\/apple-touch-icon-precomposed\.png"/);
  assert.match(config, /beforeFiles:/);
});
