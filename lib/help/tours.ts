// Guided tours: step-by-step callouts that walk people through the portal,
// one highlighted spot at a time (Back / Next / Skip tour). Each tour belongs
// to a User Guide section (lib/help/guide.ts) and says the same things in
// fewer words, pointed at the real buttons.
//
// Where tours start:
//   - "Take the tour" at the top of the User Guide, and "Show me around" on a
//     guide section that has one.
//   - "Show me around" in the top-bar "i" panel, for the page you're on.
//   - The welcome tour starts by itself for new accounts only (see
//     autoStartsWelcomeTour); everyone else starts it from the User Guide.
//
// A step points at the element marked `data-tour="<target>"`. A step whose
// element isn't on the page (a board-only button, a list with nothing in it
// yet) is skipped, so tours cope with every account and every state.
//
// KEEP IT CURRENT alongside the guide: rename a button, rename it here too.
// tests/unit/help-tours.test.ts fails when a step points at a target no
// component carries, or when a step reaches people its section doesn't.
//
// Safe to import from client components.

import {
  GUIDE_SECTIONS,
  canSeeAudience,
  canSeeGuideSection,
  guideSectionForPath,
  type GuideAudience,
  type GuideViewer,
} from "./guide.ts"; // explicit extension so node --test can load this file

export interface TourStep {
  // The `data-tour` value of the element to point at. Omit for a card in the
  // middle of the screen (a welcome or a wrap-up).
  target?: string;
  title: string;
  // Markdown, a sentence or two.
  body: string;
  // Narrower than the tour's section, e.g. a board-only button on a page
  // everyone uses. Defaults to the section's audience.
  audience?: GuideAudience;
  // The element lives in the sidebar, so open the drawer on phones.
  sidebar?: boolean;
}

export interface GuideTour {
  id: string;
  // The guide section this tour walks through. The tour reaches the same
  // people the section does.
  sectionId: string;
  title: string;
  // The page the tour runs on. Starting it from anywhere else goes there
  // first.
  route: string;
  steps: TourStep[];
}

