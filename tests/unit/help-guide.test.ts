// The User Guide (lib/help/guide.ts) against the portal's actual pages: every
// page people can reach has a guide section behind its top-bar "i", and each
// section only reaches the people it's written for. A new portal page fails
// here until it gets a section (or is listed as still in preview below).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  GUIDE_SECTIONS,
  guideSectionForPath,
  guideSectionsFor,
  type GuideViewer,
} from "../../lib/help/guide.ts";

// Pages behind the staged rollout (lib/auth/feature-preview.ts) — hidden from
// everyone but the preview account, so not in the guide yet. When one is
// released, take it off this list and give it a guide section.
const PREVIEW_ROUTES = [
  "/portal",
  "/portal/events",
  "/portal/tasks",
  "/portal/pm",
  "/portal/requests",
  "/portal/review",
  "/portal/reelnotes",
  "/portal/activity",
  // The guide itself: no "i" needed.
  "/portal/guide",
];

const MEMBER: GuideViewer = { role: "member", status: "approved", isStaff: false };
const ADMIN: GuideViewer = { role: "admin", status: "approved", isStaff: true };
const SUPER: GuideViewer = { role: "super_admin", status: "approved", isStaff: true };

// Every app/portal/**/page.tsx as a URL, with [dynamic] segments filled in.
function portalRoutes(): string[] {
  const root = join(import.meta.dirname, "../../app/portal");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") {
        const rel = relative(root, dir).split(sep).filter(Boolean);
        const segs = rel
          .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
          .map((s) => (s.startsWith("[") ? "sample" : s));
        out.push(["/portal", ...segs].join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

function inPreview(route: string): boolean {
  return PREVIEW_ROUTES.some((p) =>
    p === "/portal" ? route === p : route === p || route.startsWith(p + "/")
  );
}

test("section ids are unique and anchor-safe", () => {
  const ids = GUIDE_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("every released portal page has a guide section", () => {
  const missing = portalRoutes().filter((r) => !inPreview(r) && !guideSectionForPath(r, SUPER));
  assert.deepEqual(missing, [], "add a section (or a route) in lib/help/guide.ts for these pages");
});

test("every section has a title, keywords and body text", () => {
  for (const s of GUIDE_SECTIONS) {
    assert.ok(s.title.trim(), s.id);
    assert.ok(s.keywords.length > 0, `${s.id} needs search keywords`);
    assert.ok(s.body.trim().length > 40, `${s.id} needs a body`);
  }
});

test("members only see the member sections", () => {
  const forMember = guideSectionsFor(MEMBER);
  assert.ok(forMember.length > 0);
  assert.ok(forMember.every((s) => s.audience === "everyone"));
  assert.equal(guideSectionForPath("/portal/settings", MEMBER), null);
  assert.equal(guideSectionForPath("/portal/contacts", MEMBER), null);
});

test("admins see admin sections but not super-admin ones", () => {
  const forAdmin = guideSectionsFor(ADMIN);
  assert.ok(forAdmin.some((s) => s.audience === "staff"));
  assert.ok(forAdmin.every((s) => s.audience !== "super_admin"));
  assert.ok(guideSectionsFor(SUPER).some((s) => s.audience === "super_admin"));
});

test("coaches see the coaches' sections, other members don't", () => {
  const COACH: GuideViewer = { ...MEMBER, isCoach: true };
  const forCoach = guideSectionsFor(COACH);
  assert.ok(forCoach.some((s) => s.id === "hs-schedule"));
  assert.ok(forCoach.some((s) => s.id === "external-contacts"));
  assert.ok(forCoach.every((s) => s.audience === "everyone" || s.audience === "coaches"));
  assert.equal(guideSectionForPath("/portal/schedule", COACH)?.id, "hs-schedule");
  assert.equal(guideSectionForPath("/portal/contacts/abc", COACH)?.id, "external-contacts");
  assert.ok(!guideSectionsFor(MEMBER).some((s) => s.audience === "coaches"));
  assert.equal(guideSectionForPath("/portal/schedule", MEMBER), null);
  // The board reads them too; a pending coach doesn't.
  assert.ok(guideSectionsFor(ADMIN).some((s) => s.id === "hs-schedule"));
  assert.ok(!guideSectionsFor({ ...COACH, status: "pending" }).some((s) => s.audience === "coaches"));
});

test("the travel coordinator reads the hotels section, and the board still gets its own", () => {
  const TRAVEL: GuideViewer = { ...MEMBER, canManageTravel: true };
  assert.equal(guideSectionForPath("/portal/contacts", TRAVEL)?.id, "travel-contacts");
  assert.equal(guideSectionForPath("/portal/contacts/abc/edit", TRAVEL)?.id, "travel-contacts");
  assert.ok(!guideSectionsFor(TRAVEL).some((s) => s.audience === "staff" || s.audience === "coaches"));
  assert.ok(!guideSectionsFor(MEMBER).some((s) => s.id === "travel-contacts"));
  // The board's "i" on External Contacts stays the main section.
  assert.equal(guideSectionForPath("/portal/contacts", ADMIN)?.id, "external-contacts");
  assert.ok(guideSectionsFor(SUPER).some((s) => s.id === "travel-contacts"));
});

test("a pending account is treated as a member", () => {
  const pendingAdmin: GuideViewer = { role: "admin", status: "pending", isStaff: false };
  assert.ok(guideSectionsFor(pendingAdmin).every((s) => s.audience === "everyone"));
  assert.ok(guideSectionsFor(null).every((s) => s.audience === "everyone"));
});

test("a page's help is its most specific section", () => {
  assert.equal(guideSectionForPath("/portal/slack-archive/search", MEMBER)?.id, "slack-archive-search");
  assert.equal(guideSectionForPath("/portal/slack-archive/C0123", MEMBER)?.id, "slack-archive");
  assert.equal(guideSectionForPath("/portal/docs/abc/history", MEMBER)?.id, "playbooks");
  assert.equal(guideSectionForPath("/portal/guide", MEMBER), null);
});

test("preview sections only reach accounts on the staged-rollout list", () => {
  const preview = GUIDE_SECTIONS.filter((s) => s.preview);
  assert.ok(preview.some((s) => s.id === "activity"), "Activity's section is flagged preview");
  const jeff: GuideViewer = { ...SUPER, seesFullUi: true };
  for (const s of preview) {
    // Another super-admin (Rachel) doesn't get it — in the guide or behind the "i".
    assert.ok(!guideSectionsFor(SUPER).includes(s), `${s.id} leaks to super-admins off the list`);
    // Being on the list doesn't widen a section past its audience.
    if (s.audience === "super_admin") assert.ok(!guideSectionsFor({ ...ADMIN, seesFullUi: true }).includes(s));
    assert.ok(guideSectionsFor(jeff).includes(s), `${s.id} should show on the list`);
  }
  assert.equal(guideSectionForPath("/portal/activity", SUPER), null);
  assert.equal(guideSectionForPath("/portal/activity", jeff)?.id, "activity");
});

// The guide reads in sidebar order, with every Settings section together in
// the order of the Settings tabs, so the Contents list matches the portal.
test("sections follow the sidebar, and Settings follows its tabs", () => {
  const src = (f: string) => readFileSync(join(import.meta.dirname, "../..", f), "utf8");
  const ids = GUIDE_SECTIONS.map((s) => s.id);

  // Sidebar: the nav in file order, with the pinned bottom items last.
  const sidebar = src("app/components/PortalSidebar.tsx");
  const nav = [...sidebar.matchAll(/\{ href: "(\/portal[^"]*)"/g)].map((m) => m[1]);
  const bottom = [...(sidebar.match(/BOTTOM_HREFS = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const pages = [...nav.filter((h) => !bottom.includes(h) && h !== "/portal/settings"), ...bottom.filter((h) => h.startsWith("/"))];
  const firstFor = pages
    .map((href) => ids.indexOf(GUIDE_SECTIONS.find((s) => s.routes?.includes(href))?.id ?? ""))
    .filter((i) => i >= 0);
  assert.deepEqual(firstFor, [...firstFor].sort((a, b) => a - b), "page sections should follow the sidebar");

  // Settings: its sections sit together at the end, in tab order.
  const settings = GUIDE_SECTIONS.filter((s) => s.title.startsWith("Settings: "));
  const start = ids.indexOf(settings[0].id);
  assert.deepEqual(ids.slice(start, start + settings.length), settings.map((s) => s.id), "Settings sections sit together");
  assert.equal(start + settings.length, ids.length, "Settings comes last, like in the sidebar");
  const tabs = [...src("app/portal/settings/page.tsx").matchAll(/\{ key: "[a-z_]+", label: "([^"]+)"/g)].map((m) => m[1]);
  const tabOf = (s: { title: string }) => tabs.indexOf(s.title.slice("Settings: ".length));
  assert.ok(settings.every((s) => tabOf(s) >= 0), "every Settings section names a tab");
  assert.deepEqual(settings.map(tabOf), settings.map(tabOf).sort((a, b) => a - b), "Settings sections follow the tabs");
});

test("each Contents group's sections sit together", () => {
  const seen: string[] = [];
  for (const s of GUIDE_SECTIONS) {
    assert.ok(s.group.trim(), `${s.id} needs a group`);
    if (seen[seen.length - 1] !== s.group) {
      assert.ok(!seen.includes(s.group), `${s.id}: the ${s.group} sections should be together`);
      seen.push(s.group);
    }
  }
  assert.equal(seen[seen.length - 1], "Settings");
});
