import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deviceOf,
  isBot,
  isSitePath,
  referrerHost,
  sitePageLabel,
  visitSource,
} from "../../lib/activity/website-rules.ts";

test("a referrer from this site or nowhere isn't a source", () => {
  assert.equal(referrerHost("", "omahalightning.org"), "");
  assert.equal(referrerHost("https://omahalightning.org/programs", "omahalightning.org"), "");
  assert.equal(referrerHost("not a url", "omahalightning.org"), "");
  assert.equal(referrerHost("https://www.google.com/", "omahalightning.org:443"), "www.google.com");
});

test("visits are named by where they came from", () => {
  assert.equal(visitSource("/", "www.google.com"), "Google");
  assert.equal(visitSource("/", "mail.google.com"), "Email");
  assert.equal(visitSource("/", "l.facebook.com"), "Facebook");
  assert.equal(visitSource("/", "t.co"), "X");
  assert.equal(visitSource("/", "www.omahahomeschool.org"), "omahahomeschool.org");
  assert.equal(visitSource("/", ""), "");
  // A link's utm_source wins over the referrer.
  assert.equal(visitSource("/player-registration?utm_source=newsletter", "mail.google.com"), "newsletter");
});

test("devices and bots", () => {
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "phone");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36"), "phone");
  assert.equal(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 13; SM-X200) Safari/537.36"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"), "computer");
  assert.ok(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)"));
  assert.ok(isBot("facebookexternalhit/1.1"));
  assert.ok(isBot(""));
  assert.ok(!isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"));
});

test("only public pages are recorded", () => {
  assert.ok(isSitePath("/"));
  assert.ok(isSitePath("/player-registration?step=2"));
  assert.ok(isSitePath("/portal-news"));
  assert.ok(!isSitePath("/portal"));
  assert.ok(!isSitePath("/portal/directory"));
  assert.ok(!isSitePath("/api/website-activity"));
  assert.ok(!isSitePath("//evil.example"));
  assert.ok(!isSitePath("https://evil.example/"));
});

test("pages read as words", () => {
  assert.equal(sitePageLabel("/"), "Home");
  assert.equal(sitePageLabel("/player-registration?x=1"), "Player Registration");
  assert.equal(sitePageLabel("/about/our-history/"), "About · Our History");
});
