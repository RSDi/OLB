// Server layout for the portal.
//
// Fetches the viewer once per request via React `cache()` (see
// `lib/auth/viewer.ts`) so any nested server page that calls `getViewer()`
// hits the cache instead of re-querying Supabase. Also fetches the
// pending-approval count for super-admins so the sidebar badge can render
// without a client round trip, and the custom sidebar links (Settings →
// Sidebar Links).
//
// All UI state (collapse, mobile drawer, page title computation) lives in
// the `PortalShell` client component below.

import type { Viewport } from "next";
import { getPendingMembersCount, getViewer, viewerIsCoach } from "../../lib/auth/viewer";
import { getSidebarLinks } from "../../lib/sidebar-links/queries";
import { parentHasBalance } from "../../lib/finances/data";
import { getPreview } from "../../lib/activity/preview";
import { PortalShell } from "./PortalShell";

// The Lightning theme is light apart from the black sidebar: tint mobile
// browser chrome to match the white top bar, and tell the browser before any
// CSS loads.
export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Any board member can action the approval queue (D1), so the whole
  // staff sees the pending badge.
  const viewer = await getViewer();
  const [pendingMembersCount, sidebarLinks, preview, hasBalance, isCoach] = await Promise.all([
    viewer?.isStaff ? getPendingMembersCount() : Promise.resolve(0),
    viewer ? getSidebarLinks() : Promise.resolve([]),
    // A super-admin's "Preview as" in progress (banner + way back).
    getPreview(),
    // Payments in the sidebar: a parent whose balance the Treasurer has opened.
    viewer?.status === "approved" && !viewer.canManageFinances ? parentHasBalance() : Promise.resolve(false),
    // HS Schedule and External Contacts in the sidebar, and the coaches' help:
    // a coach (the board sees them anyway, so it isn't asked for them).
    viewerIsCoach(viewer),
  ]);

  return (
    <PortalShell
      viewer={
        viewer
          ? {
              role: viewer.role,
              status: viewer.status,
              isStaff: viewer.isStaff,
              seesFullUi: viewer.seesFullUi,
              canManageFinances: viewer.canManageFinances,
              canManageRegistrations: viewer.canManageRegistrations,
              canManageTravel: viewer.canManageTravel,
              canSlackDm: viewer.canSlackDm,
              canManageWebsite: viewer.canManageWebsite,
              seesPayments: viewer.canManageFinances || hasBalance,
              isCoach,
            }
          : null
      }
      preview={
        preview
          ? {
              targetName: preview.targetName,
              impersonatorName: preview.impersonatorName,
              expiresAt: preview.expiresAt,
            }
          : null
      }
      pendingMembersCount={pendingMembersCount}
      sidebarLinks={sidebarLinks}
    >
      {children}
    </PortalShell>
  );
}
