import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filmUploadUrl } from "../../lib/film/upload-url.ts";

test("the family upload URL is the site origin plus /t/slug, never a code", () => {
  assert.equal(filmUploadUrl("https://olb.example.org", "14u-white"), "https://olb.example.org/t/14u-white");
  assert.equal(filmUploadUrl("https://olb.example.org/", "14U-White"), "https://olb.example.org/t/14u-white");
  assert.equal(filmUploadUrl("https://preview.vercel.app", "16u-black"), "https://preview.vercel.app/t/16u-black");
  assert.equal(filmUploadUrl("", "14u-white"), "");
  assert.equal(filmUploadUrl("https://olb.example.org", ""), "");
  const url = filmUploadUrl("https://olb.example.org", "14u-white");
  assert.equal(url.startsWith("https://"), true);
  assert.equal(url.includes("?"), false);
  assert.equal(url.includes("white-code"), false);
  assert.equal(url.endsWith("/t/14u-white"), true);
});

test("Settings → Film copies the absolute upload URL, not the team code", () => {
  const src = readFileSync(join(import.meta.dirname, "../../app/portal/settings/FilmSettingsTab.tsx"), "utf8");
  assert.match(src, /copyText\(uploadUrl\)/);
  assert.match(src, /filmUploadUrl\(origin, team\.slug\)/);
  assert.equal(src.includes("copyText(revealed"), false);
  assert.equal(src.includes("copyText(code"), false);
  assert.equal(/Family page:.*\/t\//.test(src), false);
});
