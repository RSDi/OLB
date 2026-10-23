import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PROGRAMS_HERO,
  PROGRAMS_HERO_BODY,
  PROGRAMS_HERO_KEY,
  PROGRAMS_HERO_LINK_TEXT,
  PROGRAMS_HERO_LINK_URL,
  cleanHomepageMessage,
  isProgramsPageHref,
  programsHeroBoxHref,
  tableMissing,
  visibleHomepageMessage,
} from "../../lib/website/homepage-message.ts";

test("seed starts hidden, drops the duplicate last sentence, and links to the 14U accordion", () => {
  assert.equal(DEFAULT_PROGRAMS_HERO.key, PROGRAMS_HERO_KEY);
  assert.equal(DEFAULT_PROGRAMS_HERO.enabled, false);
  assert.equal(DEFAULT_PROGRAMS_HERO.body, PROGRAMS_HERO_BODY);
  assert.equal(DEFAULT_PROGRAMS_HERO.link_text, PROGRAMS_HERO_LINK_TEXT);
  assert.equal(DEFAULT_PROGRAMS_HERO.link_url, PROGRAMS_HERO_LINK_URL);
  assert.equal(PROGRAMS_HERO_LINK_URL, "/programs#14u");
  assert.match(PROGRAMS_HERO_BODY, /Now accepting two more 14U players/);
  assert.match(PROGRAMS_HERO_BODY, /assessments will be scheduled right away\.$/);
  assert.doesNotMatch(PROGRAMS_HERO_BODY, /See practice times and payment info/);
  assert.equal(PROGRAMS_HERO_LINK_TEXT, "Practice times and payment info");
});

test("the public box stays hidden until the table exists and the switch is on", () => {
  assert.equal(visibleHomepageMessage(DEFAULT_PROGRAMS_HERO, false), null);
  assert.equal(visibleHomepageMessage({ ...DEFAULT_PROGRAMS_HERO, enabled: true }, false), null);
  assert.equal(visibleHomepageMessage(DEFAULT_PROGRAMS_HERO, true), null);
  assert.equal(visibleHomepageMessage({ ...DEFAULT_PROGRAMS_HERO, enabled: true, body: "   " }, true), null);
  const shown = visibleHomepageMessage({ ...DEFAULT_PROGRAMS_HERO, enabled: true }, true);
  assert.deepEqual(shown, {
    body: PROGRAMS_HERO_BODY,
    linkText: PROGRAMS_HERO_LINK_TEXT,
    linkUrl: PROGRAMS_HERO_LINK_URL,
  });
  const noLink = visibleHomepageMessage({ ...DEFAULT_PROGRAMS_HERO, enabled: true, link_text: "", link_url: "" }, true);
  assert.deepEqual(noLink, { body: PROGRAMS_HERO_BODY, linkText: "", linkUrl: "" });
});

test("cleanHomepageMessage tidies the link and refuses a half-filled one", () => {
  const ok = cleanHomepageMessage({
    enabled: true,
    body: "  Hello.  ",
    link_text: "  Times  ",
    link_url: "programs",
  });
  assert.deepEqual(ok, { value: { enabled: true, body: "Hello.", link_text: "Times", link_url: "/programs" } });
  const hash = cleanHomepageMessage({
    enabled: true,
    body: "Hello.",
    link_text: "Times",
    link_url: "/programs#14u",
  });
  assert.deepEqual(hash, { value: { enabled: true, body: "Hello.", link_text: "Times", link_url: "/programs#14u" } });
  const missingUrl = cleanHomepageMessage({ enabled: false, body: "Hi", link_text: "Go", link_url: "" });
  assert.equal("error" in missingUrl, true);
  const missingText = cleanHomepageMessage({ enabled: false, body: "Hi", link_text: "", link_url: "/programs" });
  assert.equal("error" in missingText, true);
  const bad = cleanHomepageMessage({ enabled: false, body: "Hi", link_text: "Go", link_url: "javascript:alert(1)" });
  assert.equal("error" in bad, true);
});

