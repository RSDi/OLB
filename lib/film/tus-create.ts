// Server-only: create the TUS upload on Storage with the signed token.
// The phone then PATCHes chunks to the returned Location. Bytes never pass
// through Vercel. Service-role key is used only to mint the token (caller);
// this helper sends x-signature once and never forwards secrets to the client.

import { tusSignedHeaders, tusUploadMetadata } from "./tus.ts";
import { GAME_FILM_BUCKET } from "./types.ts";

const TUS_CREATE_TIMEOUT_MS = 20_000;

export async function createSignedTusUpload(input: {
  endpoint: string;
  token: string;
  path: string;
  contentType: string;
  sizeBytes: number;
  bucket?: string;
  fetch?: typeof fetch;
}): Promise<string> {
  const endpoint = input.endpoint.replace(/\/+$/, "");
  const headers = new Headers({
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(input.sizeBytes),
    "Upload-Metadata": tusUploadMetadata({
      bucketName: input.bucket || GAME_FILM_BUCKET,
      objectName: input.path,
      contentType: input.contentType,
    }),
    ...tusSignedHeaders(input.token),
  });

  const run = input.fetch ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TUS_CREATE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await run(endpoint, {
      method: "POST",
      headers,
      redirect: "manual",
      signal: ac.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't reach Storage.";
    throw new Error(`Couldn't start the resumable upload (${message}).`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status !== 201 && res.status !== 200) {
    const text = (await res.text().catch(() => "")).slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(
      text
        ? `Storage refused to start the upload (${res.status}): ${text}`
        : `Storage refused to start the upload (${res.status}).`
    );
  }

  const location = res.headers.get("Location") || res.headers.get("location");
  if (!location) throw new Error("Storage started the upload but didn't return a URL.");
  return new URL(location, `${endpoint}/`).toString();
}
