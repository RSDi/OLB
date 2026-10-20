import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_COLLAPSE_BREAKPOINT,
  SIDEBAR_COLLAPSE_QUERY,
  sidebarCollapsedByWidth,
  sidebarIsCollapsed,
  sidebarModeAfterResize,
  toggleSidebarMode,
} from "../../lib/portal/sidebar-collapse.ts";

test("breakpoint is 1280px, query is max-width 1279px", () => {
  assert.equal(SIDEBAR_COLLAPSE_BREAKPOINT, 1280);
  assert.equal(SIDEBAR_COLLAPSE_QUERY, "(max-width: 1279px)");
});

test("collapsed by default below 1280, expanded at 1280 and above", () => {
  assert.equal(sidebarCollapsedByWidth(767), true);
  assert.equal(sidebarCollapsedByWidth(1024), true);
  assert.equal(sidebarCollapsedByWidth(1194), true);
  assert.equal(sidebarCollapsedByWidth(1279), true);
  assert.equal(sidebarCollapsedByWidth(1280), false);
  assert.equal(sidebarCollapsedByWidth(1440), false);
});

test("auto mode follows the viewport; a manual choice wins until resize", () => {
  assert.equal(sidebarIsCollapsed("auto", 1024), true);
  assert.equal(sidebarIsCollapsed("auto", 1280), false);
  assert.equal(sidebarIsCollapsed("expanded", 1024), false);
  assert.equal(sidebarIsCollapsed("collapsed", 1440), true);
});

test("toggle writes an explicit opposite of the current visual state", () => {
  assert.equal(toggleSidebarMode("auto", 1024), "expanded");
  assert.equal(toggleSidebarMode("auto", 1400), "collapsed");
  assert.equal(toggleSidebarMode("expanded", 1024), "collapsed");
  assert.equal(toggleSidebarMode("collapsed", 1400), "expanded");
});

test("resize across the breakpoint returns to auto; staying put keeps a toggle", () => {
  assert.equal(sidebarModeAfterResize("expanded", 1100, 1200), "expanded");
  assert.equal(sidebarModeAfterResize("collapsed", 1400, 1600), "collapsed");
  assert.equal(sidebarModeAfterResize("expanded", 1100, 1280), "auto");
  assert.equal(sidebarModeAfterResize("collapsed", 1400, 1279), "auto");
  assert.equal(sidebarModeAfterResize("auto", 800, 1400), "auto");
});
