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

// What Slack sends for a Google Doc added through the Google Drive app.
function googleDoc(id: string): SlackFile {
  return {
    id,
    name: "9-14-26 Lightning Board Meeting",
    mimetype: "application/vnd.google-apps.document",
    size: 0,
    mode: "external",
    is_external: true,
    external_type: "gdrive",
    external_url: "https://docs.google.com/document/d/abc/edit",
    url_private: "https://docs.google.com/document/d/abc/edit?usp=drivesdk",
    permalink: `https://example.slack.com/files/U1/${id}/doc`,
  };
}

test("downloadAndStoreSlackFile saves a Google Doc as a link, without fetching it", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called");
  });
  const admin = {} as never; // no upload either

  const doc = await downloadAndStoreSlackFile(admin, googleDoc("F5"), "C1", "1.1", "token");
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(doc.external, true);
  assert.equal(doc.error, null);
  assert.equal(doc.storage_path, null);
  assert.equal(doc.permalink, "https://docs.google.com/document/d/abc/edit");
});

test("downloadAndStoreSlackFile never sends the token to a URL that isn't Slack's", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called");
  });
  const file: SlackFile = { id: "F6", name: "brief.pdf", mimetype: "application/pdf", size: 10, url_private: "https://files.example.com/brief.pdf" };

  const linked = await downloadAndStoreSlackFile({} as never, file, "C1", "1.1", "token");
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(linked.external, true);
  assert.equal(linked.error, null);
  assert.equal(linked.permalink, "https://files.example.com/brief.pdf");
});

test("downloadAndStoreSlackFile still downloads Slack-hosted files with the token", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([1, 2, 3])));
  const uploads: string[] = [];
  const admin = {
    storage: { from: () => ({ upload: async (path: string) => (uploads.push(path), { error: null }) }) },
  } as never;

  const photo = await downloadAndStoreSlackFile(admin, slackFile("F7", "roof.jpg"), "C1", "1.1", "xoxb-token");
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://files.slack.com/F7");
  assert.deepEqual(init.headers, { Authorization: "Bearer xoxb-token" });
  assert.equal(photo.error, null);
  assert.equal(photo.external, undefined);
  assert.equal(photo.storage_path, "C1/1.1/F7-roof.jpg");
  assert.deepEqual(uploads, ["C1/1.1/F7-roof.jpg"]);
});
