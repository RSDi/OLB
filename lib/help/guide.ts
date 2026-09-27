// The User Guide — the single source of truth for in-app help.
//
// Two places read it:
//   1. /portal/guide (sidebar → User Guide) renders every section the viewer
//      can use, with search and a table of contents.
//   2. The top-bar "i" button opens the section whose `routes` best match the
//      current page, with a link through to that spot in the full guide.
//
// KEEP IT CURRENT: any change people can see (a new page, a renamed button, a
// feature released from preview) updates the matching section here in the
// same change, and bumps GUIDE_UPDATED. tests/unit/help-guide.test.ts fails
// when a portal page has no section.
//
// Written for parents, players' families and the board — plain, friendly, no
// jargon. Bodies are markdown (rendered by MarkdownView). Safe to import from
// client components.

import type { MemberRole, MemberStatus } from "../auth/permissions";

// Who a section is for. "staff" = board admins and super-admins; the guide
// hides a section from anyone it doesn't apply to.
export type GuideAudience = "everyone" | "staff" | "super_admin";

export interface GuideSection {
  id: string; // anchor: #help-<id>
  title: string;
  audience: GuideAudience;
  // Extra words for the guide's search box (the title and body are searched too).
  keywords: string[];
  // Portal pages this section is the "i" help for. A page uses the section
  // with the longest matching route (exact, or a parent of the path).
  routes?: string[];
  body: string;
}

// The slice of the viewer the guide needs. Both the server Viewer and the
// sidebar's SidebarViewer fit.
export interface GuideViewer {
  role: MemberRole;
  status: MemberStatus;
  isStaff: boolean;
}

export const GUIDE_UPDATED = "September 2026";

export const GUIDE_SECTIONS: GuideSection[] = [];

export function guideAnchor(id: string): string {
  return `help-${id}`;
}

export function guideHref(id: string): string {
  return `/portal/guide#${guideAnchor(id)}`;
}

export function canSeeGuideSection(section: GuideSection, viewer: GuideViewer | null | undefined): boolean {
  if (section.audience === "everyone") return true;
  if (!viewer || viewer.status !== "approved") return false;
  if (section.audience === "staff") return viewer.isStaff;
  return viewer.role === "super_admin";
}

export function guideSectionsFor(viewer: GuideViewer | null | undefined): GuideSection[] {
  return GUIDE_SECTIONS.filter((s) => canSeeGuideSection(s, viewer));
}

// The "i" help for a page: the visible section with the most specific route
// that is the path itself or one of its parents. Null → no "i" button.
export function guideSectionForPath(
  pathname: string,
  viewer: GuideViewer | null | undefined
): GuideSection | null {
  let best: GuideSection | null = null;
  let bestLen = -1;
  for (const s of GUIDE_SECTIONS) {
    if (!s.routes || !canSeeGuideSection(s, viewer)) continue;
    for (const r of s.routes) {
      const hit = pathname === r || pathname.startsWith(r + "/");
      if (hit && r.length > bestLen) {
        best = s;
        bestLen = r.length;
      }
    }
  }
  return best;
}
