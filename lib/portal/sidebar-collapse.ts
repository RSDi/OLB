// Portal sidebar rail vs full labels.
//
// Below 1280px the full sidebar crowds an iPad (portrait and landscape) and
// a narrow desktop window, so it starts as the icon rail. At 1280px and up
// it starts expanded. The user can still tap Collapse / the arrow; that
// choice lasts until the window crosses this breakpoint again.

export const SIDEBAR_COLLAPSE_BREAKPOINT = 1280;

export const SIDEBAR_COLLAPSE_QUERY = `(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT - 1}px)`;

export type SidebarCollapseMode = "auto" | "collapsed" | "expanded";

export function sidebarCollapsedByWidth(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_BREAKPOINT;
}

export function sidebarIsCollapsed(mode: SidebarCollapseMode, width: number): boolean {
  if (mode === "collapsed") return true;
  if (mode === "expanded") return false;
  return sidebarCollapsedByWidth(width);
}

export function toggleSidebarMode(mode: SidebarCollapseMode, width: number): SidebarCollapseMode {
  return sidebarIsCollapsed(mode, width) ? "expanded" : "collapsed";
}

// Crossing the breakpoint drops a manual Collapse / expand from this session
// and follows the new default. Staying on the same side keeps the choice.
export function sidebarModeAfterResize(
  mode: SidebarCollapseMode,
  previousWidth: number,
  nextWidth: number,
): SidebarCollapseMode {
  const wasNarrow = sidebarCollapsedByWidth(previousWidth);
  const isNarrow = sidebarCollapsedByWidth(nextWidth);
  if (wasNarrow === isNarrow) return mode;
  return "auto";
}
