import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignedTusUpload } from "../../lib/film/tus-create.ts";
import { tusSignedHeaders } from "../../lib/film/tus.ts";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJnYW1lLWZpbG0vYSJ9.tok";
const ENDPOINT = "https://abcd.storage.supabase.co/storage/v1/upload/resumable/sign";

test("server TUS create POSTs x-signature once and returns the Location", async () => {
  const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    seen.push({ url: String(input), method: init?.method ?? "GET", headers });
    return new Response(null, {
      status: 201,
      headers: { Location: "/storage/v1/upload/resumable/sign/abc123" },
    });
  };

  const uploadUrl = await createSignedTusUpload({
    endpoint: ENDPOINT,
    token: TOKEN,
    path: "white14/2026/10/id/clip.mov",
    contentType: "video/quicktime",
    sizeBytes: 12_000_000,
    fetch: fakeFetch,
  });

  assert.equal(uploadUrl, "https://abcd.storage.supabase.co/storage/v1/upload/resumable/sign/abc123");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.method, "POST");
  assert.equal(seen[0]!.url, ENDPOINT);
  assert.equal(seen[0]!.headers["x-signature"], TOKEN);
  assert.equal(seen[0]!.headers["x-signature"].includes(","), false);
  assert.equal(seen[0]!.headers["tus-resumable"], "1.0.0");
  assert.equal(seen[0]!.headers["upload-length"], "12000000");
  assert.match(seen[0]!.headers["upload-metadata"]!, /bucketName /);
  assert.equal(seen[0]!.headers.authorization, undefined);
  assert.equal(seen[0]!.headers.apikey, undefined);
  assert.deepEqual(tusSignedHeaders(TOKEN), {
    "x-signature": TOKEN,
    "x-upsert": "false",
  });
});

test("server TUS create surfaces Storage's error text", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("Invalid Compact JWS", { status: 400 });
  await assert.rejects(
    () =>
      createSignedTusUpload({
        endpoint: ENDPOINT,
        token: `${TOKEN}, ${TOKEN}`,
        path: "p",
        contentType: "video/quicktime",
        sizeBytes: 1,
        fetch: fakeFetch,
      }),
    /Invalid Compact JWS/
  );
});
