import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESUME_WINDOW_MS,
  fileFingerprint,
  findSavedUpload,
  friendlyUploadError,
  parseSavedUploads,
  removeSavedUpload,
  resumeRefusal,
  upsertSavedUpload,
  type SavedUpload,
} from "../../lib/film/resume.ts";
import { UNSENT_SWEEP_AFTER_MS } from "../../lib/film/types.ts";

const NOW = Date.parse("2026-11-18T18:00:00Z");
const entry = (over: Partial<SavedUpload> = {}): SavedUpload => ({
  fingerprint: "100:abc",
  uploadId: "u1",
  uploadUrl: "https://x.storage.supabase.co/storage/v1/upload/resumable/sign/abc",
  name: "IMG_1.MOV",
  savedAt: NOW - 60_000,
  ...over,
});

test("resume window ends before the unsent sweep clears the row", () => {
  assert.ok(RESUME_WINDOW_MS < UNSENT_SWEEP_AFTER_MS);
});

test("parseSavedUploads keeps good entries and drops junk, old and non-https ones", () => {
  const raw = JSON.stringify([
    entry(),
    entry({ uploadId: "old", fingerprint: "f2", savedAt: NOW - RESUME_WINDOW_MS - 1 }),
    entry({ uploadId: "bad", fingerprint: "f3", uploadUrl: "javascript:alert(1)" }),
    { nope: true },
  ]);
  assert.deepEqual(parseSavedUploads(raw, NOW).map((e) => e.uploadId), ["u1"]);
  assert.deepEqual(parseSavedUploads("not json", NOW), []);
  assert.deepEqual(parseSavedUploads(null, NOW), []);
});

test("saved list upsert / find / remove", () => {
  let list = upsertSavedUpload([], entry());
  list = upsertSavedUpload(list, entry({ uploadId: "u2" })); // same video, new upload replaces it
  assert.equal(list.length, 1);
  assert.equal(findSavedUpload(list, "100:abc")?.uploadId, "u2");
  assert.equal(findSavedUpload(list, "other"), null);
  assert.deepEqual(removeSavedUpload(list, "u2"), []);
});

test("resumeRefusal only allows a recent holding upload on the same team", () => {
  const row = { team: "u12", status: "holding", created_at: new Date(NOW - 3_600_000).toISOString(), file_deleted_at: null };
  assert.equal(resumeRefusal(row, "u12", NOW), null);
  assert.match(resumeRefusal(row, "u14", NOW) ?? "", /isn't on this team/);
  assert.match(resumeRefusal(null, "u12", NOW) ?? "", /isn't on this team/);
  assert.match(resumeRefusal({ ...row, status: "moved" }, "u12", NOW) ?? "", /can't be picked back up/);
  assert.match(resumeRefusal({ ...row, file_deleted_at: row.created_at }, "u12", NOW) ?? "", /can't be picked back up/);
  const old = { ...row, created_at: new Date(NOW - RESUME_WINDOW_MS).toISOString() };
  assert.match(resumeRefusal(old, "u12", NOW) ?? "", /too old/);
});

test("fileFingerprint ignores the name and changes with the bytes", async () => {
  const bytes = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
  const a = await fileFingerprint(new File([bytes], "IMG_1.MOV"));
  const b = await fileFingerprint(new File([bytes], "trim.ABC.MOV"));
  assert.equal(a, b);
  assert.match(a, /^3145728:[0-9a-f]{64}$/);
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  assert.notEqual(await fileFingerprint(new File([changed], "IMG_1.MOV")), a);
  assert.match(await fileFingerprint(new File([new Uint8Array(10)], "tiny")), /^10:/);
});

test("friendlyUploadError turns network noise into plain words", () => {
  assert.match(friendlyUploadError("tus: failed to upload chunk at offset 0, caused by [object ProgressEvent]"), /phone may have locked/);
  assert.match(friendlyUploadError(undefined), /Retry/);
  assert.equal(friendlyUploadError("This file is too big."), "This file is too big.");
});
