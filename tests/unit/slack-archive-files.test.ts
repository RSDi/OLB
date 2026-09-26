// Unit tests for how the Slack archive treats files it already holds when a
// message is saved again (a "Sync now" re-walk, a thread refresh, a
// backfill), and how it labels the placeholders Slack sends for files it
// deleted or is hiding behind the workspace's plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveMessageFiles, downloadAndStoreSlackFile, type ArchivedFile } from "../../lib/slack-archive/files.ts";
import type { SlackFile } from "../../lib/slack-archive/slack-api.ts";

function saved(id: string, name: string, overrides: Partial<ArchivedFile> = {}): ArchivedFile {
  return {
    id,
    name,
    mimetype: "image/jpeg",
    size: 1000,
    storage_path: `C1/1700000000.000100/${id}-${name}`,
    permalink: null,
    error: null,
    ...overrides,
  };
}

function slackFile(id: string, name: string): SlackFile {
  return { id, name, mimetype: "image/jpeg", size: 1000, url_private: `https://files.slack.com/${id}`, permalink: `https://slack.com/${id}` };
}

// What Slack sends in place of a deleted or hidden file: just an id and a mode.
function placeholder(id: string, mode: "tombstone" | "hidden_by_limit"): SlackFile {
  return { id, mode } as SlackFile;
}

// Records which files were handed to download, and "stores" each one.
function recordingDownload() {
  const calls: string[] = [];
  const download = async (f: SlackFile): Promise<ArchivedFile> => {
    calls.push(f.id);
    return saved(f.id, f.name, { storage_path: `C1/1700000000.000100/${f.id}-new` });
  };
  return { calls, download };
}

test("archiveMessageFiles reuses a saved file instead of downloading it again", async () => {
  const { calls, download } = recordingDownload();
  const kept = saved("F1", "roof.jpg");
  const files = await archiveMessageFiles([kept], [slackFile("F1", "roof.jpg")], download);
  assert.deepEqual(calls, []);
  assert.deepEqual(files, [kept]);
});

test("archiveMessageFiles keeps a saved file when Slack now sends a hidden or deleted placeholder", async () => {
  const { calls, download } = recordingDownload();
  const hidden = saved("F1", "roof.jpg");
  const deleted = saved("F2", "gutter.jpg");
  const files = await archiveMessageFiles(
    [hidden, deleted],
    [placeholder("F1", "hidden_by_limit"), placeholder("F2", "tombstone")],
    download,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(files, [hidden, deleted]);
});

test("archiveMessageFiles keeps saved files Slack no longer lists at all", async () => {
  const { download } = recordingDownload();
  const gone = saved("F1", "roof.jpg");
  const files = await archiveMessageFiles([gone], [], download);
  assert.deepEqual(files, [gone]);
});

test("archiveMessageFiles downloads new files and retries ones that failed before", async () => {
  const { calls, download } = recordingDownload();
  const failedBefore = saved("F2", "big.mov", { storage_path: null, error: "Upload failed: too large" });
  const files = await archiveMessageFiles(
    [saved("F1", "roof.jpg"), failedBefore],
    [slackFile("F1", "roof.jpg"), slackFile("F2", "big.mov"), slackFile("F3", "new.jpg")],
    download,
  );
  assert.deepEqual(calls, ["F2", "F3"]);
  assert.deepEqual(files.map((f) => f.id), ["F1", "F2", "F3"]);
  assert.ok(files.every((f) => f.storage_path));
});

test("downloadAndStoreSlackFile labels Slack's placeholders without downloading anything", async (t) => {
  t.mock.method(console, "warn", () => {});
  // Never touched: a file without url_private returns before any fetch or upload.
  const admin = {} as never;

  const deleted = await downloadAndStoreSlackFile(admin, placeholder("F1", "tombstone"), "C1", "1.1", "token");
  assert.equal(deleted.error, "Deleted in Slack before it was archived.");
  assert.equal(deleted.deleted_in_slack, true);
  assert.equal(deleted.storage_path, null);

  const hidden = await downloadAndStoreSlackFile(admin, placeholder("F2", "hidden_by_limit"), "C1", "1.1", "token");
  assert.equal(hidden.error, "Hidden by Slack's plan limit before it was archived.");
  assert.equal(hidden.deleted_in_slack, undefined);

  const external = await downloadAndStoreSlackFile(admin, { id: "F3", name: "doc", mimetype: "", size: 0 }, "C1", "1.1", "token");
  assert.equal(external.error, "No downloadable URL provided by Slack for this file type.");
});
