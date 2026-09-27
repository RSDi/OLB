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
  WELCOME_TOUR_ID,
  tourForPath,
  tourForSection,
  tourStepsFor,
} from "../../lib/help/tours.ts";

const MEMBER: GuideViewer = { role: "member", status: "approved", isStaff: false };
const ADMIN: GuideViewer = { role: "admin", status: "approved", isStaff: true };
const SUPER: GuideViewer = { role: "super_admin", status: "approved", isStaff: true };

const RANK: Record<GuideAudience, number> = { everyone: 0, staff: 1, super_admin: 2 };

// Every tour anchor the app's components carry: `data-tour="x"` on an
// element, or `tour: "x"` on a sidebar nav entry.
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
      }
    }
  };
  walk(root);
  return found;
}

test("tour ids are unique, one tour per section", () => {
  const ids = GUIDE_TOURS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const sections = GUIDE_TOURS.map((t) => t.sectionId);
  assert.equal(new Set(sections).size, sections.length);
});

test("every tour belongs to a guide section and runs on a portal page", () => {
  for (const t of GUIDE_TOURS) {
    assert.ok(GUIDE_SECTIONS.some((s) => s.id === t.sectionId), `${t.id}: no section "${t.sectionId}"`);
    assert.match(t.route, /^\/portal(\/|$)/, t.id);
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

test("every step points at an element a component marks with data-tour", () => {
  const anchors = tourAnchors();
  const missing = GUIDE_TOURS.flatMap((t) =>
    t.steps.filter((s) => s.target && !anchors.has(s.target)).map((s) => `${t.id}: ${s.target}`)
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
  for (const t of GUIDE_TOURS) {
    if (t.id === WELCOME_TOUR_ID) continue;
    assert.equal(tourForPath(t.route, SUPER)?.id, t.id, `${t.route} should offer ${t.id}`);
  }
  // Inside a channel, the channel-list tour would point at nothing.
  assert.equal(tourForPath("/portal/slack-archive/C0123", MEMBER), null);
  assert.equal(tourForPath("/portal/guide", MEMBER), null);
});