test("tableMissing treats a missing relation as safe to hide", () => {
  assert.equal(tableMissing({ code: "42P01", message: "relation olb_homepage_messages does not exist" }), true);
  assert.equal(tableMissing({ code: "PGRST205", message: "Could not find the table 'public.olb_homepage_messages' in the schema cache" }), true);
  assert.equal(tableMissing({ code: "42501", message: "permission denied" }), false);
});

test("migration 0160 creates olb_homepage_messages, not the waitlist email log", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0160_homepage_messages.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.olb_homepage_messages/);
  assert.match(sql, /link_text/);
  assert.match(sql, /link_url/);
  assert.match(sql, /enabled\s+boolean not null default false/);
  assert.match(sql, /grant select on public\.olb_homepage_messages to authenticated, service_role/);
  assert.match(sql, /grant insert, update, delete on public\.olb_homepage_messages to service_role/);
  assert.match(sql, /using \(\(select public\.is_staff\(\)\) or \(select public\.can_manage_registrations\(\)\)\)/);
  assert.match(sql, /'\/programs#14u'/);
  assert.match(sql, /Practice times and payment info/);
  const seedBody = sql.match(/values \(\s*'programs_hero',\s*false,\s*'([^']+)'/)?.[1] ?? "";
  assert.match(seedBody, /assessments will be scheduled right away\.$/);
  assert.doesNotMatch(seedBody, /See practice times and payment info/);
  assert.doesNotMatch(sql, /create table if not exists public\.olb_registration_messages/);
  const waitlist = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0115_registration_waitlist.sql"), "utf8");
  assert.match(waitlist, /create table if not exists public\.olb_registration_messages/);
  assert.match(waitlist, /registration_id/);
});

test("Settings → Messages is a released Registrations tab", () => {
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/page.tsx"), "utf8");
  assert.match(settings, /key: "registration_messages"/);
  assert.match(settings, /label: "Messages"/);
  assert.match(settings, /RegistrationMessagesTab/);
  assert.match(settings, /"registration_messages"/);
  const tab = readFileSync(join(import.meta.dirname, "../../app/portal/settings/RegistrationMessagesTab.tsx"), "utf8");
  assert.match(tab, /Show message box/);
  assert.match(tab, /Link text/);
  assert.match(tab, /Link address/);
  const guide = readFileSync(join(import.meta.dirname, "../../lib/help/guide.ts"), "utf8");
  assert.match(guide, /id: "settings-registration-messages"/);
  assert.doesNotMatch(guide.slice(guide.indexOf('id: "settings-registration-messages"'), guide.indexOf('id: "settings-registration-automations"')), /preview: true/);
});

test("a Programs address in the box becomes #14u so the page does not reload", () => {
  assert.equal(isProgramsPageHref("/programs#14u"), true);
  assert.equal(isProgramsPageHref("/programs"), true);
  assert.equal(isProgramsPageHref("https://omahalightningbasketball.com/programs"), true);
  assert.equal(isProgramsPageHref("https://omahalightningbasketball.com/programs#14u"), true);
  assert.equal(isProgramsPageHref("#14u"), true);
  assert.equal(isProgramsPageHref("/assessments/14u"), false);
  assert.equal(isProgramsPageHref("https://example.com/programs"), true);
  assert.equal(programsHeroBoxHref("/programs"), "#14u");
  assert.equal(programsHeroBoxHref("https://omahalightningbasketball.com/programs"), "#14u");
  assert.equal(programsHeroBoxHref("/programs#14u"), "#14u");
  assert.equal(programsHeroBoxHref("https://example.com/other"), "https://example.com/other");
});

test("the Programs page only shows the box when the loader returns one", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/programs/page.tsx"), "utf8");
  const data = readFileSync(join(import.meta.dirname, "../../lib/website/homepage-message-data.ts"), "utf8");
  assert.match(page, /getVisibleProgramsHeroMessage/);
  assert.match(page, /HomepageMessageBox/);
  assert.doesNotMatch(page, /programs\.notice/);
  assert.match(data, /fromTable: false/);
  assert.match(data, /table missing/);
});
