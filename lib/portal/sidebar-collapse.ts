// Portal sidebar rail vs full labels.
//
// Default collapsed on:
//   - widths below 1440 (a 12.9" iPad Pro landscape is ~1366)
//   - touch / tablet: pointer: coarse, or maxTouchPoints > 1 (iPadOS
//     Safari often reports a desktop UA, so userAgent is not enough)
// Always start from that default on load — a stored or leftover
// expanded choice must not win. The user can still expand for this visit.

export const SIDEBAR_COLLAPSE_BREAKPOINT = 1440;

// CSS first-paint query. any-pointer: coarse is the stylesheet stand-in
// for maxTouchPoints > 1 so an iPad + trackpad does not expand then snap.
export const SIDEBAR_COLLAPSE_QUERY = `(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT - 1}px), (pointer: coarse), (any-pointer: coarse)`;

export type SidebarCollapseMode = "auto" | "collapsed" | "expanded";

export type SidebarViewport = {
  width: number;
  pointerCoarse?: boolean;
  maxTouchPoints?: number;
};

export function sidebarCollapsedByWidth(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_BREAKPOINT;
}

export function sidebarDefaultCollapsed(vp: SidebarViewport): boolean {
  if (vp.pointerCoarse) return true;
  if ((vp.maxTouchPoints ?? 0) > 1) return true;
  return sidebarCollapsedByWidth(vp.width);
}

export function sidebarIsCollapsed(mode: SidebarCollapseMode, vp: SidebarViewport): boolean {
  if (mode === "collapsed") return true;
  if (mode === "expanded") return false;
  return sidebarDefaultCollapsed(vp);
}

export function toggleSidebarMode(mode: SidebarCollapseMode, vp: SidebarViewport): SidebarCollapseMode {
  return sidebarIsCollapsed(mode, vp) ? "expanded" : "collapsed";
}

// Crossing a default-collapsed boundary drops a manual Collapse / expand
// from this session and follows the new default. Staying on the same side
// keeps the choice.
export function sidebarModeAfterResize(
  mode: SidebarCollapseMode,
  previous: SidebarViewport,
  next: SidebarViewport,
): SidebarCollapseMode {
  if (sidebarDefaultCollapsed(previous) === sidebarDefaultCollapsed(next)) return mode;
  return "auto";
}

export function readSidebarDefaultCollapsed(win: {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { maxTouchPoints?: number };
}): boolean {
  return win.matchMedia(SIDEBAR_COLLAPSE_QUERY).matches || (win.navigator.maxTouchPoints ?? 0) > 1;
}

export function sidebarViewportFromWindow(win: {
  innerWidth: number;
  matchMedia: (query: string) => { matches: boolean };
  navigator: { maxTouchPoints?: number };
}): SidebarViewport {
  return {
    width: win.innerWidth,
    pointerCoarse: win.matchMedia("(pointer: coarse)").matches,
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
  };
}
