// Server layout for the portal.
//
// Fetches the viewer once per request via React `cache()` (see
// `lib/auth/viewer.ts`) so any nested server page that calls `getViewer()`
// hits the cache instead of re-querying Supabase. Also fetches the
// pending-approval count for super-admins so the sidebar badge can render
// without a client round trip.
//
// All UI state (collapse, mobile drawer, page title computation) lives in
// the `PortalShell` client component below.

import type { Viewport } from "next";
import { getPendingMembersCount, getViewer } from "../../lib/auth/viewer";
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
  // Any committee member can action the approval queue (D1), so the whole
  // staff sees the pending badge.
  const viewer = await getViewer();
  const pendingMembersCount = viewer?.isStaff
    ? await getPendingMembersCount()
    : 0;

  return (
    <PortalShell
      viewer={
        viewer
          ? { role: viewer.role, status: viewer.status, isStaff: viewer.isStaff }
          : null
      }
      pendingMembersCount={pendingMembersCount}
    >
      {children}
    </PortalShell>
  );
}