export const GUIDE_TOURS: GuideTour[] = [
  {
    id: "welcome",
    sectionId: "getting-around",
    title: "Welcome tour",
    route: "/portal/directory",
    steps: [
      {
        title: "Welcome to the member portal",
        body: "This quick tour shows you where everything is. Use **Next** and **Back** (or the ← and → keys) to move along, and **Skip tour** any time. You can take it again from the **User Guide**.",
      },
      {
        target: "sidebar-nav",
        sidebar: true,
        title: "The sidebar",
        body: "Everything you can use lives here. You only see the parts that apply to you.",
      },
      {
        target: "nav-directory",
        sidebar: true,
        title: "Directory",
        body: "Home base: this season's players and parents, grouped by team. It's where you land when you sign in.",
      },
      {
        target: "nav-playbooks",
        sidebar: true,
        title: "Playbooks",
        body: "How-to guides and step-by-step checklists for how we do things around the club.",
      },
      {
        target: "nav-slack-archive",
        sidebar: true,
        title: "Slack Archive",
        body: "Past messages, photos and files from the club's Slack, so nothing gets lost when Slack hides older messages.",
      },
      {
        target: "nav-contacts",
        sidebar: true,
        audience: "staff",
        title: "External Contacts",
        body: "Vendors, photographers, gyms we rent and other programs. Only the board sees this.",
      },
      {
        target: "sidebar-links",
        sidebar: true,
        title: "Club links",
        body: "Extra links the club has added, like **Schedule**. Most open in a new browser tab, so the portal stays open where you left it.",
      },
      {
        target: "nav-guide",
        sidebar: true,
        title: "User Guide",
        body: "The full guide, with a search box. Come back here any time you're not sure how something works.",
      },
      {
        target: "nav-settings",
        sidebar: true,
        audience: "staff",
        title: "Settings",
        body: "Approve new sign-ups and manage member accounts. A red badge here counts the access requests waiting for you.",
      },
      {
        target: "sidebar-collapse",
        sidebar: true,
        title: "Collapse",
        body: "Shrinks the sidebar to icons when you want more room. Tap it again to expand.",
      },
      {
        target: "menu-button",
        title: "The menu",
        body: "On a phone, tap the **menu** button to open the sidebar.",
      },
      {
        target: "global-search",
        title: "Search",
        body: "Finds members, playbooks and Slack messages from any page. Press **⌘K** on a Mac or **Ctrl K** on Windows to jump here.",
      },
      {
        target: "page-help",
        title: "Help on every page",
        body: "Tap **ⓘ** to read about the page you're on. Most pages also have **Show me around**, a tour like this one for just that page.",
      },
      {
        title: "You're all set",
        body: "Want a closer look at a page? Open it, tap **ⓘ**, then **Show me around**. Or open the **User Guide** and pick a section.",
      },
    ],
  },
  {
    id: "directory",
    sectionId: "directory",
    title: "Directory tour",
    route: "/portal/directory",
    steps: [
      {
        target: "page-title",
        title: "The Directory",
        body: "This season's players and their parents, grouped by team.",
      },
      {
        target: "directory-search",
        title: "Search",
        body: "Find a player, parent, email or phone number. Type 3 or more digits to match a phone.",
      },
      {
        target: "directory-view",
        title: "By team or by age group",
        body: "Coaches, other team leaders and the board can switch between **By team** and **By age group** (10U–18U).",
      },
      {
        target: "directory-teams",
        title: "Pick a team",
        body: "Tap a team to show just that team, with its division, practice times and location, and who's coaching. **All teams** shows everyone; **No team yet** shows players who haven't been placed.",
      },
      {
        target: "directory-player",
        title: "Each player",
        body: "Jersey number, team, age and birthday, address, and their parents' phone and email. A **New** chip means it's their first season with us.",
      },
      {
        target: "directory-parent",
        title: "Profiles",
        body: "Tap a parent's name to open their profile. On your own profile, **✎ Edit profile** changes your nickname, phone and birthday.",
      },
      {
        target: "directory-team-page",
        title: "Team page",
        body: "Opens the team's own page: every staff and volunteer job (with **Open spot** where nobody's signed up yet) and the roster.",
      },
    ],
  },
  {
    id: "playbooks",
    sectionId: "playbooks",
    title: "Playbooks tour",
    route: "/portal/docs",
    steps: [
      {
        target: "page-title",
        title: "Playbooks",
        body: "Step-by-step guides for how we do things around the club.",
      },
      {
        target: "playbooks-new",
        audience: "staff",
        title: "New Playbook",
        body: "Write a new playbook: a title, a category, and the steps, with pictures and videos if you like.",
      },
      {
        target: "playbooks-card",
        title: "Open a playbook",
        body: "Newest-updated first. Tap one to open it. Some have **procedures**, checklists for a job you do the same way every time, on the **Run** tab.",
      },
    ],
  },
  {
    id: "slack-archive",
    sectionId: "slack-archive",
    title: "Slack Archive tour",
    route: "/portal/slack-archive",
    steps: [
      {
        target: "page-title",
        title: "Slack Archive",
        body: "The full history of the club's Slack channels, updated every night. You see every public channel, plus the private ones you're in on Slack.",
      },
      {
        target: "archive-search",
        title: "Search archive",
        body: "Find an old message by its words, the channel it was in, or who posted it.",
      },
      {
        target: "archive-album",
        title: "Photo Album",
        body: "Every photo and video shared in the channels you can see, arranged by month.",
      },
      {
        target: "archive-channel",
        title: "Open a channel",
        body: "Messages are grouped by day, with replies tucked under each thread. Inside, use **Jump to date**, **Filter** and **Newest first / Oldest first**.",
      },
      {
        target: "archive-admin",
        audience: "super_admin",
        title: "Managing channels",
        body: "**Add channel** archives another channel by its Slack ID. **Refresh access** re-checks who's in each private channel right away.",
      },
      {
        target: "archive-exceptions",
        audience: "super_admin",
        title: "Exceptions",
        body: "Channels whose sync failed, attachments that didn't download, and videos too big to store.",
      },
    ],
  },
  {
    id: "slack-archive-search",
    sectionId: "slack-archive-search",
    title: "Archive search tour",
    route: "/portal/slack-archive/search",
    steps: [
      {
        target: "archive-search-text",
        title: "Search text",
        body: "Type words to find messages with all of them. Put **\"an exact phrase\"** in quotes, and a minus in front of a word (**-hotel**) to leave it out.",
      },
      {
        target: "archive-search-filters",
        title: "Channel and User",
        body: "Narrow it down with the **Channel** and **User** pickers, or leave the text empty and pick a person to see everything they've posted.",
      },
    ],
  },
  {
    id: "slack-archive-album",
    sectionId: "slack-archive-album",
    title: "Photo Album tour",
    route: "/portal/slack-archive/album",
    steps: [
      {
        target: "album-search",
        title: "Search the album",
        body: "Search captions, people, channels or a month (e.g. \"june 2024\").",
      },
      {
        target: "album-controls",
        title: "Narrow it down",
        body: "Show **All**, just **Photos** or just **Videos**, pick a **Channel** or **People**, **Jump to month**, or flip **Newest first / Oldest first**.",
      },
      {
        target: "album-tile",
        title: "Open a photo",
        body: "Tap a photo to see it full-screen. Use the arrows to move through them, **View in conversation** to see the Slack thread, and **Download original** to save it.",
      },
    ],
  },
  {
    id: "external-contacts",
    sectionId: "external-contacts",
    title: "External Contacts tour",
    route: "/portal/contacts",
    steps: [
      {
        target: "page-title",
        title: "External Contacts",
        body: "Everyone outside the club we work with. Only the board can see it.",
      },
      {
        target: "contacts-new",
        title: "New contact",
        body: "Add a **Company** or a **Person**: contact info, account and billing details, notes and tags.",
      },
      {
        target: "contacts-search",
        title: "Search",
        body: "By name, email, phone, account number or type.",
      },
      {
        target: "contacts-filters",
        title: "Filter",
        body: "Show just **Companies**, just **People**, or one type of contact.",
      },
    ],
  },
  {
    id: "settings-members",
    sectionId: "settings-members",
    title: "Settings tour",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tabs",
        audience: "super_admin",
        title: "Settings tabs",
        body: "Members, Teams, Volunteer Roles, Playbooks, Sidebar Links, Contact Types and the Audit Log each have their own tab.",
      },
      {
        target: "members-add",
        audience: "super_admin",
        title: "Add member",
        body: "Set someone up ahead of time. Leave the email blank for a **directory-only** entry, like a grandparent who won't sign in.",
      },
      {
        target: "members-search",
        title: "Find someone",
        body: "Search by name or email.",
      },
      {
        target: "members-status",
        title: "Pending, Approved, Denied, Not signed up",
        body: "**Pending** is the queue of access requests: **Approve** lets them in and emails them, **Deny** turns them away. **Not signed up** lists registered parents who haven't made a login yet.",
      },
    ],
  },
];

