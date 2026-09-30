// Guided tours: step-by-step callouts that walk people through the portal,
// one highlighted spot at a time (Back / Next / Skip tour). Each tour belongs
// to a User Guide section (lib/help/guide.ts) and says the same things in
// fewer words, pointed at the real buttons.
//
// Where tours start:
//   - "Take the tour" at the top of the User Guide, and "Show me around" on a
//     guide section that has one.
//   - "Show me around" in the top-bar "i" panel, for the page you're on (on
//     Settings, the open tab: see usePageHelp in app/components/PageHelp.tsx).
//   - The welcome tour starts by itself for new accounts only (see
//     autoStartsWelcomeTour); everyone else starts it from the User Guide.
//
// A step points at the element marked `data-tour="<target>"`. A step whose
// element isn't on the page (a board-only button, a list with nothing in it
// yet) is skipped, so tours cope with every account and every state.
//
// Longer walkthroughs can span pages (a step's `route`), open things on the
// way (`click`, `dismiss`, `pick`), let people fill in what's highlighted
// (`interactive`), and come in parts (`part`) — see the requirements tour.
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
  guideSectionForPage,
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
  // The page this step is on, when it isn't the tour's `route`. Moving to the
  // step goes there.
  route?: string;
  // Moving forward: click this `data-tour` element to bring the step's
  // element into view (a tab, an "Add" button, a chip that opens a sheet),
  // unless it's already showing.
  click?: string;
  // Moving forward: click this `data-tour` element first if it's on the page,
  // e.g. to close a sheet a previous step opened.
  dismiss?: string;
  // Moving forward: if this `data-tour` drop-down is still on its first
  // option ("All …"), choose the next one, so the step has something to show.
  pick?: string;
  // The highlighted element can be used while the callout shows (type in it,
  // tick it, press it). The rest of the page stays off-limits.
  interactive?: boolean;
  // Starts a part of a longer tour ("Set it up"). The callout shows "Part 2
  // of 3", and when a part's first step isn't on the page for this person,
  // the whole part is skipped.
  part?: string;
}

