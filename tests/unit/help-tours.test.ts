// The guided tours (lib/help/tours.ts) against the guide and the components:
// every step points at an element some component actually marks with
// `data-tour`, every tour belongs to a real guide section, and no step
// reaches people its section isn't written for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_SECTIONS, type GuideAudience, type GuideViewer } from "../../lib/help/guide.ts";
import {
  GUIDE_TOURS,
  PLANNING_TOUR_ID,
  REQUIREMENTS_TOUR_ID,
  WELCOME_TOUR_ID,
  WELCOME_TOUR_NEW_SINCE,
  autoStartsWelcomeTour,
  nextPartIndex,
  partAt,
  partStartIndex,
  tourForPath,
  tourForSection,
  tourStepsFor,
} from "../../lib/help/tours.ts";

const MEMBER: GuideViewer = { role: "member", status: "approved", isStaff: false };
const ADMIN: GuideViewer = { role: "admin", status: "approved", isStaff: true };
const SUPER: GuideViewer = { role: "super_admin", status: "approved", isStaff: true };

// "finance" (the Payments grant), "registrations" (the Registrations grant) and
// "staff" are different groups; super-admins are in all three.
const RANK: Record<GuideAudience, number> = { everyone: 0, staff: 1, finance: 1, registrations: 1, super_admin: 2 };

// Every tour anchor the app's components carry: `data-tour="x"` on an
// element, a quoted name inside `data-tour={…}`, or `tour: "x"` on a sidebar
// nav entry.
function tourAnchors(): Set<string> {
  const root = join(import.meta.dirname, "../../app");
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".tsx")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/(?:data-tour=|\btour: )"([a-z0-9-]+)"/g)) found.add(m[1]);
        for (const m of src.matchAll(/data-tour=\{([^}]*)\}/g)) {
          for (const q of m[1].matchAll(/"([a-z0-9-]+)"/g)) found.add(q[1]);
        }
      }
    }
  };
  walk(root);
  return found;
}

test("tour ids are unique, one tour per section", () => {
  const ids = GUIDE_TOURS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const sections = GUIDE_TOURS.flatMap((t) => [t.sectionId, ...(t.alsoSections ?? [])]);
  assert.equal(new Set(sections).size, sections.length);
});

test("every tour belongs to a guide section and runs on a portal page", () => {
  for (const t of GUIDE_TOURS) {
    for (const id of [t.sectionId, ...(t.alsoSections ?? [])]) {
      assert.ok(GUIDE_SECTIONS.some((s) => s.id === id), `${t.id}: no section "${id}"`);
    }
    assert.match(t.route, /^\/portal(\/|$)/, t.id);
    for (const s of t.steps) if (s.route) assert.match(s.route, /^\/portal(\/|$)/, `${t.id}: "${s.title}"`);
    assert.ok(t.steps.length > 0, `${t.id} has no steps`);
  }
  assert.ok(GUIDE_TOURS.some((t) => t.id === WELCOME_TOUR_ID));
});

test("every step has a title and some words", () => {
  for (const t of GUIDE_TOURS) {
    for (const s of t.steps) {
      assert.ok(s.title.trim(), `${t.id}: step without a title`);
      assert.ok(s.body.trim().length > 10, `${t.id}: "${s.title}" needs a body`);
    }
  }
});

test("every step points at (and opens) elements a component marks with data-tour", () => {
  const anchors = tourAnchors();
  const missing = GUIDE_TOURS.flatMap((t) =>
    t.steps.flatMap((s) =>
      [s.target, s.click, s.dismiss, s.pick].filter((a): a is string => !!a && !anchors.has(a)).map((a) => `${t.id}: ${a}`)
    )
  );
  assert.deepEqual(missing, [], "add data-tour to the element, or fix the step's target");
});

test("no step reaches wider than its section", () => {
  for (const t of GUIDE_TOURS) {
    const section = GUIDE_SECTIONS.find((s) => s.id === t.sectionId)!;
    for (const s of t.steps) {
      if (!s.audience) continue;
      assert.ok(RANK[s.audience] >= RANK[section.audience], `${t.id}: "${s.title}" is wider than its section`);
    }
  }
});

test("members get member tours and member steps only", () => {
  assert.equal(tourForSection("settings-members", MEMBER), null);
  assert.equal(tourForSection("external-contacts", MEMBER), null);
  const welcome = GUIDE_TOURS.find((t) => t.id === WELCOME_TOUR_ID)!;
  const forMember = tourStepsFor(welcome, MEMBER);
  assert.ok(forMember.length > 0);
  assert.ok(forMember.every((s) => !s.audience || s.audience === "everyone"));
  assert.ok(tourStepsFor(welcome, ADMIN).some((s) => s.audience === "staff"));
});

test("admins don't get super-admin steps", () => {
  const settings = GUIDE_TOURS.find((t) => t.sectionId === "settings-members")!;
  assert.ok(tourStepsFor(settings, ADMIN).every((s) => s.audience !== "super_admin"));
  assert.ok(tourStepsFor(settings, SUPER).some((s) => s.audience === "super_admin"));
});

test("each page tour is offered from its own page's ⓘ panel, and only there", () => {
  // A page tour: its section is that page's "i" help. The welcome tour and
  // walkthroughs across pages start from the guide instead.
  const pageTours = GUIDE_TOURS.filter((t) =>
    GUIDE_SECTIONS.find((s) => s.id === t.sectionId)?.routes?.includes(t.route)
  );
  assert.ok(pageTours.length >= 5);
  for (const t of pageTours) {
    // Checked as an account on the staged-rollout list, which sees every
    // section (preview ones included).
    assert.equal(tourForPath(t.route, { ...SUPER, seesFullUi: true })?.id, t.id, `${t.route} should offer ${t.id}`);
  }
  // Inside a channel, the channel-list tour would point at nothing.
  assert.equal(tourForPath("/portal/slack-archive/C0123", MEMBER), null);
  assert.equal(tourForPath("/portal/guide", MEMBER), null);
});

