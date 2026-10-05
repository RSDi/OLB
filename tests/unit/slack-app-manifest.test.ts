// Unit tests for the Slack app manifest each site creates its bot from: the
// site-specific parts (name, URLs) come only from the options, and the URLs
// Slack calls are well-formed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlackAppManifest, SLACK_BOT_SCOPES, SLACK_DM_USER_SCOPES } from "../../lib/slack/app-manifest.ts";

const opts = {
  name: "Sparky",
  siteUrl: "https://portal.example.org",
  supabaseUrl: "https://abcdefgh.supabase.co",
};

test("names the app and its bot from the options", () => {
  const m = buildSlackAppManifest(opts);
  assert.equal(m.display_information.name, "Sparky");
  assert.equal(m.features.bot_user.display_name, "Sparky");
});

test("points events at this site, sign-in back through Supabase, and Connect Slack back to the site", () => {
  const m = buildSlackAppManifest(opts);
  assert.equal(m.settings.event_subscriptions.request_url, "https://portal.example.org/api/slack/events");
  assert.deepEqual(m.oauth_config.redirect_urls, [
    "https://abcdefgh.supabase.co/auth/v1/callback",
    "https://portal.example.org/api/slack/connect/callback",
  ]);
});

test("trailing slashes and paths don't double up in the URLs", () => {
  const m = buildSlackAppManifest({
    ...opts,
    siteUrl: "https://portal.example.org/",
    supabaseUrl: "https://abcdefgh.supabase.co/rest/v1/",
  });
  assert.equal(m.settings.event_subscriptions.request_url, "https://portal.example.org/api/slack/events");
  assert.deepEqual(m.oauth_config.redirect_urls, [
    "https://abcdefgh.supabase.co/auth/v1/callback",
    "https://portal.example.org/api/slack/connect/callback",
  ]);
});

test("asks for every scope the code relies on: sign-in's OIDC scopes and Slack DMs' for users", () => {
  const m = buildSlackAppManifest(opts);
  for (const scope of ["chat:write", "users:read.email", "channels:history", "groups:history", "files:read"]) {
    assert.ok(m.oauth_config.scopes.bot.includes(scope), `missing bot scope ${scope}`);
  }
  assert.deepEqual(m.oauth_config.scopes.user, ["openid", "email", "profile", "chat:write", "im:write", "users:read", "users:read.email"]);
  assert.deepEqual(SLACK_DM_USER_SCOPES, ["chat:write", "im:write", "users:read", "users:read.email"]);
  assert.deepEqual(m.settings.event_subscriptions.bot_events, ["message.channels", "message.groups"]);
});

test("returns fresh arrays, so editing one manifest can't leak into the next", () => {
  buildSlackAppManifest(opts).oauth_config.scopes.bot.push("admin");
  assert.ok(!SLACK_BOT_SCOPES.includes("admin"));
  assert.ok(!buildSlackAppManifest(opts).oauth_config.scopes.bot.includes("admin"));
});

test("rejects URLs Slack can't call", () => {
  assert.throws(() => buildSlackAppManifest({ ...opts, siteUrl: "http://localhost:3000" }), /https/);
  assert.throws(() => buildSlackAppManifest({ ...opts, supabaseUrl: "not a url" }), /valid URL/);
});

test("rejects a missing or over-long name", () => {
  assert.throws(() => buildSlackAppManifest({ ...opts, name: "  " }), /name/);
  assert.throws(() => buildSlackAppManifest({ ...opts, name: "x".repeat(36) }), /35 characters/);
});
