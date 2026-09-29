"use client";
// Client shell wrapping every portal route.
//
// Owns UI-only state (collapse + mobile drawer + global search modal) and
// computes the topbar label from the current pathname. Auth/viewer data is
// fetched once in the parent server `layout.tsx` and passed in via props
// so the sidebar can render without its own client-side Supabase round
// trip.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PortalSidebar, type SidebarViewer } from "../components/PortalSidebar";
import { PortalTopBar } from "../components/PortalTopBar";
import { GlobalSearch } from "../components/GlobalSearch";
import { InfoPanel } from "../components/InfoPanel";
import { GuidedTour, TourContext, type StartTour } from "../components/GuidedTour";
import { ScrollToTopButton } from "../components/ScrollToTopButton";
import { ActivityBeacon } from "../components/ActivityBeacon";
import { PreviewBanner, type PreviewInfo } from "../components/PreviewBanner";
import { PageHelpContext } from "../components/PageHelp";
import { guideSectionForPage } from "../../lib/help/guide";
import {
  WELCOME_TOUR_ID,
  WELCOME_TOUR_SEEN_KEY,
  autoStartsWelcomeTour,
  tourForPath,
} from "../../lib/help/tours";
import { createClient } from "../../lib/supabase/client";
import type { TopbarSearchHandle } from "../components/TopbarSearch";
import type { SidebarLink } from "../../lib/sidebar-links/url";
import { portalFontVariables } from "./fonts";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/portal":             { title: "Dashboard",    subtitle: "Overview" },
  "/portal/requests": { title: "Make a Request", subtitle: "" },
  "/portal/review": { title: "Review queue", subtitle: "Board" },
  "/portal/tasks": { title: "Opportunities",  subtitle: "" },
  "/portal/tasks/new": { title: "New task", subtitle: "" },
  "/portal/events/new": { title: "New event", subtitle: "Calendar" },
  "/portal/pm":           { title: "Preventative", subtitle: "Facilities" },
  "/portal/pm/calendar":  { title: "PM Calendar", subtitle: "Facilities" },
  "/portal/pm/templates": { title: "PM Templates", subtitle: "Facilities" },
  "/portal/pm/templates/new": { title: "New template", subtitle: "Facilities" },
  "/portal/events":      { title: "Events",       subtitle: "Calendar" },
  "/portal/directory":   { title: "Players & parents", subtitle: "Directory" },
  "/portal/contacts":    { title: "External Contacts", subtitle: "" },
  "/portal/contacts/new": { title: "New contact", subtitle: "External Contacts" },
  "/portal/docs":        { title: "Playbooks",    subtitle: "Operations" },
  "/portal/docs/new":    { title: "New playbook", subtitle: "Operations" },
  "/portal/teams":               { title: "Teams",         subtitle: "Team manager" },
  "/portal/teams/registrations": { title: "Registrations", subtitle: "Team manager" },
  "/portal/teams/import":        { title: "Import roster", subtitle: "Team manager" },
  "/portal/settings":    { title: "Settings",     subtitle: "Board" },
  "/portal/slack-archive":            { title: "Slack Archive", subtitle: "" },
  "/portal/slack-archive/search":     { title: "Search archive", subtitle: "Slack Archive" },
  "/portal/slack-archive/exceptions": { title: "Exceptions",     subtitle: "Slack Archive" },
  "/portal/slack-archive/album":      { title: "Photo Album",    subtitle: "Slack Archive" },
  "/portal/guide":       { title: "User Guide",   subtitle: "Help" },
  "/portal/activity":    { title: "Activity",     subtitle: "Super-admin" },
};

interface Props {
  viewer: SidebarViewer | null;
  pendingMembersCount: number;
  sidebarLinks: SidebarLink[];
  // Set while a super-admin is previewing as this member.
  preview: PreviewInfo | null;
  children: React.ReactNode;
}