export interface GuideTour {
  id: string;
  // The guide section this tour walks through. The tour reaches the same
  // people the section does.
  sectionId: string;
  // More guide sections that offer this tour ("Show me around").
  alsoSections?: string[];
  title: string;
  // The page the tour runs on (or starts on, when steps have their own). Starting it from anywhere else goes there
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
        target: "nav-payments",
        sidebar: true,
        title: "Payments",
        body: "What your family owes for the season and what you've paid. It shows up once the Treasurer has your balance ready.",
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
        body: "Tap **ⓘ** to read about the page you're on. Most pages also have **Show me around** there, a tour like this one for just that page. In Settings, it follows the tab you're on.",
      },
      {
        title: "You're all set",
        body: "Want a closer look at a page? Tap **ⓘ** and then **Show me around**. Or open the **User Guide** and pick a section.",
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
        target: "directory-registrations",
        audience: "registrations",
        title: "New registrations",
        body: "When families fill in the registration form, this says how many are waiting. **Review registrations** opens them.",
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
        target: "directory-place",
        audience: "registrations",
        title: "Put players on teams",
        body: "Pick a team from a player's **Team** drop-down and they move there right away. The **No team yet** chip shows who still needs one.",
      },
      {
        target: "directory-player-link",
        title: "Player pages",
        body: "Tap a player's name for their own page: everything on the card, links to their parents and brothers and sisters, and, for the Treasurer and the player's own parents, their payments.",
      },
      {
        target: "directory-requirements",
        title: "Requirements",
        body: "Pick a requirement, like the handbook signature, to see who's **Missing** it. Tap the chip on a player to mark it **Done**, **Paid** or **Waived** and attach a scan.",
        audience: "staff",
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
    id: "registrations",
    sectionId: "registrations",
    title: "New registrations tour",
    route: "/portal/directory/registrations",
    steps: [
      {
        target: "page-title",
        title: "New registrations",
        body: "Registrations from the form, oldest first, waiting for someone to approve them.",
      },
      {
        target: "registration-card",
        title: "Each registration",
        body: "The player, the fee for their age group, how they'll pay, the waiver and uniform answers, and each parent's phone and email. A note means the name is already on the roster.",
      },
      {
        target: "registration-approve",
        title: "Approve",
        body: "Adds the player to the Directory under **No team yet** and puts their fee on the family's Payments account.",
      },
      {
        target: "registration-reject",
        title: "Not this season",
        body: "Takes the registration off the list without adding anyone.",
      },
      {
        target: "registrations-form-link",
        title: "The form",
        body: "Opens the registration form families fill in, so you can copy its link.",
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
      {
        target: "global-search",
        title: "Looking for one?",
        body: "Search from the top bar: playbooks show up with members and Slack messages as you type.",
      },
    ],
  },
  {
    id: "payments",
    sectionId: "payments",
    title: "Payments tour",
    route: "/portal/payments",
    steps: [
      {
        target: "payments-totals",
        title: "The season at a glance",
        body: "What's been charged, taken off, paid, and what's **Still owed** across every family.",
      },
      {
        target: "payments-parents",
        title: "What parents see",
        body: "Off to start with, so you can enter payments first. Switch it **On** and each family sees their own balance under **Payments**.",
      },
      {
        target: "payments-fees",
        title: "Registration fees",
        body: "**Add registration fees** charges each registered player the fee for their tier. Tap it again any time: nobody is charged twice.",
      },
      {
        target: "payments-filter",
        title: "Who owes",
        body: "**Owes** lists the families with money due. **Paid up** and **All** show the rest. The search box finds a family by player, parent or phone.",
      },
      {
        target: "payments-parent-link",
        click: "payments-family",
        title: "Their pages",
        body: "In an open family, a parent's name opens their profile and a player's name opens their player page.",
      },
      {
        target: "payments-actions",
        click: "payments-family",
        title: "One family",
        body: "Tap a family to open it. **Record payment** for a Venmo or check, **Add a charge** for a uniform or tournament, and **Take off an amount** for a player the club covers.",
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
        body: "Everyone outside the club we work with. Coaches see the programs, gyms and referees; the board sees and edits everything.",
      },
      {
        target: "contacts-new",
        title: "New contact",
        body: "Add a **Company** or a **Person**: contact info, account and billing details, notes and tags.",
        audience: "staff",
      },
      {
        target: "contacts-search",
        title: "Search",
        body: "By name, email, phone, account number or type.",
      },
      {
        target: "contacts-filters",
        title: "Filter",
        body: "Show just **Companies**, just **People**, one type of contact, or one tag (**nchc**, **ndii**…).",
      },
      {
        target: "contacts-card",
        title: "Companies and their people",
        body: "Each company shows the people who work there under it, with their role, email and phone. Tap either to open it: a person's page shows **Works at**, their company and everyone else there; at a company, **+ Add person** adds someone.",
      },
      {
        target: "contacts-import",
        title: "Import the spreadsheet",
        body: "Reads the HS planning spreadsheet's Contacts tab: programs, gyms and refs with their people. You see everything before it's saved, and contacts you already have are only filled in.",
        audience: "staff",
      },
      {
        target: "contacts-changes",
        title: "Recent changes",
        body: "Every change to a contact, newest first: who made it, when, and what it said before. Each contact's own **History** can put an earlier version back.",
        audience: "staff",
      },
    ],
  },
  {
    id: "hs-schedule",
    sectionId: "hs-schedule",
    title: "HS Schedule tour",
    route: "/portal/schedule",
    steps: [
      {
        target: "schedule-seasons",
        title: "One season at a time",
        body: "The arrows and the season buttons move between seasons; the earlier ones stay to look back on.",
      },
      {
        target: "schedule-legend",
        title: "The colors",
        body: "As in the spreadsheet: **Tentative**, **Need to secure facility**, **Final details in process** and **Facility secured**. A dashed **3?** isn't settled; an amber dot means a team is on the fence.",
      },
      {
        target: "schedule-grid",
        title: "A row per weekend",
        body: "The dates, where and the trip, the event with the teams coming, a column per team of ours with its games, and the notes.",
      },
      {
        target: "schedule-cell",
        title: "Who's coming",
        body: "Hover over a team's count (tap it on a phone) to see its games and the teams coming, confirmed or on the fence, each linked to its program.",
      },
      {
        target: "schedule-popover",
        click: "schedule-cell",
        title: "The team's card",
        body: "**Coming**, **On the fence** and **Not coming**. **Weekend details** opens the whole weekend.",
      },
      {
        target: "schedule-popover-games",
        click: "schedule-popover-edit",
        title: "Edit right here",
        body: "**−** and **+** set the games; **Not sure yet** marks them unsettled. Everything saves as you go.",
      },
      {
        target: "schedule-popover-add",
        title: "Add a team, or settle one",
        body: "Type a program the way coaches write it (DMW, So Metro) and pick it. Each team gets **Yes**, **Maybe** or **No**, and **All our teams** or just this one.",
      },
      {
        target: "schedule-compare",
        dismiss: "schedule-popover-done",
        title: "Compare with another season",
        body: "Puts that season's same weekend beside each row: what we did a year ago, at a glance.",
      },
      {
        target: "schedule-season-settings",
        title: "Season settings",
        body: "The title, notes and columns (add, rename, reorder or hide one). The board can start next season from this one here.",
      },
      {
        target: "schedule-add-weekend",
        title: "Add a weekend",
        body: "Its dates, event, place, trip, status, notes and facility; then its games and teams.",
      },
      {
        target: "schedule-import",
        title: "Import the spreadsheet",
        body: "Brings in the planning spreadsheet's HS Schedule tabs with its contacts. You see what it found for every weekend first.",
        audience: "staff",
      },
    ],
  },
  {
    id: "settings-members",
    sectionId: "settings-members",
    title: "Members walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tabs",
        audience: "super_admin",
        title: "Settings tabs",
        body: "Members, Teams, Volunteer Roles, Requirements, Playbooks, Sidebar Links, Contact Types and the Audit Log each have their own tab. Tap **ⓘ** on any tab, then **Show me around**, for a walkthrough of that tab.",
      },
      {
        target: "members-status",
        click: "settings-tab-members",
        title: "Pending, Approved, Denied, Not signed up",
        body: "**Pending** is the queue of access requests — the red badge on **Settings** counts them. **Not signed up** lists registered parents who haven't made a login yet; approving one early lets them straight in.",
      },
      {
        target: "members-search",
        title: "Find someone",
        body: "Search by name or email.",
      },
      {
        target: "members-row",
        title: "Each person",
        body: "On **Pending**, **Approve** lets them in and emails them a sign-in link, and **Deny** turns them away. Super-admins also change the **role** here, tap **Edit** to change a profile (or **Revoke login**), and turn on a board member's **Edit** / **Delete** chips for Settings powers, like Requirements.",
      },
      {
        target: "members-add",
        audience: "super_admin",
        title: "Add member",
        body: "Set someone up ahead of time. Leave the email blank for a **directory-only** entry, like a grandparent who won't sign in.",
      },
    ],
  },
  {
    id: "settings-teams",
    sectionId: "settings-teams",
    title: "Teams walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-teams",
        title: "Settings → Teams",
        body: "Set up this season's teams. What you enter here shows on each team's Directory banner and team page.",
      },
      {
        target: "teams-row",
        click: "settings-tab-teams",
        title: "Each team",
        body: "Its division, practice times, location and player count. The **pencil** edits it, the **trash** can deletes it (its players go back to unassigned), and **Staff & volunteers →** opens its page in the Directory to assign coaches and volunteers.",
      },
      {
        target: "teams-add",
        click: "settings-tab-teams",
        title: "New team",
        body: "Starts a team for this season.",
      },
      {
        target: "teams-form",
        click: "teams-add",
        interactive: true,
        title: "The team's details",
        body: "Give it a **Team name** (e.g. Gold), pick an **Age group** and **Team color**, and add the **Division**, **Practice times** and **Practice location**. Separate more than one practice time with a semicolon.",
      },
      {
        target: "teams-save",
        interactive: true,
        title: "Save it",
        body: "Tap **Create team** to save, or **Cancel** to leave things as they are.",
      },
    ],
  },
  {
    id: "settings-volunteer-roles",
    sectionId: "settings-volunteer-roles",
    title: "Volunteer Roles walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-volunteer-roles",
        title: "Settings → Volunteer Roles",
        body: "The jobs every team can fill: coach, team parent, scorekeeper and so on.",
      },
      {
        target: "roles-row",
        click: "settings-tab-volunteer-roles",
        title: "Each role",
        body: "Arrows change the order, **−/+** changes **Spots per team**, and the switches turn **Leadership** and **In Directory** on or off — changes save right away. **Leadership** roles (coaches) can switch the Directory to age groups; **In Directory** shows the role on the team's banner.",
      },
      {
        target: "roles-add",
        click: "settings-tab-volunteer-roles",
        title: "Add role",
        body: "Starts a new job every team can fill.",
      },
      {
        target: "roles-form",
        click: "roles-add",
        interactive: true,
        title: "The role's details",
        body: "Name it, say **What they do** and set **Spots per team**. Pick a **Registration answer** so people who ticked that volunteer option on the registration form are suggested first when you assign it.",
      },
      {
        target: "roles-save",
        interactive: true,
        title: "Save, then assign",
        body: "Tap **Add role** to save. To put someone in a role, open a team's page (Directory → **Team page**) and tap **+ Assign** on an open spot.",
      },
    ],
  },
  {
    id: "settings-playbooks",
    sectionId: "settings-playbooks",
    title: "Playbooks walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-playbooks",
        title: "Settings → Playbooks",
        body: "Keep the playbook categories tidy and see every playbook in one list.",
      },
      {
        target: "playbook-categories-row",
        click: "settings-tab-playbooks",
        title: "Each category",
        body: "A category groups playbooks and sets the colour of their chip. The **pencil** edits it and the **trash** can deletes it.",
      },
      {
        target: "playbook-categories-add",
        click: "settings-tab-playbooks",
        title: "Add category",
        body: "Starts a new category.",
      },
      {
        target: "playbook-categories-form",
        click: "playbook-categories-add",
        interactive: true,
        title: "The category's details",
        body: "Give it a **Name**, a **Chip color** and a **Sort order** (lower numbers come first). The chip previews as you go.",
      },
      {
        target: "playbook-categories-save",
        interactive: true,
        title: "Save it",
        body: "Tap **Add category** to save, or **Cancel**.",
      },
      {
        target: "playbooks-all",
        title: "Every playbook",
        body: "Newest-updated first. Tap one to open it and edit its content; the **trash** can deletes it.",
      },
    ],
  },
  {
    id: "settings-sidebar-links",
    sectionId: "settings-sidebar-links",
    title: "Sidebar Links walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-sidebar-links",
        title: "Settings → Sidebar Links",
        body: "Add your own links to the bottom of everyone's sidebar: the season schedule, a sign-up form, the club store.",
      },
      {
        target: "links-row",
        click: "settings-tab-sidebar-links",
        title: "Each link",
        body: "Arrows change the order, the **pencil** edits a link and the **trash** can removes it.",
      },
      {
        target: "links-add",
        click: "settings-tab-sidebar-links",
        title: "Add link",
        body: "Starts a new link.",
      },
      {
        target: "links-form",
        click: "links-add",
        interactive: true,
        title: "The link",
        body: "Type a **Label** (what people see, like Schedule) and the **Link**: a web address, or a portal page like /portal/docs. **Open in a new browser tab** is ticked to start with, so the portal stays open.",
      },
      {
        target: "links-save",
        interactive: true,
        title: "Save it",
        body: "Tap **Add link**. Every signed-in member sees it in their sidebar.",
      },
    ],
  },
  {
    id: "settings-contact-types",
    sectionId: "settings-contact-types",
    title: "Contact Types walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-contact-categories",
        title: "Settings → Contact Types",
        body: "The types used to group External Contacts: uniforms, photos, facilities, opponents and so on.",
      },
      {
        target: "contact-types-row",
        click: "settings-tab-contact-categories",
        title: "Each type",
        body: "The **pencil** renames it and the **trash** can deletes it. Contacts of that type aren't deleted — they just lose the grouping.",
      },
      {
        target: "contact-types-add",
        click: "settings-tab-contact-categories",
        title: "Add type",
        body: "Starts a new type.",
      },
      {
        target: "contact-types-form",
        click: "contact-types-add",
        interactive: true,
        title: "The type's details",
        body: "Give it a **Name** (e.g. Plumbing) and, if you like, a **Sort order** (lower numbers come first). The **Slug** fills itself in from the name. Tick **Coaches can see** to let the coaches read its contacts.",
      },
      {
        target: "contact-types-save",
        interactive: true,
        title: "Save it",
        body: "Tap **Add type**. It shows up when someone adds an external contact, and as a filter chip on the External Contacts page.",
      },
    ],
  },
  {
    id: "settings-audit-log",
    sectionId: "settings-audit-log",
    title: "Audit Log walkthrough",
    route: "/portal/settings",
    steps: [
      {
        target: "settings-tab-audit-log",
        title: "Settings → Audit Log",
        body: "A record of every change to a member's account: who made it, what changed and when.",
      },
      {
        target: "audit-entry",
        click: "settings-tab-audit-log",
        title: "Each change",
        body: "What happened (a new member, an approval, a role change, a profile edit, a removal), who did it and when, and the fields that changed. The latest 100 are listed, newest first. Nothing here can be edited.",
      },
    ],
  },
  {
    id: "activity",
    sectionId: "activity",
    title: "Activity walkthrough",
    route: "/portal/activity",
    steps: [
      {
        target: "nav-activity",
        sidebar: true,
        title: "Activity",
        body: "Who's using the portal and how: sign-ins, sessions and the pages people open. Only you can see it for now.",
      },
      {
        target: "activity-kpis",
        title: "At a glance",
        body: "Sign-ins this week, how many people were active today and this week, and how many previews there have been this month.",
      },
      {
        target: "activity-daily",
        title: "People each day",
        body: "How many members opened the portal each day for the last 30 days. Hover over or tap a bar for that day's numbers.",
      },
      {
        target: "activity-members",
        title: "Members",
        body: "Everyone with a login, most recently seen first: last sign-in, last seen and the page they were on. Tap a row to see each time they signed in, and every page they opened.",
      },
      {
        target: "activity-search",
        interactive: true,
        title: "Find someone",
        body: "Search by name or email.",
      },
      {
        target: "activity-preview",
        title: "Preview as",
        body: "See the portal exactly as this member does. A yellow bar shows while you're previewing; **Exit preview** takes you back. Anything you change during a preview really happens, as them.",
      },
      {
        target: "activity-previews",
        title: "Every preview, recorded",
        body: "Who previewed whom, when and for how long. Tap one to see the pages opened during it.",
      },
    ],
  },
  {
    id: "requirements",
    sectionId: "player-requirements",
    alsoSections: ["settings-requirements"],
    title: "Requirements walkthrough",
    route: "/portal/settings",
    steps: [
      {
        title: "Collecting handbook signatures, fees and forms",
        body: "Three parts: **set up** a requirement like the handbook signature, **check players off** as it comes in (with a scan), then **see how many are in** and who's still missing. You can fill things in as you go.",
      },
      // Part 1 — Settings → Requirements.
      {
        part: "Set it up",
        target: "settings-tab-requirements",
        title: "Settings → Requirements",
        body: "Everything players have to hand in or pay is listed here. Board members need the **Settings: Edit** chip (a super-admin turns it on in **Settings → Members**).",
      },
      {
        target: "requirements-add",
        click: "settings-tab-requirements",
        title: "Add requirement",
        body: "Starts a new one. The **Handbook signature** may already be listed — tap the **pencil** on it to change it instead.",
      },
      {
        target: "requirement-name",
        click: "requirements-add",
        interactive: true,
        title: "Name",
        body: "What the board sees on each player's chip, like **Handbook signature**. Type it in now if you're adding one.",
      },
      {
        target: "requirement-kind",
        interactive: true,
        title: "Type",
        body: "**Task / form** is marked **Done** — right for a signature. **Fee** is marked **Paid** and asks for an **Amount**.",
      },
      {
        target: "requirement-due",
        interactive: true,
        title: "Due date",
        body: "Optional. A reminder for the board, shown with the requirement.",
      },
      {
        target: "requirement-applies",
        interactive: true,
        title: "Applies to",
        body: "**All players** for the handbook. Pick **Only some teams** for something like one team's tournament fee, then tick the teams.",
      },
      {
        target: "requirement-options",
        interactive: true,
        title: "Scans and Active",
        body: "Leave **Offer scan upload** ticked so you can attach a scan of each signed page. Untick **Active** later to retire it without losing anyone's record.",
      },
      {
        target: "requirement-save",
        interactive: true,
        title: "Save it",
        body: "Tap **Add requirement** to save, or **Cancel** to leave things as they are. Then press **Next** and we'll head to the Directory.",
      },
      // Part 2 — checking players off in the Directory.
      {
        part: "Check players off",
        route: "/portal/directory",
        target: "requirement-chip",
        title: "A chip on every player",
        body: "Each player shows a chip for every requirement that applies to them. Red **Needs Handbook signature** means it's still missing; green with a ✓ means it's in.",
      },
      {
        route: "/portal/directory",
        target: "req-status",
        click: "requirement-chip",
        interactive: true,
        title: "Done, Waived or Not yet",
        body: "Tapping a chip opens this sheet. Pick **Done** (**Paid** for a fee) once you have it, or **Waived** to excuse the player.",
      },
      {
        route: "/portal/directory",
        target: "req-details",
        interactive: true,
        title: "Date and note",
        body: "The date is today to start with. Add a **Note** if it helps — who handed it in, or a check number for a fee.",
      },
      {
        route: "/portal/directory",
        target: "req-scan",
        interactive: true,
        title: "Scan the signed page",
        body: "Tap **Scan with camera** and hold your phone over the signed page. Once the page holds still it takes the picture by itself, straightens it and saves a clean PDF. Or tap **Upload scan** for a photo or PDF you already have (a photo gets straightened too). Only the board can open it. **View scan** opens it later.",
      },
      {
        route: "/portal/directory",
        target: "req-save",
        interactive: true,
        title: "Save",
        body: "Tap **Save** and the chip turns green (with a little page icon when there's a scan). Repeat for each player as signatures come in.",
      },
      // Part 3 — how many are in, how many are left.
      {
        part: "See who's missing",
        route: "/portal/directory",
        target: "directory-requirements",
        dismiss: "req-cancel",
        interactive: true,
        title: "Pick the requirement",
        body: "Choose **Handbook signature** from **All requirements**. The list narrows to the players it applies to.",
      },
      {
        route: "/portal/directory",
        target: "requirement-status",
        pick: "requirement-filter",
        interactive: true,
        title: "Missing, Done, Waived",
        body: "**Missing** shows who still owes it — the number is how many are left. **Done** (or **Paid**) and **Waived** show who's handled, and **All** shows everyone.",
      },
      {
        route: "/portal/directory",
        target: "requirement-summary",
        title: "The running total",
        body: "This line sums it up, like **Handbook signature: 28 of 40 done (2 waived)** — how many are in out of everyone it applies to.",
      },
      {
        route: "/portal/directory",
        target: "directory-teams",
        title: "One team at a time",
        body: "Tap a team to see who's missing on just that team — the counts follow along. Handy for handing a coach their list.",
      },
      {
        route: "/portal/directory",
        title: "That's the whole loop",
        body: "Set it up once, check players off as things come in, and use **Missing** to chase the rest. Requirements start fresh each season with the new roster.",
      },
    ],
  },
  {
    id: "planning",
    sectionId: "planning",
    alsoSections: ["settings-planning-roles"],
    title: "Planning walkthrough",
    route: "/portal/events",
    steps: [
      {
        title: "The board's year, in one place",
        body: "Five parts: the **calendar**, **Review** (choosing this season's tasks), the **Template** they come from, the monthly **board meeting**, and **who holds each role**. Anything that isn't there yet, like a task before you've kept one, is skipped.",
      },
      // Part 1 — the calendar tabs.
      {
        part: "The calendar",
        target: "planning-tabs",
        title: "Planning's tabs",
        body: "**Upcoming** starts with this month, **Past** starts with last month and goes back, and **All** is everything. **Year**, **Review** and **Template** are the board's.",
      },
      {
        target: "planning-month",
        click: "planning-tab-upcoming",
        title: "A month at a time",
        body: "Each month shows its board meeting, its events, and the tasks the board kept for it under **To do**. A practice that repeats is one line, with how many times it meets that month.",
      },
      {
        target: "planning-meeting",
        title: "The month's board meeting",
        body: "Every month has one. Tap it for the date, agenda and minutes. We'll open this month's in part 4.",
      },
      {
        target: "planning-task",
        title: "A task",
        body: "Tap the circle to mark it done, or tap the task to assign it, comment or add to-dos. The book chip opens the playbook that explains how.",
      },
      {
        target: "planning-roles",
        title: "One role at a time",
        body: "Show just the President's tasks, the Athletic Director's, and so on. **Everyone** shows them all again.",
      },
      {
        target: "planning-season",
        click: "planning-tab-year",
        title: "Year",
        body: "One season on a page, August through July. The arrows step back to last season or ahead to the next.",
      },
      {
        target: "planning-year-grid",
        title: "A card per month",
        body: "Each month's meeting, its tasks (with how many are done) and its events. The year-round duties are listed underneath.",
      },
      // Part 2 — keeping or tossing a season's tasks.
      {
        part: "Review a season",
        target: "planning-review-show",
        click: "planning-tab-review",
        title: "Review",
        body: "Each season starts as a copy of the Template. **Needs review** is what's waiting; **Kept** and **Tossed** are what the board decided.",
      },
      {
        target: "planning-review-decide",
        title: "Keep or Toss",
        body: "**Keep** puts a task on the calendar and in Opportunities, assigned to whoever holds its role. **Toss** leaves it out this season. **Back to Review** undoes either.",
      },
      {
        target: "planning-keep-all",
        title: "Keep all",
        body: "Takes a whole month's tasks as they are.",
      },
      {
        target: "planning-season-sender",
        title: "Start a season",
        body: "**Send … to Review** copies every monthly task in the Template into the season you pick. Pressing it again only adds new template items, and never brings back what you tossed.",
      },
      // Part 3 — the yearly template.
      {
        part: "The template",
        target: "planning-template-month",
        click: "planning-tab-template",
        title: "The Template",
        body: "The year month by month: each role's tasks, starting from the President and AD timeline. Changes here shape the next season you send to Review.",
      },
      {
        target: "planning-template-add",
        title: "+ Task",
        body: "Adds a task to a month, or to **Year-round** for duties that run all season.",
      },
      {
        target: "planning-template-edit",
        title: "Edit or remove",
        body: "The pencil changes the title, notes, month, role and **Playbook** link. The trash can removes it. Seasons already sent keep their copy.",
      },
      {
        target: "planning-template-agenda",
        title: "Board meeting topics",
        body: "Standing topics for that month's meeting. **+ Topic** adds one. They become the first draft of the month's agenda.",
      },
      // Part 4 — this month's board meeting (a fixed address for the current month).
      {
        part: "Board meetings",
        route: "/portal/events/meetings/this-month",
        target: "meeting-when",
        title: "This month's board meeting",
        body: "Set the **Meeting date**, and mark it **Held** afterwards, or **No meeting** for a month without one.",
      },
      {
        route: "/portal/events/meetings/this-month",
        target: "meeting-agenda",
        title: "Agenda",
        body: "Drafted from this month's topics in the Template. Edit it freely.",
      },
      {
        route: "/portal/events/meetings/this-month",
        target: "meeting-minutes",
        title: "Minutes",
        body: "Who was there, what was discussed and what was decided.",
      },
      {
        route: "/portal/events/meetings/this-month",
        target: "meeting-task-note",
        title: "A note on each task",
        body: "Tap **+ Add a note from this meeting** under a task. The note also shows on the task's own page, so the decision stays with the task.",
      },
      {
        route: "/portal/events/meetings/this-month",
        target: "meeting-activity",
        title: "Who changed what",
        body: "Who last edited the meeting and when. **History** lists every change with who made it, and can restore an earlier version. If someone else has the meeting open, a chip here says so.",
      },
      {
        route: "/portal/events/meetings/this-month",
        target: "meeting-save",
        title: "Save meeting",
        body: "Saves the date, agenda, minutes and notes together.",
      },
      // Part 5 — Settings → Planning Roles.
      {
        part: "Who holds each role",
        route: "/portal/settings",
        target: "planning-roles-list",
        click: "settings-tab-planning-roles",
        title: "Settings → Planning Roles",
        body: "**Held by** is who has each role this season. When the board keeps a task, it's assigned to that person.",
      },
      {
        route: "/portal/settings",
        target: "planning-roles-add",
        title: "Add role",
        body: "Add another role if you need one. The pencil edits a role, for example when a new President takes over.",
      },
      {
        title: "That's Planning",
        body: "Take this tour again with **Show me around** in the **ⓘ** panel on Planning, or from the **User Guide**.",
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

// The page a step is on.
export function stepRoute(tour: GuideTour, step: TourStep): string {
  return step.route ?? tour.route;
}

// Where part `part` (1 = the first) starts in `steps`, or 0 if there's no such
// part.
export function partStartIndex(steps: TourStep[], part: number): number {
  let n = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].part && ++n === part) return i;
  }
  return 0;
}

