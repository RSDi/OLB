import { test } from "node:test";
import assert from "node:assert/strict";
import {
  browserLabel,
  checkHelpUpload,
  helpUploadExt,
  isHelpUploadPath,
  isPhoneOrTablet,
  parseHelpBody,
  safePageUrl,
} from "../../lib/help-requests/model.ts";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("uploads: type and size are checked before upload", () => {
  assert.equal(checkHelpUpload("screenshot", "image/png", 1000), null);
  assert.match(checkHelpUpload("screenshot", "image/png", 6 * 1024 * 1024) ?? "", /5 MB/);
  assert.match(checkHelpUpload("screenshot", "video/mp4", 1000) ?? "", /PNG/);
  assert.equal(checkHelpUpload("video", "video/webm;codecs=vp9,opus", 1000), null);
  assert.match(checkHelpUpload("video", "video/mp4", 51 * 1024 * 1024) ?? "", /50 MB/);
  assert.equal(checkHelpUpload("video", "video/mp4", 0), "That file is empty.");
  assert.equal(helpUploadExt("video/quicktime"), "mov");
  assert.equal(helpUploadExt("image/jpeg"), "jpg");
});

test("a request can only name the asker's own upload of the right kind", () => {
  assert.equal(isHelpUploadPath("screenshot", USER, `${USER}/screenshot-${FILE}.png`), true);
  assert.equal(isHelpUploadPath("screenshot", USER, `${OTHER}/screenshot-${FILE}.png`), false);
  assert.equal(isHelpUploadPath("video", USER, `${USER}/screenshot-${FILE}.png`), false);
  assert.equal(isHelpUploadPath("video", USER, `${USER}/video-${FILE}.webm`), true);
  assert.equal(isHelpUploadPath("video", USER, `../${USER}/video-${FILE}.webm`), false);
  assert.equal(isHelpUploadPath("video", USER, null), false);
});

test("messages are trimmed and must not be empty or too long", () => {
  assert.deepEqual(parseHelpBody("  hi  "), { ok: true, body: "hi" });
  assert.equal(parseHelpBody("   ").ok, false);
  assert.equal(parseHelpBody("x".repeat(5001)).ok, false);
});

test("page addresses and browser labels", () => {
  assert.equal(safePageUrl("javascript:alert(1)"), null);
  assert.equal(safePageUrl("https://olb.example/portal"), "https://olb.example/portal");
  assert.equal(
    browserLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"),
    "Chrome · macOS",
  );
  assert.equal(isPhoneOrTablet("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5), true);
  assert.equal(isPhoneOrTablet("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
  assert.equal(isPhoneOrTablet("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
});
