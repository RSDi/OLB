/*
 * Regenerates lib/slack-archive/emoji-map.json from the `emoji-datasource`
 * package (the iamcal/emoji-data dataset — the same short-code vocabulary
 * Slack's own emoji picker is built from, unlike gemoji-based packages,
 * which use different, incompatible short names for some emoji: Slack
 * calls 💩 "hankey", gemoji calls it "poop"; Slack has "face_with_peeking_eye"
 * (🫣, Unicode 14.0), which older/smaller gemoji-derived datasets don't
 * carry at all). Run this after bumping the emoji-datasource devDependency
 * to pick up newly-added emoji.
 *
 * Usage:
 *   npx tsx scripts/slack-archive-generate-emoji-map.ts
 *
 * Emits a flat { shortcode: "😀" } map covering every short_name and
 * short_names alias — small and dependency-free at runtime (~45KB), instead
 * of shipping the full ~1.3MB emoji-datasource dataset (images, sort
 * metadata, per-vendor availability flags) to the browser.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface EmojiDatasourceEntry {
  unified: string;
  short_name: string;
  short_names: string[];
}

function toGlyph(unified: string): string {
  return unified
    .split("-")
    .map((codepoint) => String.fromCodePoint(parseInt(codepoint, 16)))
    .join("");
}

function main() {
  const emojiData = require("emoji-datasource/emoji.json") as EmojiDatasourceEntry[];
  const map: Record<string, string> = {};
  for (const entry of emojiData) {
    if (!entry.short_name) continue;
    const glyph = toGlyph(entry.unified);
    for (const name of [entry.short_name, ...(entry.short_names ?? [])]) {
      if (!(name in map)) map[name] = glyph;
    }
  }

  const outPath = join(process.cwd(), "lib", "slack-archive", "emoji-map.json");
  writeFileSync(outPath, JSON.stringify(map));
  console.log(`[slack-archive-generate-emoji-map] wrote ${Object.keys(map).length} shortcodes to ${outPath}`);
}

main();