// The part the step at `index` belongs to: its number, name and how many
// parts there are. Null for tours (or opening steps) outside any part.
export function partAt(steps: TourStep[], index: number): { number: number; name: string; of: number } | null {
  const of = steps.filter((s) => s.part).length;
  let number = 0;
  let name: string | null = null;
  for (let i = 0; i <= index && i < steps.length; i++) {
    if (steps[i].part) {
      number++;
      name = steps[i].part!;
    }
  }
  return name ? { number, name, of } : null;
}

// The next step after `index` that starts a part, or `steps.length`.
export function nextPartIndex(steps: TourStep[], index: number): number {
  for (let i = index + 1; i < steps.length; i++) if (steps[i].part) return i;
  return steps.length;
}

export const REQUIREMENTS_TOUR_ID = "requirements";
export const PLANNING_TOUR_ID = "planning";

// The tour for a guide section, if it has one this viewer can take.
export function tourForSection(sectionId: string, viewer: GuideViewer | null | undefined): GuideTour | null {
  const tour = GUIDE_TOURS.find((t) => t.sectionId === sectionId || t.alsoSections?.includes(sectionId));
  return tour && canSeeTour(tour, viewer) ? tour : null;
}

// The "Show me around" tour for a page: the tour of the page's "i" section,
// when the tour runs on this very page (a tour of the channel list is no use
// inside a channel).
// `sectionId`: the open view's section on a page with views of its own (a
// Settings tab), as for guideSectionForPage.
export function tourForPath(
  pathname: string,
  viewer: GuideViewer | null | undefined,
  sectionId?: string | null
): GuideTour | null {
  const section = guideSectionForPage(pathname, viewer, sectionId);
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
