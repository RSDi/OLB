import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { refreshYoutubeAccess, YOUTUBE_LOGIN_EXPIRED } from "../../lib/film/youtube-oauth.ts";

const root = join(import.meta.dirname, "..", "..");
const env = { FILM_YOUTUBE_CLIENT_ID: "id", FILM_YOUTUBE_CLIENT_SECRET: "secret" };

async function withFetch<T>(status: number, body: unknown, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("an expired or revoked YouTube login says to reconnect", async () => {
  await withFetch(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }, () =>
    assert.rejects(refreshYoutubeAccess("rt", env), { message: YOUTUBE_LOGIN_EXPIRED })
  );
  assert.match(YOUTUBE_LOGIN_EXPIRED, /Connect YouTube again in Settings → Film/);
});

test("other refresh failures keep Google's own words", async () => {
  await withFetch(401, { error: "invalid_client", error_description: "The OAuth client was not found." }, () =>
    assert.rejects(refreshYoutubeAccess("rt", env), { message: "The OAuth client was not found." })
  );
});

test("a good refresh returns the access token", async () => {
  const token = await withFetch(200, { access_token: "at" }, () => refreshYoutubeAccess("rt", env));
  assert.equal(token, "at");
});

test("the upload cron records the sign-in result and Film pages show it", () => {
  const worker = readFileSync(join(root, "lib/film/youtube.ts"), "utf8");
  assert.match(worker, /noteAuthResult\(secret\.authError, result\.skipped\)/);
  assert.match(worker, /noteAuthResult\(secret\.authError, null\)/);
  for (const page of ["app/portal/film/page.tsx", "app/portal/film/status/page.tsx"]) {
    assert.match(readFileSync(join(root, page), "utf8"), /youtubeAuthError=\{youtubeAuthError\}/, page);
  }
  const migration = readFileSync(join(root, "supabase/migrations/0162_game_film_youtube_auth_error.sql"), "utf8");
  assert.match(migration, /add column if not exists auth_error text/);
});