export function canSeeTour(tour: GuideTour, viewer: GuideViewer | null | undefined): boolean {
  const section = GUIDE_SECTIONS.find((s) => s.id === tour.sectionId);
  return !!section && canSeeGuideSection(section, viewer);
}

// The steps this viewer should get, in order. Steps are also skipped at run
// time when their element isn't on the page.
export function tourStepsFor(tour: GuideTour, viewer: GuideViewer | null | undefined): TourStep[] {
  if (!canSeeTour(tour, viewer)) return [];
  return tour.steps.filter((s) => !s.audience || canSeeAudience(s.audience, viewer));
}

export function getTour(id: string): GuideTour | undefined {
  return GUIDE_TOURS.find((t) => t.id === id);
}

// The tour for a guide section, if it has one this viewer can take.
export function tourForSection(sectionId: string, viewer: GuideViewer | null | undefined): GuideTour | null {
  const tour = GUIDE_TOURS.find((t) => t.sectionId === sectionId);
  return tour && canSeeTour(tour, viewer) ? tour : null;
}

// The "Show me around" tour for a page: the tour of the page's "i" section,
// when the tour runs on this very page (a tour of the channel list is no use
// inside a channel).
export function tourForPath(pathname: string, viewer: GuideViewer | null | undefined): GuideTour | null {
  const section = guideSectionForPath(pathname, viewer);
  if (!section) return null;
  const tour = tourForSection(section.id, viewer);
  return tour && tour.route === pathname ? tour : null;
}

export const WELCOME_TOUR_ID = "welcome";
// Remembers, per browser, that the welcome tour has been offered (or ruled
// out for an existing account) so the check runs once.
export const WELCOME_TOUR_SEEN_KEY = "olb-welcome-tour-seen";
// The day tours shipped. Logins created from here on are "new" and get the
// welcome tour by itself; people who already had an account start it from
// "Take the tour" in the User Guide instead of being interrupted.
export const WELCOME_TOUR_NEW_SINCE = "2026-09-27T00:00:00Z";

// Whether the welcome tour starts by itself for a login created at
// `accountCreatedAt` (Supabase's auth user created_at).
export function autoStartsWelcomeTour(accountCreatedAt: string | null | undefined): boolean {
  if (!accountCreatedAt) return false;
  const created = Date.parse(accountCreatedAt);
  return !Number.isNaN(created) && created >= Date.parse(WELCOME_TOUR_NEW_SINCE);
}
