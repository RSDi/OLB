import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  backLabel,
  safeBackPath,
  settingsHref,
  SETTINGS_TABS,
  splitSettingsRefs,
} from "../../lib/settings-links.ts";

test("settings links carry a safe back path", () => {
  assert.equal(settingsHref("film", "/portal/film?v=1"), "/portal/settings?tab=film&back=%2Fportal%2Ffilm%3Fv%3D1");
  assert.equal(settingsHref("film"), "/portal/settings?tab=film");
  assert.equal(safeBackPath("https://evil.example/portal/"), null);
  assert.equal(safeBackPath("//evil.example"), null);
  assert.equal(safeBackPath("/portal/settings?tab=x"), null);
  assert.equal(safeBackPath("/login"), null);
  assert.equal(safeBackPath("/portal/film"), "/portal/film");
  assert.equal(backLabel("/portal/film?v=abc"), "← Back to Film");
  assert.equal(backLabel("/portal/something-else"), "← Back");
});

test("messages split into links on each Settings tab mention", () => {
  const parts = splitSettingsRefs("YouTube login expired. Connect the channel again in Settings → Film.");
  assert.deepEqual(parts, [
    { text: "YouTube login expired. Connect the channel again in " },
    { text: "Settings → Film", tab: "film" },
    { text: "." },
  ]);
  assert.equal(splitSettingsRefs("See Settings → Registration Automations")[1]?.tab, "registration_automations");
  assert.deepEqual(splitSettingsRefs("iPhone: Settings → Camera"), [{ text: "iPhone: Settings → Camera" }]);
});

test("every Settings tab label in the menu has a link key", () => {
  const page = readFileSync("app/portal/settings/page.tsx", "utf8");
  for (const m of page.matchAll(/\{ key: "([a-z_]+)", label: "([^"]+)"/g)) {
    assert.equal(SETTINGS_TABS[m[2]], m[1], `SETTINGS_TABS is missing "${m[2]}"`);
  }
});

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// What the portal shows people: a "Settings → <Tab>" must be a link
// (SettingsLink, or SettingsText for a message), not plain words. Code
// comments, confirm() dialogs and hover tips can't hold a link.
test("portal pages link every Settings → <Tab> they show", () => {
  const labels = Object.keys(SETTINGS_TABS).sort((a, b) => b.length - a.length).join("|");
  const ref = new RegExp(`Settings (?:→|->) (?:${labels})\\b`);
  const offenders: string[] = [];
  for (const file of [...tsxFiles("app/portal"), ...tsxFiles("app/components")]) {
    const lines = readFileSync(file, "utf8").split("\n");
    let inBlock = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        return;
      }
      if (t.startsWith("/*") || t.startsWith("{/*")) {
        if (!t.includes("*/")) inBlock = true;
        return;
      }
      if (t.startsWith("//") || t.startsWith("*")) return;
      if (!ref.test(line)) return;
      const near = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
      if (/SettingsLink|SettingsText|confirm\(|help=|title=/.test(near)) return;
      offenders.push(`${file}:${i + 1}: ${t}`);
    });
  }
  assert.deepEqual(offenders, [], "Use <SettingsLink tab=…> or <SettingsText text=…>:\n" + offenders.join("\n"));
});

test("the waiting Slack post can set its team's channel in place", () => {
  const inbox = readFileSync("app/portal/film/FilmInbox.tsx", "utf8");
  assert.match(inbox, /setFilmTeamSlackChannel\(teamId, channelDraft\)/);
  assert.match(inbox, /data-tour="film-slack-channel"/);
});

test("a pasted Slack channel link gives the channel ID", async () => {
  const { parseFilmSlackChannelId } = await import("../../lib/film/slack-drafts.ts");
  assert.deepEqual(parseFilmSlackChannelId("https://olb.slack.com/archives/C0123456789"), { ok: true, id: "C0123456789" });
  assert.deepEqual(parseFilmSlackChannelId("https://olb.slack.com/archives/C0123456789/p1700000000"), {
    ok: true,
    id: "C0123456789",
  });
  assert.equal(parseFilmSlackChannelId("#12u-blue").ok, false);
});
