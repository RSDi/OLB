import { test } from "node:test";
import assert from "node:assert/strict";

// Live probe against the production Storage host (the project ref is on the
// public TUS URL from the failed iPhone upload). No secrets. Skips if the
// network is blocked.

const HOSTS = [
  "https://emlniucvdlwqyfvcuvhg.storage.supabase.co",
  "https://emlniucvdlwqyfvcuvhg.supabase.co",
];
const SIGN = "/storage/v1/upload/resumable/sign";
const RESUMABLE = "/storage/v1/upload/resumable";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJnYW1lLWZpbG0vcHJvYmUifQ.sig";

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

const metadata = [
  `bucketName ${b64("game-film")}`,
  `objectName ${b64("probe/test.mov")}`,
  `contentType ${b64("video/quicktime")}`,
  `cacheControl ${b64("3600")}`,
].join(",");

async function post(url: string, extra: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": "100",
      "Upload-Metadata": metadata,
      ...extra,
    },
  });
  return { status: res.status, body: (await res.text()).slice(0, 300) };
}

test("hosted /sign: doubled x-signature is Invalid Compact JWS; one dummy JWT is signature verification failed", async (t) => {
  let reached = false;
  for (const host of HOSTS) {
    let once: { status: number; body: string };
    try {
      once = await post(`${host}${SIGN}`, { "x-signature": TOKEN });
    } catch (err) {
      t.diagnostic(`${host} unreachable: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    reached = true;
    const doubled = await post(`${host}${SIGN}`, { "x-signature": `${TOKEN}, ${TOKEN}` });
    const missing = await post(`${host}${SIGN}`, {});
    const unsigned = await post(`${host}${RESUMABLE}`, {});

    assert.equal(once.status, 400);
    assert.match(once.body, /signature verification failed/i);
    assert.equal(doubled.status, 400);
    assert.equal(doubled.body.trim(), "Invalid Compact JWS");
    assert.equal(missing.status, 400);
    assert.match(missing.body, /Missing x-signature header/i);
    assert.equal(unsigned.status, 400);
    assert.match(unsigned.body, /Invalid Compact JWS/);
    assert.match(unsigned.body, /statusCode/);
  }
  if (!reached) {
    t.skip("Storage hosts unreachable from this environment");
  }
});
