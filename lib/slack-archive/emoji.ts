// Shortcode → glyph resolution for both reaction pills and message body
// text. Backed by emoji-map.json, generated (via
// scripts/slack-archive-generate-emoji-map.ts) from the `emoji-datasource`
// package — the iamcal/emoji-data dataset Slack's own emoji picker is
// built from. Deliberately not the popular `node-emoji`/gemoji packages:
// those use a different, incompatible short-name vocabulary for some
// emoji (Slack's "hankey" is gemoji's "poop") and were missing newer
// additions entirely (Slack's "face_with_peeking_eye", Unicode 14.0) —
// both showed up as literal unconverted `:shortcode:` text in production.

import emojiMap from "./emoji-map.json";

const EMOJI_MAP: Record<string, string> = emojiMap;

// Workspace-custom emoji (no Unicode equivalent) aren't in this dataset and
// resolve to undefined — callers fall back to showing the raw `:name:` text.
export function resolveEmojiShortcode(name: string): string | undefined {
  return EMOJI_MAP[name];
}

const SHORTCODE_PATTERN = /:([a-z0-9_+-]+):/gi;

// Replaces every recognized `:shortcode:` in the text with its glyph in one
// pass; unrecognized shortcodes (custom emoji, typos) are left untouched.
export function emojify(text: string): string {
  return text.replace(SHORTCODE_PATTERN, (full, name: string) => EMOJI_MAP[name.toLowerCase()] ?? full);
}