export function PortalShell({ viewer, pendingMembersCount, sidebarLinks, preview, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const inlineSearchRef = useRef<TopbarSearchHandle>(null);
  const pathname = usePathname();
  const previewing = preview !== null;
  // The top-bar "i" shows the User Guide section for this page, when the
  // viewer can see one (lib/help/guide.ts), or for the open view on a page
  // with views of its own, like a Settings tab (usePageHelp).
  const [viewSection, setViewSection] = useState<string | null>(null);
  const pageHelp = guideSectionForPage(pathname, viewer, viewSection);
  // …and "Show me around" in that panel runs its guided tour
  // (lib/help/tours.ts). `key` restarts a tour that's started again.
  const pageTour = tourForPath(pathname, viewer, viewSection);
  const [tour, setTour] = useState<{ id: string; part?: number; key: number } | null>(null);

  const startTour = useCallback<StartTour>((id, opts) => {
    setInfoOpen(false);
    setSearchOpen(false);
    setTour({ id, part: opts?.part, key: Date.now() });
  }, []);
  const tourControls = useMemo(() => ({ start: startTour }), [startTour]);

  // A tour step in the sidebar slides the drawer open on phones.
  const onTourSidebarStep = useCallback((inSidebar: boolean) => {
    const phone = window.matchMedia("(max-width: 767px)").matches;
    setMobileOpen(inSidebar && phone);
  }, []);

  // The welcome tour starts by itself the first time an approved member with
  // a new account lands on the Directory (home) in this browser. Existing
  // accounts start it from the User Guide. Asking Supabase when the login was
  // made costs a call, so it's only asked until this browser remembers.
  useEffect(() => {
    // Not during a preview: it would read the member's account age, and it's
    // the super-admin's browser.
    if (viewer?.status !== "approved" || pathname !== "/portal/directory" || previewing) return;
    try {
      if (localStorage.getItem(WELCOME_TOUR_SEEN_KEY)) return;
    } catch {
      return; // no storage → no way to remember, so don't nag every visit
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    createClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (cancelled || error || !data.user) return;
        try {
          localStorage.setItem(WELCOME_TOUR_SEEN_KEY, new Date().toISOString());
        } catch {
          return;
        }
        if (autoStartsWelcomeTour(data.user.created_at)) {
          timer = setTimeout(() => startTour(WELCOME_TOUR_ID), 600);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewer?.status, pathname, startTour, previewing]);

  // Cmd+K / Ctrl+K behavior depends on viewport: focus the inline topbar
  // input if it's mounted (large viewports), otherwise toggle the modal
  // (small + medium). We always intercept early so the shortcut works from
  // any input on the page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (inlineSearchRef.current) {
          inlineSearchRef.current.focus();
        } else {
          setSearchOpen(v => !v);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // The Lightning theme is set on the shell below (so the first paint is
  // already themed) and mirrored onto <html> while the portal is mounted, so
  // the page background and anything portaled to <body> pick it up too.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "lightning";
    return () => {
      delete root.dataset.theme;
    };
  }, []);

  // Exact match first; otherwise label individual ticket detail pages
  // (`/portal/tasks/<id>`, but not /new) as "Request".
  const meta =
    PAGE_META[pathname] ??
    (pathname.startsWith("/portal/requests/")
      ? { title: "New request", subtitle: "" }
      : pathname.startsWith("/portal/tasks/") && pathname !== "/portal/tasks/new"
      ? { title: "Opportunities", subtitle: "" }
      : pathname.startsWith("/portal/pm/templates/")
      ? { title: "Edit template", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/assets/")
      ? { title: "Asset", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/")
      ? { title: "PM Task", subtitle: "Facilities" }
      : pathname.startsWith("/portal/events/")
      ? { title: "Edit event", subtitle: "Calendar" }
      : pathname.startsWith("/portal/contacts/")
      ? { title: "Contact", subtitle: "External Contacts" }
      : pathname.startsWith("/portal/directory/teams/")
      ? { title: "Team", subtitle: "Directory" }
      : pathname.startsWith("/portal/directory/")
      ? { title: "Member", subtitle: "Directory" }
      : pathname.endsWith("/history") && pathname.startsWith("/portal/docs/")
      ? { title: "History", subtitle: "Operations" }
      : pathname.startsWith("/portal/docs/")
      ? { title: "Playbook", subtitle: "Operations" }
      : pathname.startsWith("/portal/slack-archive/")
      ? { title: "Channel", subtitle: "Slack Archive" }
      : { title: "Portal", subtitle: "" });

  // Members (non-staff) use /portal/requests as their dashboard — label it
  // "Dashboard" there instead of "Make a Request" (staff keep /portal).
  const topMeta =
    pathname === "/portal/requests" && !(viewer?.isStaff ?? false)
      ? { title: "Dashboard", subtitle: "Overview" }
      : meta;

  return (
    <PageHelpContext.Provider value={setViewSection}>
      <TourContext.Provider value={tourControls}>
        {preview && <PreviewBanner preview={preview} />}
        <ActivityBeacon />
        <div
          data-theme="lightning"
          className={`rsd-app ${portalFontVariables}${collapsed ? " sidebar-collapsed" : ""}${previewing ? " rsd-previewing" : ""}`}
        >
          <PortalSidebar
            viewer={viewer}
            pendingMembersCount={pendingMembersCount}
            links={sidebarLinks}
            previewing={previewing}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(v => !v)}
            mobileOpen={mobileOpen}
            onNavigate={() => setMobileOpen(false)}
          />
          <PortalTopBar
            title={topMeta.title}
            subtitle={topMeta.subtitle}
            onMenuClick={() => setMobileOpen(v => !v)}
            onSearchClick={() => setSearchOpen(true)}
            inlineSearchRef={inlineSearchRef}
            onInfoClick={pageHelp ? () => setInfoOpen(true) : undefined}
          />
          {/* Mobile overlay */}
          {mobileOpen && (
            <div
              onClick={() => setMobileOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 1100,
                background: "rgba(12,12,14,.45)",
                animation: "gw-fade-in 160ms ease",
              }}
            />
          )}
          <main>{children}</main>
          <ScrollToTopButton />
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
          <InfoPanel
            section={pageHelp}
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            onStartTour={pageTour ? () => startTour(pageTour.id) : undefined}
          />
          {tour && (
            <GuidedTour
              key={tour.key}
              tourId={tour.id}
              startPart={tour.part}
              viewer={viewer}
              onClose={() => setTour(null)}
              onSidebarStep={onTourSidebarStep}
            />
          )}
        </div>
      </TourContext.Provider>
    </PageHelpContext.Provider>
  );
}