test("the welcome tour starts by itself only for accounts made since tours shipped", () => {
  assert.equal(autoStartsWelcomeTour(WELCOME_TOUR_NEW_SINCE), true);
  assert.equal(autoStartsWelcomeTour("2027-01-15T09:30:00.123456+00:00"), true);
  assert.equal(autoStartsWelcomeTour("2025-08-01T12:00:00Z"), false);
  assert.equal(autoStartsWelcomeTour(null), false);
  assert.equal(autoStartsWelcomeTour("not a date"), false);
});

test("the requirements walkthrough: three parts, for the board, from both guide sections", () => {
  assert.equal(tourForSection("player-requirements", ADMIN)?.id, REQUIREMENTS_TOUR_ID);
  assert.equal(tourForSection("settings-requirements", ADMIN)?.id, REQUIREMENTS_TOUR_ID);
  assert.equal(tourForSection("player-requirements", MEMBER), null);
  const steps = tourStepsFor(GUIDE_TOURS.find((t) => t.id === REQUIREMENTS_TOUR_ID)!, ADMIN);
  assert.deepEqual(
    steps.filter((s) => s.part).map((s) => s.part),
    ["Set it up", "Check players off", "See who's missing"]
  );
  // Part 1 is in Settings, parts 2 and 3 in the Directory.
  const p2 = partStartIndex(steps, 2);
  assert.ok(steps.slice(1, p2).every((s) => !s.route));
  assert.ok(steps.slice(p2).every((s) => s.route === "/portal/directory"));
});

test("the Planning walkthrough: five parts, only for the preview account, from both guide sections", () => {
  const jeff: GuideViewer = { ...SUPER, seesFullUi: true };
  assert.equal(tourForSection("planning", jeff)?.id, PLANNING_TOUR_ID);
  assert.equal(tourForSection("settings-planning-roles", jeff)?.id, PLANNING_TOUR_ID);
  // Planning is in staged rollout: another super-admin (Rachel) doesn't get it yet.
  assert.equal(tourForSection("planning", SUPER), null);
  assert.equal(tourForPath("/portal/events", jeff)?.id, PLANNING_TOUR_ID);
  assert.equal(tourForPath("/portal/events", ADMIN), null);
  const steps = tourStepsFor(GUIDE_TOURS.find((t) => t.id === PLANNING_TOUR_ID)!, jeff);
  assert.deepEqual(
    steps.filter((s) => s.part).map((s) => s.part),
    ["The calendar", "Review a season", "The template", "Board meetings", "Who holds each role"]
  );
  // The meeting part goes to this month's meeting, a fixed address; the tabs
  // are switched by clicking them, since they share /portal/events.
  const p4 = partStartIndex(steps, 4);
  const p5 = partStartIndex(steps, 5);
  assert.ok(steps.slice(p4, p5).every((s) => s.route === "/portal/events/meetings/this-month"));
  assert.ok(steps.slice(p5, -1).every((s) => s.route === "/portal/settings"));
  assert.ok(steps.slice(0, p4).every((s) => !s.route));
});

test("part helpers find, name and skip parts", () => {
  const steps = [
    { title: "Intro", body: "…" },
    { title: "A1", body: "…", part: "A" },
    { title: "A2", body: "…" },
    { title: "B1", body: "…", part: "B" },
  ];
  assert.equal(partAt(steps, 0), null);
  assert.deepEqual(partAt(steps, 2), { number: 1, name: "A", of: 2 });
  assert.deepEqual(partAt(steps, 3), { number: 2, name: "B", of: 2 });
  assert.equal(partStartIndex(steps, 2), 3);
  assert.equal(partStartIndex(steps, 9), 0);
  assert.equal(nextPartIndex(steps, 1), 3);
  assert.equal(nextPartIndex(steps, 3), 4);
});

test("a preview section's tour only reaches accounts on the staged-rollout list", () => {
  assert.equal(tourForSection("activity", SUPER), null);
  assert.equal(tourForSection("activity", { ...SUPER, seesFullUi: true })?.id, "activity");
});

test("on Settings the ⓘ panel offers the open tab's walkthrough", () => {
  assert.equal(tourForPath("/portal/settings", SUPER, "settings-teams")?.id, "settings-teams");
  assert.equal(tourForPath("/portal/settings", SUPER, "settings-audit-log")?.id, "settings-audit-log");
  assert.equal(tourForPath("/portal/settings", ADMIN, "settings-requirements")?.id, REQUIREMENTS_TOUR_ID);
  // A tab the viewer can't have falls back to the page's own help.
  assert.equal(tourForPath("/portal/settings", ADMIN, "settings-teams")?.id, "settings-members");
  assert.equal(tourForPath("/portal/settings", SUPER, null)?.id, "settings-members");
  // Every Settings tab the page maps names a real section with a walkthrough.
  const src = readFileSync(join(import.meta.dirname, "../../app/portal/settings/page.tsx"), "utf8");
  const map = src.match(/const TAB_HELP[^=]*= \{([^}]*)\}/)?.[1] ?? "";
  const ids = [...map.matchAll(/: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8);
  for (const id of ids) assert.ok(tourForSection(id, SUPER), `${id} should have a walkthrough`);
});
