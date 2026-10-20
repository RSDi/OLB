import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIDEBAR_COLLAPSE_BREAKPOINT,
  SIDEBAR_COLLAPSE_QUERY,
  readSidebarDefaultCollapsed,
  sidebarCollapsedByWidth,
  sidebarDefaultCollapsed,
  sidebarIsCollapsed,
  sidebarModeAfterResize,
  sidebarViewportFromWindow,
  toggleSidebarMode,
} from "../../lib/portal/sidebar-collapse.ts";

test("breakpoint is 1440px; query covers width, pointer, and any-pointer", () => {
  assert.equal(SIDEBAR_COLLAPSE_BREAKPOINT, 1440);
  assert.equal(
    SIDEBAR_COLLAPSE_QUERY,
    "(max-width: 1439px), (pointer: coarse), (any-pointer: coarse)"
  );
});

test("collapsed by default below 1440, expanded at 1440 and above on a mouse desktop", () => {
  assert.equal(sidebarCollapsedByWidth(767), true);
  assert.equal(sidebarCollapsedByWidth(1024), true);
  assert.equal(sidebarCollapsedByWidth(1194), true);
  assert.equal(sidebarCollapsedByWidth(1366), true);
  assert.equal(sidebarCollapsedByWidth(1439), true);
  assert.equal(sidebarCollapsedByWidth(1440), false);
  assert.equal(sidebarDefaultCollapsed({ width: 1366 }), true);
  assert.equal(sidebarDefaultCollapsed({ width: 1440 }), false);
});

test("touch / tablet defaults collapsed even at desktop widths (iPadOS UA)", () => {
  assert.equal(sidebarDefaultCollapsed({ width: 1440, pointerCoarse: true }), true);
  assert.equal(sidebarDefaultCollapsed({ width: 1600, maxTouchPoints: 5 }), true);
  assert.equal(sidebarDefaultCollapsed({ width: 1600, maxTouchPoints: 1 }), false);
  assert.equal(sidebarDefaultCollapsed({ width: 1600, pointerCoarse: false, maxTouchPoints: 0 }), false);
});

test("auto mode follows the viewport; a manual expand never wins on load (auto)", () => {
  assert.equal(sidebarIsCollapsed("auto", { width: 1024 }), true);
  assert.equal(sidebarIsCollapsed("auto", { width: 1366 }), true);
  assert.equal(sidebarIsCollapsed("auto", { width: 1440 }), false);
  assert.equal(sidebarIsCollapsed("auto", { width: 1600, maxTouchPoints: 5 }), true);
  assert.equal(sidebarIsCollapsed("expanded", { width: 1024 }), false);
  assert.equal(sidebarIsCollapsed("collapsed", { width: 1600 }), true);
});

test("toggle writes an explicit opposite of the current visual state", () => {
  assert.equal(toggleSidebarMode("auto", { width: 1024 }), "expanded");
  assert.equal(toggleSidebarMode("auto", { width: 1600 }), "collapsed");
  assert.equal(toggleSidebarMode("auto", { width: 1600, maxTouchPoints: 5 }), "expanded");
  assert.equal(toggleSidebarMode("expanded", { width: 1024 }), "collapsed");
  assert.equal(toggleSidebarMode("collapsed", { width: 1600 }), "expanded");
});

test("resize across a default-collapsed boundary returns to auto; staying put keeps a toggle", () => {
  assert.equal(
    sidebarModeAfterResize("expanded", { width: 1100 }, { width: 1366 }),
    "expanded"
  );
  assert.equal(
    sidebarModeAfterResize("collapsed", { width: 1500 }, { width: 1600 }),
    "collapsed"
  );
  assert.equal(
    sidebarModeAfterResize("expanded", { width: 1100 }, { width: 1440 }),
    "auto"
  );
  assert.equal(
    sidebarModeAfterResize("collapsed", { width: 1500 }, { width: 1439 }),
    "auto"
  );
  assert.equal(
    sidebarModeAfterResize("auto", { width: 800 }, { width: 1600 }),
    "auto"
  );
  assert.equal(
    sidebarModeAfterResize("expanded", { width: 1600, maxTouchPoints: 5 }, { width: 1600, maxTouchPoints: 5 }),
    "expanded"
  );
});

test("readSidebarDefaultCollapsed uses the CSS query or maxTouchPoints", () => {
  const fineWide = {
    matchMedia: (q: string) => ({ matches: q.includes("max-width") ? false : false }),
    navigator: { maxTouchPoints: 0 },
  };
  assert.equal(readSidebarDefaultCollapsed(fineWide), false);

  const narrow = {
    matchMedia: (q: string) => ({ matches: q.includes("1439") }),
    navigator: { maxTouchPoints: 0 },
  };
  assert.equal(readSidebarDefaultCollapsed(narrow), true);

  const ipadDesktopUa = {
    matchMedia: () => ({ matches: false }),
    navigator: { maxTouchPoints: 5 },
  };
  assert.equal(readSidebarDefaultCollapsed(ipadDesktopUa), true);
});

test("sidebarViewportFromWindow reads width, pointer, and maxTouchPoints", () => {
  const win = {
    innerWidth: 1366,
    matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" }),
    navigator: { maxTouchPoints: 5 },
  };
  assert.deepEqual(sidebarViewportFromWindow(win), {
    width: 1366,
    pointerCoarse: true,
    maxTouchPoints: 5,
  });
});

test("CSS first-paint query matches JS so the sidebar does not flash expanded", () => {
  const css = readFileSync(join(import.meta.dirname, "../../app/globals.css"), "utf8");
  assert.match(css, /max-width: 1439px/);
  assert.match(css, /pointer: coarse/);
  assert.match(css, /any-pointer: coarse/);
  assert.match(css, /\.rsd-app:not\(\.sidebar-expanded\)/);
  assert.doesNotMatch(css, /max-width: 1279px/);
});

test("PortalShell starts auto, reads touch, and does not restore a stored expand", () => {
  const shell = readFileSync(join(import.meta.dirname, "../../app/portal/PortalShell.tsx"), "utf8");
  assert.match(shell, /useState<SidebarCollapseMode>\("auto"\)/);
  assert.match(shell, /readSidebarDefaultCollapsed/);
  assert.match(shell, /sidebarViewportFromWindow/);
  assert.match(shell, /Never restore a\s+stored expanded preference/);
  assert.doesNotMatch(shell, /localStorage\.(get|set)Item\([^)]*sidebar/i);
  assert.doesNotMatch(shell, /sessionStorage\.(get|set)Item/);
});
