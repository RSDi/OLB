// The User Guide (lib/help/guide.ts) against the portal's actual pages: every
// page people can reach has a guide section behind its top-bar "i", and each
// section only reaches the people it's written for. A new portal page fails
// here until it gets a section (or is listed as still in preview below).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
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
  "/portal/teams",
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
