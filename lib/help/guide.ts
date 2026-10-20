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
// same change, and bumps GUIDE_UPDATED. Sections follow the sidebar (Directory,
// HS Schedule, External Contacts, Playbooks, Archives, Activity, then Settings with
// its sections in the order of its tabs), each page's how-to beside it. tests/unit/help-guide.test.ts fails
// when a portal page has no section. The guided tours in ./tours.ts retell
// sections step by step, pointed at the real buttons — keep them in step too.
//
// Written for parents, players' families and the board — plain, friendly, no
// jargon. Bodies are markdown (rendered by MarkdownView). Safe to import from
// client components.

import type { MemberRole, MemberStatus } from "../auth/permissions";

// Who a section is for. "staff" = board members and super-admins; "coaches" =
// the coaches (a leadership volunteer role on a team) and the board;
// "finance" = anyone with the Payments grant; "registrations" = anyone with
// the Registrations grant; "travel" = anyone with the Travel grant (the
// travel coordinator); "messaging" = the board, the Registrations grant, and
// Travel, who can email families from the Directory; "slack" = anyone with
// the Slack DMs grant or Travel; "website" = board members with the Website
// grant. Super-admins always have all of them. The guide hides a section
// from anyone it doesn't apply to.
export type GuideAudience = "everyone" | "coaches" | "staff" | "finance" | "registrations" | "travel" | "messaging" | "slack" | "website" | "super_admin";

export interface GuideSection {
  id: string; // anchor: #help-<id>
  title: string;
  // The heading it's listed under in the guide's Contents: the sidebar item
  // it belongs to ("Directory", "Settings"), or "Getting started".
  group: string;
  audience: GuideAudience;
  // Extra words for the guide's search box (the title and body are searched too).
  keywords: string[];
  // Portal pages this section is the "i" help for. A page uses the section
  // with the longest matching route (exact, or a parent of the path).
  routes?: string[];
  // A feature still in staged rollout (lib/auth/feature-preview.ts): the
  // section shows only to the accounts that can use it, on top of `audience`.
  preview?: boolean;
  // A permission (lib/auth/access.ts) whose holders read this section too,
  // whatever `audience` says: the help for a Board power given to someone
  // who isn't Board (0123).
  permission?: string;
  // Extra permission keys that also reveal this section, e.g. Game film
  // (manage) includes view.
  alsoPermissions?: string[];
  body: string;
}

// The slice of the viewer the guide needs. Both the server Viewer and the
// sidebar's SidebarViewer fit.
export interface GuideViewer {
  role: MemberRole;
  status: MemberStatus;
  isStaff: boolean;
  // On the staged-rollout list: also sees `preview` sections.
  seesFullUi?: boolean;
  // Holds the Payments grant: sees the "finance" sections.
  canManageFinances?: boolean;
  // Holds the Registrations grant: sees the "registrations" sections.
  canManageRegistrations?: boolean;
  // A coach: sees the "coaches" sections (the board always does).
  isCoach?: boolean;
  // Holds the Travel grant: sees the "travel" sections.
  canManageTravel?: boolean;
  // Holds the Slack DMs grant: sees the "slack" sections.
  canSlackDm?: boolean;
  // Holds the Website grant: sees the "website" sections.
  canManageWebsite?: boolean;
  // Every permission they hold (0122): sees the sections naming one.
  permissions?: string[];
  // Live invoicing: Planning Roles President/AD/Treasurer, super_admin, or the invoicing key.
  canManageInvoicing?: boolean;
}

export const GUIDE_UPDATED = "October 20, 2026";

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-in",
    title: "Signing in",
    group: "Getting started",
    audience: "everyone",
    keywords: ["login", "log in", "sign in", "password", "forgot", "reset", "code", "slack", "register", "request access", "pending", "approved", "denied", "account", "phone", "QR", "pair"],
    body: `The member portal is for Omaha Lightning families, coaches and the board. Use the **Login** button at the top of the club website (or the **Login** link at the bottom), or go straight to the login page.

**Three ways to sign in**

- **Continue with Slack** — the quickest. If you're in the club's Slack workspace, this gets you in right away, even if you're new.
- **Email and password** — the account you created when you requested access.
- **Email me a sign-in code** — no password needed. Enter your email, we email you a code, type it in and you're in. (If the email shows a sign-in button instead of a code, tapping the button works too.) Codes only work for email addresses that already have an account.

**Sign in with phone** is an extra button on the login page for a screen that can't type easily (a car browser). It shows a QR code and a short code like **WDJB-MJHT**. Scan the QR with your phone. If you're not signed in there, you'll see the login page first — **Continue with Slack**, email and password, or **Email me a sign-in code** (including the button in the email) all bring you back to the approve page, not the portal. Pick the matching code, then tap **Approve** or **Deny**. After **Approve**, the other screen signs in by itself. Only an allowlisted account can approve (Jeff, unless Settings change that). Slack, email and password still work the same for everyone.

**Forgot your password?** Tap **Forgot password?** next to the Password label. We'll email you a code; type it in, then choose a new password (at least 8 characters).

**New here?** Tap **Request access**, then either use **Continue with Slack** or fill in your name, email and a password. If you're asked to confirm your email, click the link we send you. If the club has already set up an account for your email, we email you a code to confirm it's you. Type it in and you're in, with the password you just chose.

**Waiting for approval.** Unless you came in through the club's Slack, someone from the club reviews each new request. Until then you'll see **Request submitted** when you try to sign in. You'll get an email ("You're in — Omaha Lightning member portal") as soon as you're approved. If you see **Access not granted** and think it's a mistake, use the club's Contact page.

**Registered a player?** If your email is on a player registration, your account is already set up for you — request access with that same email and you'll be linked to your family.`,
  },
  {
    id: "getting-around",
    title: "Getting around",
    group: "Getting started",
    audience: "everyone",
    // A sidebar link that opens inside the portal.
    routes: ["/portal/links"],
    keywords: ["navigation", "menu", "sidebar", "links", "schedule", "new tab", "inside the portal", "frame", "collapse", "mobile", "phone", "ipad", "tablet", "home", "search", "info", "help", "sign out", "log out", "shortcut", "command k", "ctrl k", "scroll", "back to top", "jump to top", "tour", "walkthrough", "show me around", "take the tour", "dropdown", "drop down", "pick list", "autocomplete", "space bar"],
    body: `**Home is the Directory.** After you sign in you land on the Directory of players and parents.

**The sidebar** on the left has everything you can use — you only see the parts that apply to you:

- **Directory** — players, parents, teams, coaches and volunteers.
- **Playbooks** — how-to guides and step-by-step checklists.
- **Film** — game videos families uploaded from their phones. It appears if you have the **Game film** permission.
- **Payments** — what you owe for the season and what you've paid. It appears once the Treasurer has your family's balance ready.
- **Archives** — past Slack messages and photos, and (for the board) emails copied in so you don't need Jeff's Gmail.
- **User Guide** — this page, near the bottom of the sidebar.
- **Notifications** — turn on notifications for your phone or computer (see **Notifications** below).
- **Sign out** — at the very bottom.

Coaches and board members also see the **HS Schedule** and **External Contacts** (the travel coordinator does too), and board members **Settings**, just below **User Guide**.

Below a thin line you may see extra links the club has added, like **Schedule**. Some open in a new browser tab, so the portal stays open where you left it. Others open right inside the portal, with the sidebar still there. If one of those doesn't look right, tap **Open in a new tab** in its bottom left corner.

On a computer with a wide screen, **Collapse** (bottom of the sidebar) shrinks it to icons, and the arrow button in the same spot opens it again. On an iPad, a tablet, or a narrower window, the sidebar starts out collapsed so the page has more room. If you expand it, it stays open for this visit — a refresh starts collapsed again on those screens. If the sidebar is taller than the window, scroll it to reach the buttons at the bottom. On a phone, tap the **menu** button at the top left to open it.

**Search.** The search box at the top of every page finds members, playbooks and Slack messages (and, for coaches and the board, external contacts). Press **⌘K** on a Mac or **Ctrl K** on Windows to jump to it from anywhere. Type at least 2 letters, use the arrow keys and **Enter** to open a result, and **Esc** to close. Tap the **×** inside the box to clear what you typed and start over. Your last few searches are remembered under **Recent**. To find a *player*, use the search box on the Directory page instead. That one, and the other search boxes on a page, have the same **×**.

**Dropdowns.** Every dropdown works the same way. Start typing to narrow the list to what matches, or press the space bar (or the down arrow, or click it) to see the whole list. Move with the arrow keys and press **Enter** or **Tab** to pick, or click one. **Esc** closes the list without changing anything. On a phone, tap a dropdown to see the list and tap your choice. On a long list you can also type a few letters to narrow it down.

**Back to the top.** On a long page, once you scroll down a yellow round button with an up arrow appears in the bottom right corner. Tap it to jump back to the top of the page.

**Help on every page.** Tap the **ⓘ** button in the top bar to read about the page you're on, then **Open the User Guide** for the full guide. Some form fields also have a small **ⓘ** next to their label — hover or tap it for a quick tip.

**Guided tours.** A tour walks you around step by step, pointing at each button and explaining what it does. Press **Next** and **Back** (or the ← and → keys) to move along, and **Skip tour** or **Esc** to stop. Start the welcome tour any time with **Take the tour** at the top of this guide (if your account is new, it starts by itself the first time you open the portal). For a tour of just one page, tap **ⓘ** on that page and then **Show me around** (in Settings, it's for the tab you're on), or press **Show me around** next to a section's title below.`,
  },
  {
    id: "install-app",
    title: "Install the portal as an app",
    group: "Getting started",
    audience: "everyone",
    keywords: ["install", "app", "home screen", "dock", "add to home screen", "add to dock", "iphone", "ipad", "android", "chrome", "safari", "edge", "pwa", "icon", "shortcut", "desktop"],
    body: `You can put the portal on your phone's home screen or your computer's dock, so it opens in its own window like any other app, straight to the portal. It shows up as **OLB - Portal**.

- **iPhone or iPad (Safari):** tap the **Share** button, then **Add to Home Screen**, then **Add**.
- **Android (Chrome):** tap the **⋮** menu, then **Add to Home screen** (or **Install app**), then **Install**.
- **Mac (Safari):** choose **File** → **Add to Dock**, then **Add**.
- **Computer (Chrome or Edge):** click the install icon at the right end of the address bar, or open the **⋮** menu and choose **Cast, save, and share** → **Install page as app**.

**Sign in once inside the app.** On an iPhone or iPad the app doesn't share your sign-in with Safari, so you'll sign in again the first time you open it. **Email and password** or typing in an emailed sign-in code works best there.

Links to other websites open in a small browser window on top of the app. Close it to get back to the portal.`,
  },
  {
    id: "notifications",
    title: "Notifications",
    group: "Getting started",
    audience: "everyone",
    keywords: ["notifications", "notify", "push", "alert", "alerts", "bell", "phone", "badge", "turn on", "turn off", "test", "blocked", "iphone", "android"],
    body: `The portal can send a notification to your phone or computer when something needs you. You still get the emails too.

**What you'll hear about**

- An answer on a request you made.
- A new task in an area your team looks after.
- For super-admins: every new task, new access requests, and supplies running low.
- For super-admins and anyone with the **Registrations** permission: each new registration from the website.

**Turn them on.** Tap **Notifications** near the bottom of the sidebar, then **Turn on notifications**, and say **Allow** when your browser asks. Tap **Send a test** to make sure it works. Do this on each phone or computer you want notifications on.

**On an iPhone or iPad**, notifications only work from the app on your Home Screen. Add it first (see **Install the portal as an app** above), open it from the Home Screen, then turn notifications on there.

**Turn them off** with **Turn off** in the same place. Signing out also turns them off on that device, so a shared phone or computer doesn't keep getting yours.

**Blocked?** If you said no when your browser asked, it won't ask again. Allow notifications for the site in your browser or phone settings, then come back and tap **Turn on notifications**.`,
  },
  {
    id: "ask-a-question",
    title: "Asking a question (Search page)",
    group: "Getting started",
    audience: "everyone",
    keywords: ["search", "ask", "question", "ai", "answer", "find", "sources", "portal search", "follow-up", "assistant", "log", "meaning"],
    routes: ["/portal/search"],
    body: `The Search page answers questions about the club in plain words. It isn't in the sidebar: type **/portal/search** after the portal's web address to open it.

**Ask anything.** Type a question in the big box, like "When is our next game?", and press **Enter** or the arrow button. You can also tap one of the suggested questions or a **Popular topics** card. It looks for what you mean, not just your exact words: asking about "jerseys" also finds a playbook that only says "uniforms".

**It knows who's asking.** The assistant knows your name, your role, and your children's teams, so "When does my son's team practice?" works.

**Watch it look things up.** While it works, lines like *Searching for "uniforms"* or *Checking the calendar* show where it's looking. Once the answer is ready they fold into **Looked in 3 places**; tap that to see them again.

**AI answer.** The answer is written only from records you can already open in the portal: members, teams, the calendar, playbooks, tasks, Slack messages (and, for the board, external contacts and the high school schedule). The small numbers in the answer, and the cards under **Sources**, open the record each fact came from. AI can make mistakes, so open the source before you act on it.

**It may ask you first.** If your question could mean different things, like which team, it asks, with buttons to tap for the answer.

**Follow-ups.** Under the answer, **Ask a follow-up** keeps the conversation going ("What about Thursday?"). To start fresh, use **Start a new search** at the top, or **Search home**.

**In the portal.** Below the answer is every record that matched your question. Tap a type, like **Playbooks**, to show only those, or **All** to see everything again.

**Your questions are logged.** Each question, and which records the answer used, is saved so the club can see what people look for and improve the answers. Only super-admins can read the log.

To share a search, copy the page's address: it includes your first question. Whoever opens it only sees what their own account allows.`,
  },
  {
    id: "search-log",
    title: "Search log",
    group: "Getting started",
    audience: "super_admin",
    keywords: ["search log", "questions", "asked", "unanswered", "couldn't answer", "gaps", "ai cost", "tokens", "log"],
    routes: ["/portal/search/log"],
    body: `Every question asked on the Search page, and what became of it. Open it from the **Search log** link under **Popular topics** on the Search page, or go to **/portal/search/log**. Only super-admins can see it.

**At the top:** how many questions were asked and by how many people, how many got an answer with sources, how many it **Couldn't answer**, the estimated AI cost, and how long answers take. Choose **7 days**, **30 days** or **90 days**.

**Questions it couldn't answer.** These are the gaps: nothing the person could see in the portal answered them. A playbook, an event or an updated record usually fixes one. Tap a question to ask it again once you've added the answer.

**Questions.** The full list, newest first. Use **All**, **Couldn't answer**, **Asked which one** or **Errors & limits** to narrow it, or type in the box to find a question or a person. Tap a question to see the lookups it made, the records its answer cited, how long it took and what it cost, and **Ask it again**.

The cost is an estimate from the AI's token counts. It doesn't include the small cost of searching by meaning.`,
  },
  {
    id: "planning",
    title: "Planning",
    group: "Planning",
    audience: "staff",
    keywords: ["planning", "events", "calendar", "timeline", "responsibilities", "president", "athletic director", "ad", "treasurer", "communications", "coaches", "template", "review", "keep", "toss", "season", "year", "board meeting", "minutes", "agenda", "playbook"],
    routes: ["/portal/events"],
    body: `Planning is the board's year as a calendar: the events, a board meeting every month, and the tasks each role takes care of, built from a template the board reuses every season. A season runs August through July.

The tabs across the top are **Calendar**, **Year**, **Review** and **Template**. Everyone else sees just the calendar.

**Calendar.** The drop-down above it picks the months: **Upcoming** starts with this month and runs through the end of the season, **Past** starts with last month and goes back, and **All months** is everything, oldest first (**Jump to this month** takes you to today). Each month shows its **Board meeting**, its events (a repeating event, like practice, is one line with how many times it meets that month) and its tasks under **To do**. Tap the circle beside a task to mark it done, or tap the task to assign it, comment or add to-dos. The book chip on a task opens the playbook that explains how. Pick **President**, **Athletic Director** or another role in the **All roles** drop-down to see one role's tasks (on Year, Review and Template too).

**Year.** One season on a page, a card per month, plus the year-round duties. Use the arrows beside the season's name to step back to last season or ahead to the next.

**Review.** Each season starts as a copy of the template. Press **Send 2026–27 to Review** (the season you pick) and every monthly task in the template lands in **Needs review**. Press **Keep** for what the board will do this season and **Toss** for what it won't, or **Keep all** for a month you take as it is. The season drop-down at the top switches which season you're reviewing. Kept tasks go on the calendar, into Opportunities, and to whoever holds the role (Settings → Planning Roles). Changed your mind? **Kept** and **Tossed** list them, with **Back to Review**. Pressing the button again for a season only adds template items it doesn't have yet, and never brings back what you tossed.

**Template.** The year month by month: each role's tasks and each month's board meeting topics. **+ Task** and **+ Topic** add one; the pencil edits it (title, notes, month, role, and a **Playbook** to link) and the trash can removes it. Changes shape the next season you send to Review, not the ones already sent.

**Board meetings.** Tap a month's **Board meeting** to open it. Set the **Meeting date** and whether it's **Planned**, **Held** or **No meeting**, edit the **Agenda** (the first draft comes from that month's topics in the template) and write the **Minutes**. Below are the month's tasks, and any from earlier in the season that aren't done, each with **+ Add a note from this meeting**, so what the board decided stays with the task and shows on its page. Press **Save meeting** when you're done.

**More than one of you at once.** Anyone on the board can open a meeting at the same time. A yellow chip at the top says who else is there (and whether they're editing). When someone saves, what they changed comes into your page; if you have unsaved changes, **Load their changes** brings them in without losing yours. Changes to different parts (say, you write the minutes while someone adds a task note) simply combine. If you both changed the same part, a red box shows their version: pick **Use theirs** or **Keep mine**, then save. Nothing is ever overwritten without someone choosing.

**Who changed what.** The top of each meeting says who last edited it and when, and each task note says who wrote it. **History** lists every change, newest first, with who made it and what changed (added lines in green, removed ones crossed out). Open a version with **See the whole meeting as of this version**, and **Restore this version** puts the date, status, agenda and minutes back to how they were; the restore is saved as a new change, so it can be undone too.

**Walk me through it.** For a guided tour of all of this, press **Show me around** next to this section's title, or tap **ⓘ** on Planning and then **Show me around**.`,
  },
  {
    id: "directory",
    title: "Directory",
    group: "Directory",
    audience: "everyone",
    routes: ["/portal/directory"],
    keywords: ["players", "parents", "roster", "team", "age group", "10U", "12U", "14U", "16U", "18U", "phone", "email", "address", "contact info", "jersey", "profile", "family", "search", "coaches & volunteers", "volunteers", "open spot", "scorekeeper", "clock", "photographer", "eligible", "ages out", "swing up", "play up", "birthday", "season end"],
    body: `This season's players and their parents, grouped by team.

- **Search** by player, parent, email or phone number (type 3 or more digits to match a phone).
- Pick a team from the **All teams** drop-down to show just that team. You'll see the team's division, practice times and location, and who's coaching and helping out. **All teams** shows everyone; **No team yet** shows players who haven't been placed. The number next to each team is how many players are on it.
- Coaches, other team leaders and board members can switch between **By team** and **By age group** (10U–18U), then pick one from the **All ages** drop-down.
- Each player shows their jersey number, team, address, and their parents' phone and email. A player's own email shows too, unless it's the same as a parent's. A **New** chip means it's their first season with us.
- **For the board.** Each player also shows their age and birthday, the lowest level they're eligible for through the **Season end date**, and an **Ages out** chip when they're rostered on a level they age out of (for example **Ages out 10/25/26**). Pick a team from **Available to swing up** to list younger players who can play up to that team, and older players still age-eligible to move down, with age at season end and current team. Tick **Hide if their team plays the same weekend** to drop anyone whose own team already has a game that weekend on the HS Schedule. Age caps live in **Settings → Season**.
- Tap an address and pick **Apple Maps** or **Google Maps** to get directions.
- Tap a player's name to open their player page, a parent's name to open their profile, and **Team page ›** to open a team's full page.

**Who's listed.** Players appear when their family said yes to being in the directory on the registration form. If your family said no, you still see your own players, marked **Not in directory**; other families don't.

**Public directory.** The same players and parents are also on a read-only page on the club website that opens without signing in, for anyone given its private link. Only people with the link can find it, and super-admins manage the link in **Settings → Public Directory**. It lists only families who said yes to the directory, shows no fees or payment details, and can be grouped **Alphabetical** (the default), **By city**, **By team**, **By age group** or **Coaches & Volunteers**. Each group's heading says how many players are in it, like **B · 4 players**. Once you scroll down, the yellow arrow in the bottom-right corner takes you back to the top. It shows each player's age (not their birthday) and their city and ZIP code (not their street address).

Under **By team**, each team's coaches are listed above the players, with their phone and email. **Volunteers** under them stays closed until you tap it (tap again to close it). The closed row names who already has a job, and how many are still open. Open it for scorekeeper, clock, photographer and any other job the club adds later. A job with nobody in it says **Open Spot**. A filled one shows the person's name, phone and email. **Coaches & Volunteers** shows the same list for every team, with **Volunteers** closed the same way. The registration form does not show who has these jobs. It only asks whether you can help, and the board assigns the spots.

**Profiles.** A member's profile shows their photo, phone, email, birthday and address (tap it for **Apple Maps** or **Google Maps**), plus their players and family. Your own profile has **✎ Edit profile** — see *Your profile* below.`,
  },
  {
    id: "team-pages",
    title: "Team pages",
    group: "Directory",
    audience: "everyone",
    routes: ["/portal/directory/teams"],
    keywords: ["team", "coach", "volunteer", "team parent", "scorekeeper", "roster", "jersey", "practice", "staff", "open spot"],
    body: `Everything about one team in one place. Open it from **Team page** on the Directory.

- **The header** shows the team's division, name, practice times and location, how many players it has, and how many volunteer spots are filled.
- **Staff & volunteers** lists every job the team needs — coach, team parent, scorekeeper and so on — with the person doing it and their phone and email, or **Open spot** if nobody's signed up yet. **Leadership** marks the roles that lead the team.
- **Roster** lists the players in jersey-number order, with their parents.

Want to fill an open spot? Let the club know and the board will add you.`,
  },
  {
    id: "player-pages",
    title: "Player pages",
    group: "Directory",
    audience: "everyone",
    routes: ["/portal/directory/players"],
    keywords: ["player", "player page", "kid", "child", "son", "siblings", "brother", "sister", "parents", "mom", "dad", "balance", "payments", "fees", "eligible", "ages out", "birthday"],
    body: `Everything about one player in one place. Open it by tapping a player's name in the Directory, on a team page, on a parent's profile, or on the Finances page.

- **The top** shows their jersey number, team (tap it to open the team page), address, and the player's own phone and email (their email is left off when it's the same as a parent's, since it shows with that parent). A **New** chip means it's their first season with us. Tap the address to open it in **Apple Maps** or **Google Maps**. The board also sees their age and birthday, the lowest level they're eligible for through the season end date, and **Ages out** when they're rostered on a level they age out of.
- **Parents** lists each parent with their phone and email. Tap a parent's name to open their profile. **Siblings** links to their brothers' and sisters' pages.
- **Payments** shows what the family owes and has paid, with each charge and payment. You see it for your own kids once the Treasurer has opened balances to families, and the Treasurer sees it for everyone.

**For the board.** The top also shows the registration fee, how the family said they'd pay, shirt size and waiver, plus a chip for each requirement. Tap a chip to check it off, the same as in the Directory.

**For the Treasurer.** **Record payment**, **Add a charge** and **Take off an amount** work right on the player page, for the whole family. **Open in Finances ›** jumps to the family on the Finances page.

**Notes** and **Messages sent** are the whole family's: a note or email from a brother's or sister's page shows here too, marked with who it was about.`,
  },
  {
    id: "registrations",
    title: "New registrations and teams",
    group: "Directory",
    audience: "registrations",
    routes: ["/portal/directory/registrations"],
    keywords: ["registration", "registrations", "register", "sign up", "approve", "waitlist", "wait list", "not this season", "contacted", "message", "email families", "recipients", "dad", "mom", "player email", "spreadsheet", "csv", "new player", "team", "place", "put on a team", "no team yet", "roster", "edit player", "remove player", "take off the roster", "remove from team", "withdrawn", "removed", "new", "jersey", "age group", "birthday", "registration form", "cognito", "code", "email confirmed", "wizard", "commitments", "football", "debate", "attendance"],
    body: `You see this if you have the **Registrations** permission (a super-admin turns it on in Settings → Members).

**New registrations.** The **Registrations** button at the top of the Directory opens registrations from the form any time, with how many are new and on the waitlist. When some are new, a yellow bar also says how many; tap **Review registrations** to see them. The page has four tabs: **New** (to review, oldest first), **Waitlist**, **Approved** and **Removed**. Each registration shows the player, the fee for their age group, how the family said they'd pay, the waiver, the homeschool answer, whether they need a uniform, and each parent's phone, email and what they can help with. After the homeschool question, the form asks if the player has other commitments this season (football, debate, another sport or activity). **Yes** shows a **Commitments** chip on the list and on the card. The card (the player's registration detail) shows **Yes** and the optional note they wrote about conflicting days and times, or **No details given.** if they left it blank. **No** shows **None** on the card and does not show a flag on the list. After **Approve**, tap the player's name to open their page: the same **Yes** plus note, or **None**, is at the top. Only people with the **Registrations** permission see the list, the card, or the answer on the player page.

- **Approve** adds the player to the Directory under **No team yet** and puts their registration fee on the family's Payments account. Their parents are set up so they can sign in with the email on the form.
- **Waitlist** keeps a family you can't place yet. Add a note on why if you like ("14u is full"); families don't see it. Nothing is added to the Directory or Payments.
- A note on a registration means the player's name is already on the roster. **Already on the roster** means Approve updates that player instead of adding a second one. If the birthdays don't match, Approve adds a second player, so check the birthday first and fix it on their player page if it's the same child.
- **Open the registration form ›** opens the form families fill in, so you can copy its link to send out.
- The form starts with the family's email and emails them a 6-digit code. Once they type it in, it fills in what we already know about any players on that email (names, birthdays, address and parents), so returning families just check it over. Brothers and sisters are registered together, and each one arrives here as their own registration. **Email confirmed** on a registration means the family typed the code back. When a family sends the form, whoever filled it in gets a receipt by email (their players, the fees, how to pay by Venmo or check, and what happens next), and the club's Gmail gets a **New registration** email with the details and a link to review it. A copy of the receipt is kept on the registration, and on the player's page under **Messages sent** (from the registration form) once it's approved. **Send receipt** on a registration sends it again: it starts addressed to whoever registered, or type another address to send yourself a test (a test isn't kept).

**The waitlist.** The **Waitlist** tab lists those families in the order they registered, with who put them there, when, and the note (**Edit note** changes it).

- **Message everyone** writes one email to every family on the waitlist; **Send a message** on a registration writes to just that family. Pick who it goes to: for one family, tick **Dad**, **Mom** and the **Player** (when they have their own email); for everyone, tick **Dads**, **Moms** and **Players**, then tick the families themselves (every family is ticked to start; **Select all / none** ticks every family or none). It's sent from the club's email address, one email per family (brothers and sisters get one between them), and replies go to the club's Gmail. For one family the player's name is already in the message; for everyone, **{player}** becomes each family's player names, and a preview shows how it reads. The message starts from the board's **Waitlist: teams are full** template (change its words in Settings → Email Templates), and **Template** swaps in any other. A copy is kept on the registration under **Messages sent**.
- **Contacted** marks that someone has reached out, with the date and who, so two people don't both call. Sending a message ticks it for you.
- **Email from my app** opens your own email app addressed to the parents instead. **Copy all emails** copies every parent's email to paste into Bcc, and **Download spreadsheet** saves the waitlist as a file for Excel or Google Sheets.
- The Directory has the same thing for players already on the roster: see *Emailing families*.
- When a spot opens, **Approve** works right from the waitlist. **Move back to New** puts a registration back in the review queue, and **Remove** moves it to the **Removed** tab (for a test, or a family that withdrew).

**Approved** lists every registration that's been approved, newest first, with who approved it and when. Tap a name to open the player's page.

**Removed** keeps families who withdrew or were taken off the roster, newest first, with who removed them, when, why, and the team they were on. Nothing is ever deleted: **Approve** puts them back under **No team yet**, and **Move to the waitlist** puts them on the Waitlist.

**Putting players on teams.** In the Directory, every player has a team chip showing their team (or **No team yet**). Tap it and pick a team, and the player moves there right away. Pick **No team yet** to take them off their team. Pick **No team yet** from the **All teams** drop-down at the top to see who still needs a team.

**Editing a player.** On a player's page, the team chip works the same way, and **Edit player** changes their **Name**, **Birthday**, **Jersey number**, **Age group**, and the player's own **Email** and **Phone**. Leave Email or Phone empty to clear it. A parent's email and phone show with the parent, not here. Tap **Save**.

**Taking a player off their team.** For a family that lost their spot, or a player who isn't in the program this season. On the player's page, tap **Edit player**, then **Remove from team…**, and pick where they go:

- **Waitlist**: they lost their spot (they didn't show, or stopped answering). They show on the **Waitlist** tab and can be approved again when a spot opens.
- **Withdrawn**: they aren't playing this season. They show on the **Removed** tab.

Add a line on why if you like, and tap **Move to the waitlist** or **Mark withdrawn**. They leave their team and the Directory, with "Taken off the roster" and the team they were on. Their notes and the emails sent to them go with them, and what they owe on Payments comes off. If the family has already paid something, the Treasurer refunds it and voids the payment first (the **Void** button is on the player's Payments card). Log what happened in the player's **Notes** first (see *Notes on players*). To find them later, pick **On the waitlist** or **Removed** from the **All teams** drop-down in the Directory.`,
  },
  {
    id: "registration-workflow",
    title: "The registration workflow",
    group: "Directory",
    audience: "registrations",
    preview: true,
    keywords: ["onboarding", "workflow", "checklist", "family checklist", "offer", "offer a spot", "waitlist form", "join the waitlist", "coach thumbs up", "clinic", "announce teams", "waiting for you", "ask me first", "gone quiet", "slack", "handbook", "uniform sizes"],
    body: `The registration workflow takes the follow-up off your plate: the waitlist form, spot offers, each family's checklist and the reminder emails. It runs only while it's switched on in **Settings → Registration Automations**. Switched off, registration works the way it always has.

**The waitlist form.** New families join at **/waitlist** on the website. It asks his name and birthday, whether he's homeschooled, whether he's played before, friends on Lightning and how they heard about us. They land on the **Waitlist** tab with their answers on the card.

**Offer a spot.** On a waitlist card, tick **Seen at a clinic** and **Coach 👍** as you learn about the player. When a spot opens, tap **Offer a spot**, read the email over (change anything you like, but keep {link}), and tap **Send the offer**. The family gets a private link that opens the registration form with their son filled in. It's good for the number of days set in Settings. **+3 days** gives them longer and **Take back** stops the link. If it runs out, you get a notification and the family gets a kind close-out (when that email is on).

**The registration form.** While the workflow is on, the form also asks each player's uniform sizes (from Settings → Uniforms) and has each player and a parent sign the handbook. Approving the registration checks off **Handbook signature** for you.

**The family checklist.** Every family gets a private checklist page: their spot, the handbook, the fee with a Venmo button, Slack, uniform sizes, the parent meeting and their team. Each automatic email links to it, and it updates itself as the Treasurer records payments and families join Slack.

**The Onboarding tab** shows every family from **Waitlist** to **Offered**, **Registered**, **Ready** and **On a team**. On each family, **$ H S U** turn green as the fee is paid, the handbook is signed, they join Slack and their uniform sizes are in. **Gone quiet** lists anyone you haven't heard from in two weeks. On a phone, the stages show as buttons across the top, each with how many families are in it. Tap one to see those families. It opens on the first stage that has anyone in it.

- **Waiting for you** lists emails set to **Ask me first**. Tap one to read it, **Change the words** if you like, then **Send** or **Skip**. **Send all** sends every one as it is.
- **Announce teams** emails each family whose players are all on a team: their team, coach and practice times (when **Your team** is on).`,
  },
  {
    id: "uniforms-page",
    title: "Uniforms",
    group: "Directory",
    audience: "registrations",
    permission: "uniforms",
    preview: true,
    routes: ["/portal/directory/uniforms"],
    keywords: ["uniforms", "jersey", "jerseys", "shorts", "grays", "warm-ups", "sizes", "try-on", "order", "vendor", "order sheet"],
    body: `For whoever runs uniforms (the **Uniforms** permission) and people with **Registrations**. Open it from the Onboarding tab or Settings → Uniforms.

- The table counts how many of each size of each item families picked on the registration form.
- **Players** lists everyone on the roster with their sizes. Change one at try-on and it's marked confirmed ✓. A red box means they need a size and don't have one; **Missing a size** shows just those players.
- **Download order sheet** saves every item, size and player as a spreadsheet for the vendor.
- **Mark ordered and add charges** puts each sized item's price on the family's Payments account, once. Items with no price yet aren't charged.`,
  },
  {
    id: "player-notes",
    title: "Notes on players",
    group: "Directory",
    audience: "messaging",
    keywords: ["notes", "note", "log", "history", "document", "record", "screenshot", "screenshots", "attachment", "attach", "file", "pdf", "photo", "text messages", "texts", "link", "slack archive", "save to notes", "thread", "no show", "no-show"],
    body: `You see this if you're on the board or have the **Registrations** permission. Families never see notes.

In the Directory, a player with notes has a **1 note** (or **2 notes**…) chip by their name; tap it to open them. Every player's page has a **Notes** card: a running log of what happened with the family, newest first, with who wrote each note and when. Brothers and sisters (players who share a parent) show each other's notes too, marked **about Brecken** (or whoever it was written on), so every page in the family tells the same story. While a player is off the roster, the same notes show on their registration on the **New**, **Waitlist** and **Removed** tabs, and they follow the player back onto the roster when they're approved.

- Tap **Add a note**, write what happened, and tap **Save note**.
- **Attach screenshots or files** adds pictures or PDFs (up to 10 per note, 10 MB each), such as screenshots of a text exchange. You can also paste a screenshot straight into the note, or drag files onto it. iPhone photos are turned into regular pictures so everyone can open them. Tap a picture or file on a saved note to open it.
- **From Slack.** In the Slack Archive, tap **Save to notes** on a message, type the player's name and pick them, and tap **Save note**. On a thread's first message, **Include the replies** brings the whole thread. The note shows the messages the way the Slack Archive does: who wrote each one and when, Slack's formatting and emoji, the replies under the first message, reactions, and each message's pictures and PDFs (tap one to open it). **Open in the Slack Archive ›** goes to the message there. Videos stay in the Slack Archive; the note names them.
- Links work. Paste a link and it opens from the note. For a link to one Slack Archive message, tap the link icon on the message to copy it; opening it jumps to the message and highlights it. To show words instead of the address, write [the words](the link).
- Whoever wrote a note can **Edit** its words or **Delete** it (with its attachments). Super-admins can too.`,
  },
  {
    id: "email-families",
    title: "Emailing families",
    group: "Directory",
    audience: "messaging",
    keywords: ["email", "message", "families", "parents", "dad", "mom", "guardian", "player email", "team email", "announcement", "reminder", "send", "missing", "hotel", "hotel registration", "messages sent", "template", "templates", "primary email", "same email", "{player}", "select all", "untick"],
    body: `You see this if you're on the board, or have the **Registrations** or **Travel** permission.

**Email the players in view.** On the Directory, **Email families** (next to how many players are showing) writes to the families of the players the list shows right now. Narrow it first: pick a team or **No team yet**, pick an age group, search, pick a requirement (like the handbook) and **Missing**, or pick a **hotel stay** (Regionals, Nationals…) and **Not yet known** to remind just the families who still need to book. The top of the window says who it's going to. Tap **see who gets it** (the ▶) to open the list of families. Every family is ticked to start; untick one to leave them out. **Select all / none** ticks every family or none. The count of families updates as you tick, and changing **Dads**, **Moms** or **Players** (or the Directory filters) starts the ticks over.

**Email one family.** On a player's page, **Email family** writes to just that player's family.

**Who gets it.** For one family, tick each person: **Dad**, **Mom**, a **Guardian**, and the **Player** when they have their own email. For several, tick **Dads**, **Moms** and **Players** (and **Guardians** when anyone has one), then tick the families themselves. All are ticked to start. When a player's email is the same as a parent's, it's listed once, on that parent, marked **Primary email**. It's sent from the club's email address, one email per family (brothers and sisters get one between them), and replies go to the club's Gmail. If a family has no email for the people picked, the window names them so you can reach them another way.

**Templates.** Pick one from **Template** to fill in the subject and message, then change anything you like. The board writes them in **Settings → Email Templates**.

**{player}** in the subject or message becomes the family's player names. Writing to several families, a preview shows how it reads for the first one.

**A copy** of each email is kept on the player's page under **Messages sent**, with who sent it and when. Brothers' and sisters' pages show it too: an email sent from one player's page shows on the whole family's, once, marked with who it was about.`,
  },
  {
    id: "slack-dms",
    title: "Slack DMs to families",
    group: "Directory",
    audience: "slack",
    keywords: ["slack", "dm", "direct message", "message", "families", "parents", "dad", "mom", "remind", "reminder", "missing", "handbook", "connect slack", "disconnect", "reply", "replies", "{name}", "{player}", "select all", "untick"],
    body: `You see this if you have the **Travel** permission, or a super-admin turned on **Slack DMs** for you in **Settings → Members**: board members, coaches, the travel coordinator, anyone the club picks.

**What it does.** Sends the parents of the players you pick a Slack direct message **from you**, one to each person, never a group DM. It looks just like a message you typed yourself, so when a parent replies, the reply comes straight to you in Slack.

**Connect Slack, once.** The first time, **Slack families** asks you to **Connect Slack**. A Slack window opens; tap **Allow** and it closes by itself. After that the portal can send DMs for you. To stop, tap **Disconnect Slack** at the top of the window.

**Slack the players in view.** On the Directory, **Slack families** (next to **Email families**, when you have both) writes to the families of the players the list shows right now. Narrow it first: tap a team, pick an age group, search, pick a requirement like the handbook and **Missing**, or pick a **hotel stay** and **Not yet known**, so only the families who still need it hear from you.

**Slack one family.** On a player's page, **Slack family** writes to just that player's parents.

**Who gets it.** Tick **Dads**, **Moms**, **Guardians** and **Players**. Then tap **see who gets it** (the ▶) to open the list of families: every family is ticked to start, untick one to leave them out, and **Select all / none** ticks every family or none. Changing **Dads**, **Moms** or **Players** (or the Directory filters) starts the ticks over. The window looks each person up in the club's Slack by the email on file and lists them: a ✓ means they're on Slack and get a DM, a ✗ means no Slack account uses their email. A parent of brothers and sisters gets one DM about all of them. Nobody gets a DM from themselves. You can send up to 150 DMs at a time.

**Writing it.** **{name}** becomes each person's first name and **{player}** their players' names, so *Hi {name}, we still need {player}'s handbook. Can you send it over?* reads as *Hi Sarah, we still need Sam's handbook. Can you send it over?* A preview shows how it reads for the first person. **Template** fills the message in from one of the board's email templates.

**Sending.** **Send 18 DMs** (with how many) sends them, counting up as it goes. Afterwards it lists anyone it couldn't reach, and who isn't on Slack with their email, so you can reach them another way.

**A copy** of each DM is kept on the player's page under **Messages sent**, marked with the Slack logo.

You can only Slack the families of players you can see in the Directory. Slack DMs are off while a super-admin is using **Preview as**.`,
  },
  {
    id: "your-profile",
    title: "Your profile",
    group: "Directory",
    audience: "everyone",
    keywords: ["profile", "edit", "nickname", "photo", "avatar", "gravatar", "picture", "phone", "birthday", "name", "email change"],
    body: `Keep your details current so other families and coaches can reach you.

**Finding it.** Tap your own name — on the Directory under your player, on a team page, or by searching for yourself.

**Editing it.** Tap **✎ Edit profile** to change your full name, **nickname**, phone and birthday, then **Save**.

- Your **nickname** (e.g. "Jeff") is the short name people see around the portal. Leave it blank to use your first name.
- Your **photo** comes from [Gravatar](https://gravatar.com) automatically — set one up for the email you sign in with and it shows up here. Or paste a link to a picture in **Avatar URL**.
- Your email, and whether you have access, are managed by the club. Ask a board member if your email changes.`,
  },
  {
    id: "player-requirements",
    title: "Player requirements",
    group: "Directory",
    audience: "staff",
    permission: "player_requirements",
    keywords: ["requirements", "handbook", "signature", "signed", "signature page", "hotel", "hotel registration", "booked", "room block", "fee", "fees", "paid", "owes", "waived", "scan", "scanner", "camera", "auto", "pdf", "heic", "iphone photo", "upload", "photo", "missing", "collected", "checklist", "forms", "walkthrough", "show me how"],
    body: `Keep track of what each player has handed in or paid — the signed last page of the handbook, hotel registration, a tournament fee, a form. The board sees this; the travel coordinator (the **Travel** permission) does too, so they can mark hotel registration and follow up.

**On each player.** In the **Directory**, every player has a chip for each requirement that applies to them:

- A red **Needs Handbook signature** (or **Owes** for a fee) means it's still missing.
- A green chip with a check means it's done or paid. A little page icon means a scan is attached.
- A grey **waived** chip means you've excused them.

**Hotel stays** (Regionals, Nationals, weekend trips) are separate from this list — the travel coordinator sets them on each HS Schedule weekend and tracks **Booked in block** in the Directory (see *Hotel stays*).

**Checking a player off.** Tap the chip. Pick **Done** (**Paid** for a fee), **Waived** or **Not yet**, set the date, and add a **Note** if it helps (a check number, say). Then tap **Save**.

**Scans.** When a requirement offers it, you can attach a copy of what you collected. Scans are private to people who can check requirements off.

- **Scan with camera** works like the scanner built into your phone. Point the camera at the page and hold still: once the yellow outline finds it, the ring around the round button fills and it takes the picture by itself. Tap the round button to take it sooner, or tap **Auto** to turn that off and always tap it yourself (your phone remembers). Drag the corners if they're off, then tap **Keep scan**. The page comes out straight and cleaned up. Pick **Color**, **Grayscale**, **B&W** or **Photo** (the picture as taken), tap **Add page** for more pages (it waits until you turn to the next page), then **Attach scan** to save them all as one PDF. **Photo** next to the round button scans a picture you already took.
- **Upload scan** attaches a photo or PDF you already have. A photo opens in the scanner first, so you can drag the corners and pick a look the same way, or tap **Upload as is** to attach it untouched. iPhone photos (HEIC) work on any computer; with **Upload as is** they're saved as a JPEG so everyone can open them.
- **View scan** opens it; **Replace scan** and **Remove scan** do what they say.

If the camera won't open, allow it for this site in your browser's settings, or tap **Use a photo instead**.

**Who's still missing?** Pick a requirement from the **All requirements** drop-down above the list. **Missing** shows who still needs it, with counts for **Done** (or **Paid** / **Booked**), **Waived** and **All**. It works together with search and the team and age-group filters, and the line above the list shows how many are done. From a **Missing** list, **Email families** or **Slack families** writes to those families.

Requirements start over each season, since each season has its own roster. The list itself is set up in **Settings → Requirements**.

**Walk me through it.** For a hands-on walkthrough in three parts (setting a requirement up, checking players off with a scan, and seeing how many are in and who's left), press **Show me around** next to this section's title, or tap **ⓘ** on **Settings → Requirements** and then **Show me around**.`,
  },
  {
    id: "hotel-registration",
    title: "Hotel stays",
    group: "Directory",
    audience: "travel",
    keywords: ["hotel", "hotels", "hotel stay", "hotel stays", "hotel registration", "booked", "booked in block", "staying elsewhere", "not yet known", "covered via sibling", "room block", "regionals", "nationals", "weekend", "booking", "instructions", "group code", "travel", "travel coordinator", "missing", "siblings", "email", "slack", "dm", "follow up", "families", "hs schedule"],
    body: `For the travel coordinator: each trip that needs a hotel — **Regionals** (everyone), **Nationals** (some teams), a weekend away — is its own **hotel stay** on that weekend of the **HS Schedule**. You pick the hotel from External Contacts, write how families book, then mark who's **Booked in block** in the Directory and follow up with the rest.

**Set up a stay (on the HS Schedule).** Open the weekend (tap its event). Under **Hotel stays**, tap **Add hotel stay**:

- **Name** — what families see (**Regionals**, **Nationals**, **Des Moines weekend**…).
- **Hotel** — the company in **External Contacts → Hotels** (add it there first if it isn't listed).
- **How to book**, optional **Booking link**, **Group / booking code**, and **Book by** date.
- **Rates / room notes** for what you paid or what worked.
- **Who registers** — **All players**, or **Only some teams** (Nationals, a JV weekend).
- **Status** — **Open** while families should book; **Closed** or **Canceled** when you're done.

**Track Booked in block (Directory).** Tap **Track Booked in block in Directory ›** on the stay, or on the Directory pick the stay from **All hotel stays**, then **Not yet known**. The list and counts include every player on this season's roster — including families who said no to the Directory (they show **Not in directory**). Other families still don't see those players. Each player shows a chip:

- Red **Needs Regionals** (or the stay's name) means their stay is **Not yet known**.
- Green with a check means **Booked in block**.
- Grey **staying elsewhere** means they aren't in the hotel block (staying with family, for example). The note is on the chip.
- Grey **Covered via sibling ·** and the sibling's name means they have no mark of their own, but a brother or sister who shares a parent is **Booked in block** or **Staying elsewhere** on this stay. They are left out of the **Not yet known** count.

Tap the chip: **Booked in block**, **Staying elsewhere** or **Not yet known**, a date, and a **Note**. **Staying elsewhere** needs a note (placeholder **e.g. staying with family**). **Save**.

**Siblings.** If two players share a parent and both are on this stay, marking one lists the other, ticked to start — including a sibling whose family said no to the Directory. Untick them to mark only the player you opened. **Not yet known** asks whether to clear the siblings too.

**Follow up.** With **Not yet known** showing, **Email families** or **Slack families**. **{player}** becomes each family's player names; for Slack, **{name}** is each parent's first name.

**On the hotel's contact.** Open the hotel in External Contacts: **Hotel stays** lists every weekend you linked it to, with the event and a jump back to the schedule or Directory.

**Import a rooming list.** When the hotel sends a **Group Rooming List** PDF (or a CSV), open **Settings → Import** and use **Hotel rooming list** — see *Settings: Import*.

Hotels and places to eat themselves stay in **External Contacts** (see *Hotels and places to eat*).`,
  },
  {
    id: "hs-schedule",
    title: "HS Schedule",
    group: "HS Schedule",
    audience: "coaches",
    permission: "hs_schedule",
    routes: ["/portal/schedule"],
    keywords: ["schedule", "hs schedule", "high school", "season", "weekend", "tournament", "games", "varsity", "jv", "14u", "opponents", "teams coming", "who plays who", "which of our teams", "jv only", "all our teams", "on the fence", "maybe", "confirmed", "not coming", "facility", "secured", "trip", "overnight", "notes", "scores", "results", "record", "compare", "last season", "columns", "our teams", "hidden teams", "spreadsheet", "coaches", "filter", "needs work", "good to go", "waiting", "to do", "hotel", "hotels", "food", "restaurant", "where to eat", "where to stay", "travel", "room block", "rates"],
    body: `The high school season weekend by weekend, laid out like the planning spreadsheet's "HS Schedule" tab, for the coaches and the board. Every season has its own schedule, and the earlier ones stay to look back on. The travel coordinator (the **Travel** permission) sees it too, without changing it.

**The grid.** A row per weekend, grouped by month (each month's heading counts its weekends, and **This month** marks the one we're in): the dates and days, **Where** and the trip, the **Event**, a column for each of our teams (V, JV1, JV2, 14U A…) with its games, and **Notes** (the venue and game times). The event's color says how it stands, as in the spreadsheet: **Tentative** (red), **Need to secure facility** (yellow), **Final details in process** (pale yellow) and **Facility secured** (green); off and open weekends are grey. Beside the event, a weekend that still needs something has a short chip (**Tentative**, **Need facility**, **Final details**, **Canceled**); a secured or off weekend says so with its color. Under the event are two of the teams coming, how many more, and how many are on the fence: hover over that line for every team, and over the page icon for the weekend's details. Off weekends written in capitals in the spreadsheet (**THANKSGIVING - - OFF**) read in normal case (**Thanksgiving**). The weekend we're in says **This weekend** by its dates (or the next one, **Next**), the heading gives the season's usual days (**Thu–Sat**) and a weekend on other days says its own, and a team's games show as a plain number, boxed when there's something to look at (a **3?** or a team on the fence). Once a weekend is over and has scores, each team's cell shows how it went (**2–1**). Off weekends leave the cells empty, and the **Notes** column shows only when a weekend in view has notes. Click anywhere in a weekend's row to open it. **Total games** at the bottom adds up each team's games, with how many are **Not sure yet** and the **Record (W–L)** under them once there are any (on a phone, a tile per team).

**On a phone.** Each weekend is a card: tap its top (the dates and event) for the weekend's details, and a team's count for its card. Under the event are **Where**, the trip and the notes, then the teams coming and how many are on the fence. A **Facility secured** weekend has just its green bar; the others say how they stand at the top right. Off, open and canceled weekends are a single line.

**Months that are over.** While a season is under way, the months that are over fold to one line with their records (**V 2–1, JV1 1–0**), and the page opens on this month. Tap a month's line to open it, or tick **Show past months** under **View** to open them all. A season that's over, or not started yet, shows every month. On a phone the month's name stays at the top of the screen as you scroll.

**Show just some weekends.** Tap the **All weekends** drop-down above the schedule for each color with how many weekends it has. Tick **Tentative** or **Need to secure facility** to see what still needs work, **Final details in process** for what's waiting, or **Facility secured** for what's good to go. **Not sure yet** shows the weekends with a **3?**, and **Teams on the fence** the ones with a maybe. Tick more than one to see them together, and **All weekends** to see every one again.

**Search, and just one team.** **Search events, places, teams** finds the weekends whose event, place, notes, details, facility or teams coming match (type **Lincoln** for the weekends Lincoln comes, or **Des Moines**). **All our teams** picks one of ours (**JV1**): just its column, and the weekends it plays. While anything narrows the list, the drop-downs fill in, a line says how many weekends are showing (**3 of 14 weekends**) with **Clear** to see them all again, and the total at the bottom adds up just those. What you pick is in the page's address, so a link or bookmark opens the schedule the same way, and **Back** undoes the last change.

**View.** **Show hidden teams** shows the teams hidden in Season settings for now, **Show past months** opens the months that are over, and **Compare with** puts another season's same weekend beside each row.

**Where to stay and eat.** On a weekend away, a bed and a fork under **Where** count the hotels and places to eat we've saved there. Tap them for the list, with the places that have notes (where we've been) first: each place's notes (rates, what worked last time), who to call or email (and the **Front desk** when someone's named), and its website. A place in a nearby town says which. Tap a place's name to open it, or **Add or edit places in External Contacts** at the bottom. They come from External Contacts' **Hotels** and **Food** types: a place shows on the weekends in its **City**, or in a city it's tagged with.

**Who's coming.** Hover over a team's count (tap it on a phone) to see its card: the team and its games at the top (**JV1 · 3 games**), then the teams it plays, **Coming** and **On the fence**, each linked to its program in External Contacts, and a line for the ones **Not coming**. A team that plays only some of ours says which in parentheses: **(also JV1, JV2)**, with a **?** where it's a maybe, or **(JV1 only)**; one down for all our teams says nothing. On a computer the card opens under the weekend's row, so the event and its teams stay in view. **For our other teams** lists the ones coming that weekend that don't play this team (a program bringing just its JV, on the varsity's card). Teams from the spreadsheet start out down for all our teams, and the card says so until you mark who plays whom. Scroll or click in the card and it stays open, with an **✕** to close it; clicking the count does the same. A **3?** with a dashed line means the games aren't settled yet; in the grid, a small amber dot means a team is on the fence.

**Change it right there.** Press **Edit** on that card. Use **−** and **+** for the games, and tick **Not sure yet** if they aren't settled. Under **Teams** is how many are coming, on the fence and not coming, with the ones not coming last. For each team tap **Yes**, **Maybe** or **No** beside its name. Under it, tap the teams of ours it plays (**V**, **JV1**, **JV2**…) to add or take one off, or **All** for every team we bring: filled means you picked that team, outlined means it's there because of **All**, and dashed is a maybe. **Add a team** (with **Add as** Yes, Maybe or No) finds programs the way coaches write them (DMW, So Metro, RR), or keeps what you type as a name. Don't know the name? Press the space bar (or the down arrow) in the empty field, or tap the arrow at its right end, to see every team, then pick one with the arrows and Enter or with a click. For a weekend that's over, **Score** records the result. Everything saves as you go.

**A weekend's details.** Tap the event, or **Weekend details** on the card. At the top is how the weekend stands, where it is, its notes and details. Under them, tick **We host this tournament** for a tournament the club runs (the Missouri River Shootout): it gets a planning page, and the weekend shows **We host · Plan it** beside its event (see **Tournaments we host**). **Hotel stays** on that same weekend is where Travel sets a room block (see *Hotel stays*). Press **Edit** to change its dates, **Where**, **Trip**, **Status**, **Notes**, **Facility** and **Details**, then **Save details** (or **Cancel**). Below that, **−** and **+** set every team's games, with **Not sure** for the ones that aren't settled, and **Teams coming** lists how many are coming and on the fence, then every team with **Yes**, **Maybe** or **No** and the teams of ours it plays (the same chips as on the card). The trash can at the end of a team's chips takes it off the weekend. Games and teams save as you change them. **Add weekend** adds one; **Delete this weekend**, at the bottom, removes one.

**Seasons.** Use the arrows beside the season's name to move between seasons, or tap the name (**2026–27 ▾**) for the list of them all. A tag beside it says whether it's **This season**, a **Past season** or the **Next season**, and the season's notes from Season settings show under it (**more** for the rest). On the newest season, the board sees **+** in place of the right arrow to start the next one. On a computer the column headings (the season, **Where**, **Event**, our teams) stay at the top as you scroll. **⋯** beside the gear has **Print** (the grid on landscape pages, with what's showing at the top) and **Copy link** (the schedule as you're seeing it, filters and all). Pick a season under **Compare with** in **View** to put its same weekend beside each row, so you can see what we did a year ago. The gear (**Season settings**) next to **Add weekend** opens **Our teams** (a column each on the schedule): **Add team**, the arrows to reorder, the eye to hide or show one in a tap, and the pencil to rename one or link it to its team in the Directory. Below them are the season's **Notes**, with **Save notes** once you've typed. The board can also **Start 2027–28 from 2026–27** there (the same weekends a year on, with the teams that came now on the fence), add any other season with **New season** (it starts on the season after the newest one: pick **Copy 2026–27** for the same weekends a year on, or **Start empty**), or delete the season. With no seasons at all, the board presses **Start 2026–27** on the empty page. A season with no weekends yet offers **Add weekend** right there, and **Season settings** first when it has no teams of ours yet; **Compare with…** shows once it has weekends.

**Walk me through it.** Press **Show me around** next to this section's title, or tap **ⓘ** on the HS Schedule and then **Show me around**.`,
  },
  {
    id: "hosted-tournament",
    title: "Tournaments we host",
    group: "HS Schedule",
    audience: "coaches",
    permission: "hs_schedule",
    routes: ["/portal/schedule/hosted"],
    keywords: ["tournament", "we host", "host", "hosted", "mrs", "missouri river shootout", "shootout", "facility", "walk-through", "walkthrough", "certificate of insurance", "coi", "insurance", "contract", "pricing", "checklist", "divisions", "teams", "brackets", "bracket", "pool", "round robin", "court schedule", "courts", "master schedule", "fill the courts", "scores", "standings", "budget", "revenue", "expenses", "team fees", "sponsors", "admissions", "referees", "court fees", "net", "finances", "program communication", "email programs", "mass email", "invoices", "bill programs", "team fees collected", "invoices sent", "invite programs", "review the teams", "edit order"],
    body: `When the club runs the tournament (the Missouri River Shootout), plan all of it on one page instead of the spreadsheet. On the HS Schedule, open the weekend and tick **We host this tournament**, then **Open the tournament plan** (or tap **We host · Plan it** beside the event in the schedule). The coaches and the board use it. Untick it if we're not hosting after all: the plan is kept, and ticking it again brings it back.

**At the top.** How it stands: the **Checklist** (how many steps are done, and how many are past due), the **Teams** and divisions, the **Games** and how many have a court, and the **Net (estimate)**. Tap one to go to its tab.

**Checklist.** What every tournament we host needs, by section. **Facility**: secured for our dates, the walk-through, a point of contact for the weekend, pricing, the certificate of insurance and the contract. Then **Teams**, **Referees and table**, **Communication** and **Game day**. Tick a step when it's done. Ticking **Invite programs** asks **Did you review the teams?** — **Yes, mark done** ticks it; **No, review now** leaves it unticked and opens the **Teams** tab. Closing the box or pressing Escape also leaves it unticked. Unticking it does not ask. The pencil gives a step a due date and a note (who has it, a link to the contract), renames it, or **Remove**s it; **+ Add a step** adds your own. Super admins see **Edit order** at the top of the checklist; tap it (it reads **Done** when you're finished) to show **Move up** / **Move down** on a step (the three billing steps move as one block; **Invoices sent** and **Team fees collected** have no arrows). That choice lasts this visit only. A later tournament-administration or treasurer-style permission may get that; it is not a new permission yet. The three billing steps stay on the checklist — they say **Stays on the checklist** instead of **Remove**. Under **Teams**, **Set team fees and bill each program** sits above **Invoices sent** and **Team fees collected**. Its name opens the plan's **Bill programs** page, and it also has **Bill programs → Finance**. Tick it when the team fee is set: that locks **Team fee ($)** in **Details** (and a team's own fee on the Teams tab). Uncheck it to change the fee, unless an invoice already exists — then **Void invoices first**. An invoice also ticks the step and locks the fee. Whoever holds President, Athletic Director, or Treasurer in Settings → Planning Roles (plus super admins) can invoice. Coaches and the board who can edit the HS Schedule see it on the plan. Someone who can invoice but cannot edit the HS Schedule is not shown the rest of the tournament page (teams, money, sent emails); they get a **Bill programs → Finance** link instead. It opens a preview (team counts from the **Teams** tab, visiting teams — change them there if a count is wrong), then one invoice per program, with an optional deposit. **Invoices sent** checks itself when every program has been sent an invoice. **Team fees collected** shows **Not billed yet** until an invoice is sent, then how much is in of the total, checks itself when every expected program is paid, and has **View in Finances →**. **Details**, below, holds the **Short name** (**MRS**), the **Team fee**, the **Game slot** length, how many **Courts**, each day's **First game** and **Gym closes** times, and what the email says about the **Facility**, **Concessions**, **Admission** and **Game information and rules**. While you're planning, **Team fee ($)**, **Courts** and the rest stay editable. **Team fee ($)** always says when it locks: **Tick Set team fees and bill each program to lock Team fee ($).** Once that step is ticked (or an invoice exists), it is read-only and says **Locked because fees are set. Uncheck Set team fees to change.** If invoices can't be checked it says **Couldn't check invoices. Try again.** and the fee stays locked. The three billing steps show in that order on older plans too (the stored list order is not what you see). **One of our teams (no fee)** on a team is locked the same way. Press **Save details**. **We're not hosting this** takes the page off the schedule.

**Teams.** **Add a division** for each group that plays together (**HS Boys A**, **HS Girls**, **JH Boys**), with a short name for the schedule (**HSA**) and how they play: a **Pool** (everyone plays everyone) or a **Bracket** (winners play winners and losers play losers, so every place is decided: eight teams make 12 games, with Game 9 for first and second, like the JV bracket sheet). **Add the teams coming** brings in every program marked **Yes** on the HS Schedule and our own teams playing that weekend; **Add a team** adds one by hand. Tap a team to put it in its division, give it a short name (**KCM 1**), a seed (1 is the top) and its own fee, or **Remove** it (a team with an invoice says **Void its invoice first**). When a division has its teams, press **Make the games** (**Make the games again** replaces them).

**Schedule.** The facility schedule, a grid for each day with a row per time and a column per court, each game in its division's color: **HSA (OL 1 vs KCM 1)**. **Fill the courts** gives every game without a time the earliest open court, never putting a team in two games at once and always putting a bracket game after the games that decide who plays in it. **Start over** takes every game without a score off the courts and fills them again. Tap a game to move it (**Day**, **Time**, **Court**), change its teams, or enter the score; **Add a game** adds one by hand (a crossover). **Print** prints it.

**Brackets.** Each bracket division as rounds side by side, and each pool's standings (wins, losses, points for and against). Tap a game to enter its score: the winner and loser move on to their next games by themselves.

**Money.** The tournament's budget, like the bottom of the spreadsheet. **Team fees** add up from the teams entered (our teams pay nothing). Under **Sponsors**, **Admissions**, **Court fees**, **Referees** and the others, each line is a count times an amount (45 court hours × $50); **+ Add** adds a line and tapping one changes it. Leave a referee line's count blank and it follows the games on the schedule. Then **Net**. Under **Finances**, the Treasurer links the tournament to its entry in Finances (**Link to Finances**, or add it there) and presses **Put it in the budget** (later **Update the budget**): each cost becomes a budget line in the **Events** group and each income an expected income, all tagged with the tournament, so searching **MRS** on Finances → **Budget** shows them. Anyone who can see Finances sees each line's budget beside what's actually been paid and received, and the **Actual so far**.

**Email.** **Fill in from the plan** writes the program email from the page: who's coming, the divisions, the facility, concessions, admission, the rules and the court schedule. Edit it, tick the programs to send it to (**Everyone coming**, **Coming and on the fence**), add any other emails under **Also send to**, and press **Send**. Each program gets its own copy, to the emails External Contacts has for it, and replies come to the club's email. What was sent is listed under **Sent**, with **Use again**.`,
  },
  {
    id: "hs-schedule-travel",
    title: "HS Schedule",
    group: "HS Schedule",
    audience: "travel",
    routes: ["/portal/schedule"],
    keywords: ["schedule", "hs schedule", "high school", "season", "weekend", "tournament", "travel", "travel coordinator", "weekends away", "overnight", "trip", "hotel", "hotels", "room block", "food", "restaurant", "where to stay", "where to eat", "teams coming", "view only", "read-only"],
    body: `For the travel coordinator: the high school season weekend by weekend, to plan the hotel blocks and team meals. It's **HS Schedule** in the sidebar. You see all of it; the coaches and the board keep the games and teams up to date (**View only** at the top for those). You add **Hotel stays** on each weekend that needs a room block.

- **The grid.** A row per weekend: the dates, **Where** and the trip (**Local**, **Day trip**, **Overnight**…), the event, a column for each of our teams (V, JV1, JV2…) with its games, and **Notes** (the venue and game times). The event's color says how it stands: **Tentative** (red), **Need to secure facility** (yellow), **Final details in process** (pale yellow) and **Facility secured** (green).
- **Hotel stays.** Tap a weekend's event. Under **Hotel stays**, **Add hotel stay** links the hotel from External Contacts, with how to book, the group code and who must register (everyone, or some teams). **Track Booked in block in Directory ›** opens the Directory filtered to who's **Not yet known** — see *Hotel stays*.
- **Where to stay and eat.** On a weekend away, a bed and a fork under **Where** count the hotels and places to eat saved there (by city). Tap them for the list, with the places that have your notes first. They're the ones you keep in **External Contacts**.
- **Who's coming.** Hover over a team's count (tap it on a phone) to see its games and the teams it plays. Scroll or click in the card and it stays open, with an **✕** to close it.
- **Seasons.** The arrows beside the season's name move between seasons. **View** → **Compare with** puts another season's same weekend beside each row. **Search events, places, teams** finds a weekend by its event, place or a team coming.`,
  },
  {
    id: "external-contacts",
    title: "External Contacts",
    group: "External Contacts",
    audience: "coaches",
    permission: "contacts_edit",
    routes: ["/portal/contacts"],
    keywords: ["contacts", "vendors", "companies", "people", "photographer", "gym", "facility", "rent", "program", "programs", "opponents", "referees", "refs", "scheduler", "athletic director", "coach", "role", "team colors", "also known as", "account number", "billing", "tags", "nchc", "ndii", "phone", "email", "history", "changes", "who changed", "restore", "undo", "coaches can see", "read-only"],
    body: `Everyone outside the club we work with — other programs, gyms we rent, referees, vendors, photographers. The board sees and edits all of it. Coaches see the types the board shares with them (the programs, gyms and referees), read-only.

- **All** lists each company with the people who work there under it (their role, email and phone), then **People on their own**. **Companies** shows just the companies; **People** lists everyone, each with the company they work at.
- **Search** by name, role, email, phone, city, account number or type, or by another name a program goes by (like RR). Beside the search box, **All**, **Companies** and **People** switch what the list shows. Under it, the **All types** and **All tags** drop-downs narrow the list to one type or one tag; set it back to **All types** or **All tags** to show everyone.
- A person's page shows **Works at**: their company, with its details, and everyone else who works there. A company's page lists **People at this company**, and a program's or gym's page shows **On the HS Schedule**: every weekend it came to or hosted. Numbers are tap-to-call, and tapping an address offers **Apple Maps** or **Google Maps**.

**The board** also:

- **+ New contact** — choose **Company** or **Person**, then fill in what you know: a person's **Role**, a company's **City** and **State**, contact info (with an **Other email**), for another program its **Team colors** and **Also known as** (the short names coaches use), account and billing details, notes and tags. Add the people you deal with at a company from its page with **+ Add person**, or pick their company under **Works at** when you add them.
- **Edit** a contact from its page. If someone else saved it after you opened it, your save stops and says so, so nobody's changes are lost.
- **History** on a contact's page lists every change to it, newest first: who made it, when, and each field before and after, including what the spreadsheet import added or filled in. **Restore this version** puts an earlier version back; that's saved as a new change, so it can be undone the same way. **Recent changes**, at the top of External Contacts, lists the latest changes to every contact.
- **Used by** on a contact's page lists the playbooks it's attached to.
- **Hotels** and **Food** are where we stay and eat on the road, with the rates and what worked in their notes. They show on the HS Schedule's weekends in their city. Tag one with the city it's near to show it there too (a hotel in Ankeny: **des moines**), or **closed** to keep it off the schedule. The travel coordinator (the **Travel** permission) adds and edits them too.
- Which types coaches see is set by a super-admin in **Settings → Contact Types** (**Coaches can see**). Coaches see everything on those contacts, notes included, so keep anything just for the board on another type.

Super-admins can **Delete** a contact.`,
  },
  {
    id: "travel-contacts",
    title: "Hotels and places to eat",
    group: "External Contacts",
    audience: "travel",
    routes: ["/portal/contacts"],
    keywords: ["travel", "travel coordinator", "hotel", "hotels", "room block", "rates", "food", "restaurant", "places to eat", "dinner", "team meal", "external contacts", "tags", "closed", "hotel registration", "booked"],
    body: `For the travel coordinator: the hotels we book and the places that feed the team on the road, in **External Contacts** (in the sidebar). You see and change these; the rest of External Contacts is the board's.

- Each hotel or restaurant is listed with the people there under it, their role, phone and email. Tap one to open it.
- **+ New contact** adds a place. Choose **Company**, give it the **Hotels** or **Food** type, then fill in its **City** and **State**, phone, website and notes: the rates, the room block, what worked last time.
- On a place's page, **+ Add person** adds who you deal with there, and **Edit** changes the place. If someone else saved it after you opened it, your save stops and says so, so nobody's changes are lost.
- **Tags** put a place on the HS Schedule's weekends in a nearby city: tag a hotel in Ankeny **des moines** and it shows on Des Moines weekends as well as Ankeny's. Tag one **closed** to keep it off the schedule.

You, the coaches and the board see these places under each weekend away on the **HS Schedule**, with your notes. Only the board can delete a contact.

**When we stay there.** On a hotel's page, **Hotel stays** lists each HS Schedule weekend you linked this hotel to (Regionals, Nationals, a weekend away), with booking status and links to the schedule and Directory. Set those stays up on the weekend itself — see *Hotel stays*.`,
  },
  {
    id: "roadmap",
    title: "Roadmap",
    group: "Roadmap",
    audience: "super_admin",
    preview: true,
    routes: ["/portal/roadmap"],
    keywords: ["roadmap", "proposed", "planned", "in progress", "preview", "released", "parked", "approve", "share link", "product", "note", "history"],
    body: `What's live, what's in preview, what's being built, what's planned, ideas, and what's parked. Super-admins only, for now.

The board is six columns: **Released**, **Preview**, **In progress**, **Planned**, **Proposed** and **Parked**. Filter by area at the top. **Add item** opens a sheet for the title, a short description families can read, the area, the column, the day it went live (Released), and a preview link (required in Preview). **Parked** is for something set aside, not in the pipeline — it can go there from any other column, and back again.

**Approve** on a Proposed card, or in that item's sheet, moves it to Planned and records who approved it and when. Planned cards then say **Approved by X on date**. Only a super-admin can approve — the page hides the button from everyone else, and the server and the database both refuse anyone who isn't.

The Product Manager bot can move a card to any column and add a **note**. The latest note shows on the card. Open the item to see **History**: who (Bot), which column it came from, which it landed in, the note, and when. Families on the share link don't see notes or history.

**Share link** turns on a read-only copy families can open without signing in. **New link** and **Turn off** stop the old link working.`,
  },
  {
    id: "playbooks",
    title: "Playbooks",
    group: "Playbooks",
    audience: "everyone",
    routes: ["/portal/docs"],
    keywords: ["playbooks", "how to", "guide", "docs", "instructions", "procedure", "checklist", "steps", "run", "video"],
    body: `Step-by-step guides for how we do things around the club.

- Playbooks are listed newest-updated first. Tap one to open it — or search for it from the top bar.
- Each playbook is a reference page, and can include pictures and videos (tap a video card to play it).
- Some playbooks also have **procedures** — checklists for a job you do the same way every time. Open the **Run** tab to see a procedure's steps.

**Running a procedure (board).** Open the playbook, press **▶ Start**, and tap each step as you do it. When every step is checked, press **Done** — it's logged in the procedure's **History**, and if the procedure is set up to, the team gets a heads-up in Slack (**Done — notify the team**).`,
  },
  {
    id: "playbooks-editing",
    title: "Writing playbooks",
    group: "Playbooks",
    audience: "staff",
    routes: ["/portal/docs/new"],
    keywords: ["new playbook", "edit", "write", "markdown", "image", "video", "upload", "procedure", "checklist", "slack", "notify", "history", "versions", "contacts", "attach", "delete"],
    body: `The board writes and keeps the playbooks up to date.

**New playbook.** Tap **New Playbook**, give it a title, an optional category and short description (shown on the listing card), and write the steps. Use the toolbar for bold, lists, **Insert image** (or drag a picture in) and **Insert video** (a YouTube link or an uploaded clip). **Preview** shows how it'll look. Tap **Create**.

**Editing.** Open a playbook and tap **Edit**, make your changes and **Save**. Every save keeps a copy — tap **History** to see earlier versions.

**Procedures.** Under **Procedures**, tap **+ Add procedure**, name it and list the steps, one per line. Tick **Notify a Slack channel when this is completed** to post a message when someone finishes — add the channel's ID and a message (use \`{person}\` for the name of whoever ran it). The Slack bot has to be invited to that channel. Each procedure's **History** tab shows who ran it and when.

**Contacts.** The **Contacts** box on a playbook links the vendors or facilities it involves — tap **+ Attach** and pick from External Contacts.

Super-admins can **Delete playbook** from the bottom of its page.`,
  },
  {
    id: "film",
    title: "Film",
    group: "Film",
    audience: "super_admin",
    permission: "film_view",
    alsoPermissions: ["film_manage", "teams"],
    routes: ["/portal/film"],
    keywords: ["film", "game film", "video", "upload", "download", "play", "moved", "youtube", "playlist", "holding", "delete", "edit", "coach inbox", "game date", "opponent", "score", "unlisted", "public", "private", "privacy", "processing", "refresh youtube status", "slack", "approve", "sparky", "lineup", "restore", "discarded", "stalled", "progress", "history", "retry youtube", "film status"],
    body: `Game videos families send in from their phones, under **Film** in the sidebar. You see this if a super-admin gave you **Game film**, **Game film (manage)**, or **Teams & volunteers** in Settings → Members.

Families don't sign in here. They open the team upload link they were sent (the full **https://…/t/…** address from **Settings → Film**), enter that team's shared code, then fill in **Your name**, **Game date** (it starts on today), **Opponent**, and **Our score** / **Their score** if they know it — scores can stay blank if the game isn't over — and upload. The page has a **Tip: record in 1080p at 30 fps (iPhone: Settings → Camera → Record Video).** Ask them to **keep the page open and keep the phone plugged in** until they see **✓ Uploaded** on each file and the green **All videos uploaded — you can close this page.** If a file says **Failed**, they tap **Retry**.

**On this page**

- Videos are grouped by team, then by game date, opponent, and score. A video with no date sits under **No game date** (not a generic "Game") until someone fills one in.
- **Play** watches the file in this page (it works on a phone). **Close player** puts the player away. **Download** still saves a copy.
- **Every team** (and each team name) filters the list when more than one team has film. **All**, **Holding** and **Moved** filter by whether it's been copied off.
- After YouTube is connected in **Settings → Film**, new uploads go to that channel in the background (unlisted unless you change it), then into that team's playlist if one is set. The YouTube title and description come from that team's template (a green or red circle on a win or loss, no W/L text). While a file is going up you see **Uploading to YouTube** with the percent, bytes uploaded of the total, how long is left, and when it started. **History** expands the log: file received, YouTube upload started, progress milestones, finished, added to playlist, each retry, and each error with a time. If YouTube failed, the card explains why in plain words (for example if the phone upload never finished) — tap **Details** for the raw error. No progress for 30 minutes becomes **Stalled** with **Retry YouTube**. **On YouTube** / **YouTube** opens the video. **In playlist** opens the playlist. The card also shows the privacy YouTube actually has — **Public**, **Unlisted**, or **Private** — plus whether YouTube is still **Processing** the file or it's **Ready**. That can differ from the default in Settings → Film (Google sometimes forces **Private**). **Refresh YouTube status** reads it from YouTube so you don't need Studio. If YouTube failed or stalled, **Retry YouTube** tries again. If the playlist add failed, the video stays on YouTube and the card says **Playlist failed** — tap **Retry playlist**. **Send to YouTube** and **Add to playlist** are for older files that never went up. **Film status** is the board list of in-progress, stalled, failed, and done uploads across teams.
- **Pending Slack posts** appear at the top after a video is on YouTube. The text matches the YouTube description. Sparky does not post it until someone with **Teams & volunteers** (or **Game film (manage)**) taps **Approve** — not only a super-admin. **Edit** changes the text and **Save**s it. **Discard** soft-deletes it. **Discarded Slack posts** stay on this page for 30 days with **Restore**, then they are purged. **Approve** stays off if that team has no **Slack channel ID** in Settings → Film, or if Sparky isn't connected.
- If you have **Game film (manage)**: **Edit** on a video to change **Game date**, **Opponent**, **Who played** (that game's lineup; leave empty to use the season roster), **Our score** / **Their score**, and an optional **YouTube playlist** for this video only (leave blank to use the team's playlist), then **Save** (or **Cancel**). The heading above the video updates. Cards that are missing a date, opponent, or score say **Missing:** so you can fill them in. **Mark moved** once it's copied off. **Back to holding** undoes that. **Delete** removes the file for good.
- Files marked **Moved** are deleted automatically after 30 days.

Share the team upload link and code with families, not this inbox. Super-admins and anyone with **Game film (manage)** set those codes and connect YouTube in **Settings → Film**.`
  },
  {
    id: "film-status",
    title: "Film status",
    group: "Film",
    audience: "super_admin",
    permission: "film_view",
    alsoPermissions: ["film_manage", "teams"],
    routes: ["/portal/film/status"],
    keywords: ["film status", "youtube", "stalled", "failed", "in progress", "progress", "retry youtube", "history", "board"],
    body: `A board list of YouTube transfers across every team you can see, under **Film status**. Open it from **Film**, or go to **/portal/film/status**. Same people who can open **Film** can open this.

**On this page**

- **Needs attention** is the starting view: in progress, stalled, and failed. **In progress**, **Stalled**, **Failed**, **Done**, and **All with YouTube** filter the list.
- Each card shows the team, game, file, and live YouTube progress — percent, bytes uploaded of the total, how long is left, and when it started.
- **Stalled** means no bytes moved for 30 minutes. Tap **Retry YouTube** (you need **Game film (manage)**).
- A failed card explains the error in plain words. **Details** shows the raw message. If it says the file isn't in storage, ask the uploader to send it again from the team page.
- **History** on a card lists file received, YouTube upload started, progress milestones, finished, added to playlist, each retry, and each error, with times.

This page does not replace **Film**. Play, download, edit, Slack, and playlists stay on **Film**.`,
  },
  {
    id: "payments",
    title: "Finances: recording what families pay",
    group: "Finances",
    audience: "finance",
    routes: ["/portal/payments"],
    keywords: ["payments", "finances", "treasurer", "fees", "registration fee", "owes", "owed", "balance", "paid", "venmo", "check", "cash", "uniform", "tournament", "covered", "hardship", "scholarship", "credit", "refund", "void", "spreadsheet", "csv", "download", "export"],
    body: `The season's money, one family at a time, under **Finances** in the sidebar. You see this if you have the **Payments** permission (a super-admin turns it on in Settings → Members).

**The totals** across the top: **Charged** (fees, uniforms and so on), **Taken off** (players the club covers and scholarships), **Paid**, and **Still owed**, with how many families owe.

**Families.** Brothers and sisters who share a parent are one family, with one balance. Each row shows the kids, the parents, and a chip: **Owes $…**, **Paid up**, or **Credit $…** when they've paid more than they owe. Use **Owes**, **Paid up** and **All** to filter, and the search box to find a family by player, parent, email or phone. Tap a family to open it. In an open family, a parent's name opens their profile and a player's name opens their player page.

**Registration fees.** When registered players don't have their fee yet, a bar says how many. Tap **Add registration fees** to charge each one the fee for their tier on the registration ($375 for 8u–12u, $400 for 14u, $525 for 16u–18u). It's safe to tap again: nobody is charged twice. A player whose registration has no tier is listed so you can add theirs by hand. Registrations approved from now on get their fee automatically.

**In an open family:**

- **Record payment** — enter the **Amount**, the date it was **Paid on**, **How they paid** (Venmo, check, cash, card), and a **Check number** or **Reference** so you can match it later. One Venmo for three kids is one payment: it's split for you, paying off each kid in turn. Tap **Change the split** to set each kid's share yourself.
- **Add a charge** — a **Uniform**, a **Tournament**, a **Refund paid out**, or **Other**. Tick the kids it's for; each gets the full amount.
- **Take off an amount** — **Covered by the club** (a hardship the board voted on), a **Scholarship**, or an **Adjustment** to fix a mistake. Put the date of the board vote in the **Note**.
- **Void** — nothing is ever deleted. Voiding crosses a line out and takes it off the balance. Enter it again if it was wrong. **Show voided** brings voided lines back into view.

**Families can see** each line's description and note, so write them for the family.

**Parents can see their balance** is off to start with, so you can enter the season's payments first. Switch it **On** and every family sees their own balance under **Payments** in their sidebar, with how to pay. Nobody sees another family's.

**Download spreadsheet** saves every charge, credit and payment as a CSV file for Excel or Google Sheets. Charges are positive; credits and payments are negative, so the Amount column adds up to what's still owed.`,
  },
  {
    id: "payments-venmo",
    title: "Matching Venmo",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["venmo", "statement", "match", "import", "csv", "record payments"],
    body: `Record a month of Venmo payments at once. On **Finances**, tap **Match Venmo** and pick the statement you downloaded from Venmo (Statements → download as CSV).

- Each payment that came in is listed with who sent it, the note and the amount. Where the note names a player (or the sender's last name and a player's first name), that player is filled in. Siblings named together are both filled in.
- Fix any guess: tap **×** to take a player off, or pick one from **+ player**. Untick any you don't want to record.
- **Record** records each one like **Record payment** does, split across the family's players by what each owes, with the Venmo number in its reference. A payment already recorded from a statement shows **Already recorded** and can't be recorded twice.`,
  },
  {
    id: "payments-budget",
    title: "Budget: what the club spends",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["budget", "expenses", "payables", "import", "spreadsheet", "excel", "spending", "check", "check number", "vendor", "gym rent", "insurance", "tournament", "regionals", "hotel", "refs", "league", "deposit", "over budget", "split across team", "team cost", "mrs", "tournament we host", "groups"],
    body: `Everything the club plans to spend and what it has paid, in place of the spreadsheet's Payables. On **Finances**, open **Budget**. You see it with the **Payments** permission, while **Track the club's books on Finances** is on in Settings → Fees.

**The totals**: **Budgeted**, **Paid**, **Left to pay** and how many lines are **Over budget**. **Group**, **Team** and **Month** change how the list is grouped; the search box finds a cost, vendor, team or month. Each group starts closed, showing its number of lines and what's paid against its budget; tap it to see the lines. A search opens every group with a match.

- **Add a cost**: pick its **Group** (General, Practice gyms, Teams…), say **What it's for**, and add the **Vendor**, the **Budget** (blank for a cost you didn't plan), the **Month** (for gym rent by month) and the **Team**, clinic or tournament it belongs to.
- Tap a line, then **Record a payment**: the **Amount**, the date, how it was paid and the **Check number**. A deposit now and the rest later are two payments on one line.
- **Split across team** passes a cost on to a team's families: pick the team and the players, then **Split the total** or charge the **Same amount each**. Each player gets a **Team cost** charge on their family's account.
- **Edit** changes a line; **Void** crosses it out (void its payments first). Nothing is deleted.
- **Groups** renames groups and adds new ones. **Tournaments we host** adds a tournament the club runs, like MRS, so its costs and income add up on their own. **Edit** changes its name, first day, last day, note or **Tournament plan** (this season's weekends ticked **We host this tournament** on the HS Schedule). A plan already linked to another tournament here stays with that one until you unlink it. A linked row says **Open its plan**. **Delete** removes one that has no costs, income, invoices or HS Schedule plan (void those or unlink the plan first). A plan's **Money** tab puts its estimate here with **Put it in the budget** (search **MRS** to see those lines).
- **Import spreadsheet** brings in this season's spreadsheet: Payables, Receivables, the workouts and clinics sheets and Nelson's Produce. It shows what it will add, asks about any team or Nelson's worker it can't match (each worker's money goes to the player you pick first, then on to their brothers once that player's paid), and checks the Regular Season sheet against Payments before you tap **Import**. Afterwards it can also **Add uniform charges** for the jerseys and shorts on Regular Season (a Uniform charge each, like "Jersey (AM)", at the prices you enter), and **Match payments to the sheet**: what Regular Season says was paid (less Nelson's, which comes in as credits) that Payments doesn't have yet, recorded as a payment "From the spreadsheet". Both skip what's already there (a plain "Uniform" charge counts as the jersey and shorts). If an earlier run charged a jersey and shorts on top of someone's own uniform charge, **Remove duplicate uniform charges** takes the import's off. For the sheet's "CK" players still charged registration, **Take their fee off** adds a Coach's kid credit for the whole fee. **Balances that differ from the sheet** lists each family that owes a different amount here than the sheet's Amount Due, with what each side counts for every player, so you can find the difference. **Undo the import** takes back only what it added.`,
  },
  {
    id: "payments-income",
    title: "Income: money in from outside families",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["income", "receivables", "donation", "sponsor", "admissions", "tournament", "mrs", "shirts", "warm-up shirts", "merch", "vendor credit", "expected", "it came in"],
    body: `Donations, sponsors, the tournament we host, shirts sold and credits from vendors: money that isn't a family's payment. On **Finances**, open **Income**.

- **Add income**: pick **What kind**, who it's **From**, and what **Came in** with the date, how and a check number. Put an amount in **Expected** too, or alone for money you're still waiting on (like MRS registrations); tap **It came in** when it does.
- Income is listed by kind, closed to start: each shows its number of entries and total. Tap one to see the entries.
- Link it to a **Tournament we host** or a clinic so the Snapshot shows what each made, or to a fund like the General program fund.
- **Void** crosses one out.`,
  },
  {
    id: "payments-programs",
    title: "Programs: clinics and workouts",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["programs", "clinics", "summer clinics", "workouts", "spring workouts", "krave", "camp", "sign up", "sign-up", "cognito", "price", "junior high", "high school", "mark paid", "open", "closed", "nelson's", "nelsons produce", "covered by nelson's", "np", "waived"],
    body: `Clinics, spring and summer workouts and camps, with their own sign-up page in place of Cognito. On **Finances**, open **Programs**.

- **Add a program**: its name, kind, dates, when and where, what families read, and its prices (one price, or one per group like Junior high $60 and High school $100). **Room for** closes sign-up when it's full.
- Switch it **Open** and families sign up at its page; **Copy sign-up link** copies the address. An open clinic also takes over the **Summer** page's button.
- A player on this season's roster gets the fee on their family's account. Anyone else shows **Owes** on the sign-up until you **Mark paid** (or **No charge**).
- Paid from Nelson's Produce earnings: tap **Change** and pick **Nelson's credit** (roster players only). The fee goes on the family's account, where their Nelson's credit pays it, and the sign-up shows **Covered by Nelson's**. The spreadsheet import does this for its NP sign-ups.
- Costs you link to it on the Budget tab show what it made. **Finished** puts it away when it's over.`,
  },
  {
    id: "payments-fundraising",
    title: "Fundraising: Nelson's Produce shifts",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["fundraising", "nelson's", "nelsons produce", "shifts", "hours", "festival", "tulip", "strawberry", "sunflower", "buckets for bucks", "program fund", "credit", "registration", "np", "no payment needed"],
    body: `Shifts worked at a fundraiser like Nelson's Produce. On **Finances**, open **Fundraising**.

- **Log a shift**: the **Fundraiser**, the **Event** (Tulip Festival), the date, **Who worked**, the **Hours**, and **Earned** (blank works it out at the fundraiser's rate).
- **Where it goes** is the worker's choice: **Toward registration** puts a **Fundraising credit** on the player's family account, or the **General program fund** adds it to the club's general fund instead (where Buckets for Bucks money goes too). A name you've logged before starts from their last choice.
- **Then the rest of the family** (on to start): once that player owes nothing, the rest goes to their brothers, a credit for each, like Sarah Wesner's shifts going to Luke until he's paid and then to Nate.
- Shifts are listed by event, closed to start: each shows its number of shifts and total. Tap an event to see who worked.
- **Change** moves a shift to another player or the fund: the old credit is voided and a new one posted. **Void** takes a shift off.
- A family whose credits cover everything sees **No payment needed** on their balance.
- **Buckets for Bucks** is a fundraiser too, with no hourly rate: pick it, put what was raised in **Earned**, and send it to the **General program fund**.
- **Fundraisers and funds** sets what an hour earns and adds new fundraisers or funds.`,
  },
  {
    id: "payments-snapshot",
    title: "Snapshot: the club's money at a glance",
    group: "Finances",
    audience: "staff",
    permission: "finances_view",
    preview: true,
    keywords: ["snapshot", "financial snapshot", "club finances", "money in", "money out", "budget vs actual", "net", "board", "coaches", "see club finances", "report", "accountant", "expand all", "collapse all", "print", "pdf", "board meeting"],
    body: `The whole season in one page: **Money in**, **Money out**, whether the club is **Ahead** or **Behind**, and what families **still owe**. Then spending against the budget by group, each team's costs (and what was passed on to families), each clinic, the tournament we host, fundraising and the funds. Totals only: no family names or balances.

Each block starts folded. The heading shows the name and the total — spent against the budget (for example **$1,250.00 of $2,300.00** and the small bar) when that block has a budget. Tap the heading to open the detail, or tap it again to fold it. **Expand all** opens every block; it turns into **Collapse all** when they're all open.

The board sees it under **Finances → Snapshot**, and so does anyone given **See club finances** in Settings → Access Profiles, like a coach. The Treasurer sees it as a tab next to the rest. **Print / PDF** opens the print dialog with every block open, the club name, **Finance Snapshot**, and the date at the top — print it or save it as a PDF for a board meeting. **Download spreadsheet** saves it for the accountant.`,
  },
  {
    id: "payments-invoices",
    title: "Finances: invoicing other programs",
    group: "Finances",
    audience: "staff",
    permission: "invoicing",
    alsoPermissions: ["payments", "finances_view"],
    routes: ["/portal/payments/invoices"],
    keywords: ["invoices", "invoice", "bill programs", "team fee", "deposit", "venmo", "check", "mark as paid", "reminders", "overdue", "partial", "co-host", "gym share"],
    body: `Bills to **other programs** — team fees when we host a tournament, a co-host split, a gym share — under **Finances → Invoices**. Family balances stay on **Families**. Whoever holds President, Athletic Director, or Treasurer in Settings → Planning Roles (plus super admins) can invoice. The **Invoicing** box on an access profile or a person's extras is a manual override. The board, **Payments**, and **See club finances** can open the list; send, **Mark as paid**, reminders and **Void invoice** stay locked unless you can invoice. A coach without those grants is sent back to **Finances** / **Payments** — they don't see the list.

**The list.** Open, overdue, collected and drafts across the top. Filter **All**, **Draft**, **Sent**, **Viewed**, **Partial**, **Paid**, **Overdue** or **Void**. **+ New invoice** writes one by hand. An event card shows how much of that weekend is in, with a link to its invoices.

**An invoice.** Line items, total, an optional **Deposit** with its own due date (it can't be more than the total), and the **Balance due**. Status is **Draft**, **Sent**, **Viewed**, **Partial**, **Paid**, **Overdue** or **Void**. **Send invoice** emails every address on file for the program (Venmo and check instructions, not a card) from the club's domain, with the club Gmail as reply-to. It stays **Draft** if the email doesn't go out. **Mark as paid** records Venmo or check, the amount, the date and a reference; a deposit and the rest are two payments. **Void invoice** takes it off billed and collected totals. **Reminders** have a club default (anyone with invoicing can change it) and an optional **Custom for this invoice**. **CC and BCC** are the same: club default, optional override, either list can be empty.

**From a tournament we host.** On the plan, **Bill programs → Finance** is for anyone with **Invoicing**. Coaches and the board who plan the tournament still open the full plan; someone with only **Invoicing** (no HS Schedule edit) does not see teams, money, or sent emails — they get a **Bill programs → Finance** link instead. It previews one invoice per program (team counts from the **Teams** tab; they aren't editable on this page). A program that already has a sent invoice is marked **already billed** and isn't in **Send all N**. **Save all 0 as drafts instead** stays off when there's nobody left to bill. If invoices don't load, the page says so and **Send** / **Save** stay off. Optional deposit, then **Save all N as drafts instead** or **Send all N**. **Set team fees and bill each program** can be ticked by hand to lock the team fee; invoices tick it too. **Invoices sent** ticks itself. **Team fees collected** shows **Not billed yet** until an invoice is sent (drafts alone don't count), then how much is in of the total, and has **View in Finances →**. See *Tournaments we host*.`,
  },
  {
    id: "payments-messages",
    title: "Finances: emailing and Slacking families",
    group: "Finances",
    audience: "finance",
    preview: true,
    keywords: ["email", "slack", "message", "families", "remind", "reminder", "balance", "{balance}", "{due_date}", "owe", "owes", "bot", "slack bot", "pause", "payment plan", "template"],
    body: `Write to families about what they owe, from **Finances** (the **Payments** permission).

- **Email families** and **Slack families** (next to **Download spreadsheet**) write to every family the list shows right now: pick **Owes**, **Paid up** or **All**, or search, first. In an open family, **Email family** and **Slack family** write to just them.
- **Email** works like the Directory's: pick who gets it (Dads, Moms, Guardians, Players), then tick the families themselves (every family is ticked to start; **Select all / none** ticks every family or none), start from a **Template** if you like, and send. One email per family, from the club's email address; replies go to the club's Gmail.
- **{balance}** becomes what the family owes, **{due_date}** their due date, **{family}** their last name and **{player}** their players' names. A preview shows how it reads for the first family.
- **Slack** sends each person their own direct message. **From** picks **Me** (your own Slack: connect it once, and replies come to you) or **The club's Slack bot** (nobody reads replies to the bot, so say in the message how to reach you). In Slack messages, **{name}** is each person's first name.
- A copy of every email and DM is kept on the players' pages under **Messages sent**, for the whole family.
- **Weekly reminder** in an open family: untick it to take the family off the weekly balance reminder (a payment plan, say); they show **Paused** until you tick it again. Set the reminder up in **Settings → Fees**.`,
  },
  {
    id: "your-balance",
    title: "Your balance",
    group: "Payments",
    audience: "everyone",
    routes: ["/portal/payments"],
    keywords: ["payments", "balance", "owe", "fees", "registration fee", "paid", "venmo", "check", "pay", "receipt", "uniform"],
    body: `**Payments** in the sidebar shows what your family owes for the season and what you've paid. It appears once the Treasurer has your balance ready.

- The big number at the top is what's **due**, or **Paid in full** once you're square.
- **Charges and credits** lists each fee for each of your kids, like the registration fee or a uniform, and anything taken off. Tap a player's name to open their player page, which shows the same balance.
- **Payments** lists what the Treasurer has recorded from you, with the date and how you paid.

**To pay,** Venmo the club and put your player's name in the note, or pay by check. A payment shows here once the Treasurer records it, so it may take a few days. Questions about your balance? Email the club at the address on the page.`,
  },
  {
    id: "signed-in-devices",
    title: "Signed-in devices",
    group: "Signed-in devices",
    audience: "super_admin",
    routes: ["/portal/devices"],
    keywords: ["signed-in devices", "phone", "QR", "pair", "car", "revoke", "sign out", "approve"],
    body: `**Signed-in devices** lists screens you signed in with **Sign in with phone** — a car browser, for example. Open it from the sidebar.

Each row shows the device, city and IP, when it signed in, and when the 12-hour session ends. **Sign out** ends that one; **Sign out all devices** ends every phone-paired session. Slack, email and password sessions on your other devices are left alone.

On the phone, after you tap **Approve**, you'll see **Device signed in** and a **Sign it out** button. You'll also get an email when a device is approved, with a link back here.`,
  },
  {
    id: "slack-archive",
    title: "Archives: Slack",
    group: "Archives",
    audience: "everyone",
    routes: ["/portal/archives/slack", "/portal/slack-archive"],
    keywords: ["slack", "archive", "archives", "messages", "channels", "threads", "history", "private", "jump to date", "filter", "link", "attachments", "files"],
    body: `**Archives** in the sidebar has three tabs: **Slack**, **Email** (board only), and **Album**. This is the Slack tab — the full history of the club's Slack channels, updated every night, so nothing gets lost when Slack hides older messages.

Old links to Slack Archive still work. They open here, and a link that pointed at one message (\`#msg-…\`) still jumps to that message.

**Which channels you see.** Every public channel, plus the private channels you're a member of in Slack. That's matched by email, so your portal email needs to be the same one you use in Slack.

**Reading a channel.** Pick a channel from the list (or switch with the drop-down at the top of a channel).

- Messages are grouped by day, with each thread's replies tucked under the first message.
- Messages look the way they do in Slack: bold, italics, line breaks, bullet lists, quotes and code.
- A mention of a private channel shows as #private-channel, except in that channel's own messages.
- **Newest first / Oldest first** flips the order.
- **Jump to date** opens a calendar — tap any highlighted day to go straight there.
- **Filter** shows only the threads a certain person posted in.
- Photos and videos show right in the message: tap a photo to see it full size, or tap ▶ to play a video. Audio clips open in a preview, and other files open in a new tab. Files linked from outside Slack, like Google Docs, show a ↗ and open where they're kept.
- The **link** icon on a message copies a direct link you can share. Opening one (or **View in conversation** in the Photo Album, or a search result) takes you to that message, highlighted in yellow.
- **Photos →** opens the Photo Album for just that channel.
- Board members and people with the **Registrations** permission also see **Save to notes** on each message, to copy it (or a whole thread) into a player's notes. See *Notes on players*.`,
  },
  {
    id: "slack-archive-search",
    title: "Searching the Slack Archive",
    group: "Archives",
    audience: "everyone",
    routes: ["/portal/archives/slack/search", "/portal/slack-archive/search"],
    keywords: ["slack", "search", "find", "message", "exact phrase", "quotes", "exclude", "user", "channel"],
    body: `Find an old message. Open **Search archive →** from Archives → Slack.

- Type words to find messages with all of them. Put **"an exact phrase"** in quotes, and put a minus in front of a word (**-hotel**) to leave it out.
- Narrow it down with the **Channel** and **User** pickers — or leave the text empty and pick a person to see everything they've posted.
- Results show the newest 200 matches. **Jump to message ↗** opens the message in its conversation.
- **Clear all** starts over.

Quick lookups work from the top-bar search too — Slack messages show up there under **Slack**.`,
  },
  {
    id: "slack-archive-album",
    title: "Photo Album",
    group: "Archives",
    audience: "everyone",
    routes: ["/portal/archives/album", "/portal/slack-archive/album"],
    keywords: ["photos", "pictures", "videos", "album", "gallery", "download", "month", "slideshow", "gif"],
    body: `Every photo and video shared in the Slack channels you can see, arranged by month. Open it from the **Album** tab, or the **Photo Album** card on Archives → Slack.

- **Search** captions, people, channels or a month (e.g. "june 2024").
- Show **All**, just **Photos** or just **Videos**, and narrow by **Channel** or **People**.
- **Jump to month** skips straight to a month; **Newest first / Oldest first** flips the order.
- Tap a photo to open it full-screen. Use the arrows (or ← and → keys) to move through them, **Show details** to see the caption and who posted it, **View in conversation** to see the Slack thread (the message is highlighted in yellow), and **Download original** to save it.
- Your filters stay in the page address, so you can bookmark or share a filtered view.

If the page has been open a long time and pictures stop loading, tap **Reload previews**.`,
  },
  {
    id: "archives-email",
    title: "Archives: Email",
    group: "Archives",
    audience: "staff",
    routes: ["/portal/archives/email"],
    keywords: ["email", "gmail", "archive", "thread", "attachment", "board meeting", "agenda", "import"],
    body: `Copies of emails the board has referenced, so everyone can open them without Jeff's Gmail. Open **Archives → Email**. Board only.

- The list on the left is archived threads. **Search emails…** looks at subject, snippet and people. **Linked to** narrows to a board meeting; **Source** is which mailbox it came from.
- Tap a thread to read it. You'll see who it was from, the body, any attachments, and **Linked from** chips that open the board meeting that cited it.
- On a board meeting, **Linked emails (archived)** in the right column opens the same threads. An email-looking link in the agenda also goes here, not to Gmail.

Jeff's agent copies a thread in. There is no "upload an .eml" button on this page.`,
  },
  {
    id: "slack-archive-admin",
    title: "Managing the Slack Archive",
    group: "Archives",
    audience: "super_admin",
    routes: ["/portal/archives/slack/exceptions", "/portal/slack-archive/exceptions"],
    keywords: ["slack", "add channel", "channel id", "sync", "sync now", "refresh access", "deactivate", "exceptions", "errors", "previews", "compress", "large files"],
    body: `Super-admins choose which Slack channels are archived and keep an eye on the nightly sync.

- **+ Add channel** — give it a label and its Slack channel ID (in Slack: open the channel → View channel details → the ID is at the bottom).
- Each channel shows when it last synced and who can see it. **Deactivate** stops syncing a channel; its history stays browsable.
- **Refresh access** re-checks private-channel membership with Slack right away (it also happens every night).
- **Sync now** on a channel pulls in its newest messages without waiting for tonight — click again if it says there's more to catch up. It also fills in channel names that older messages are missing (every sync does), and says how many it fixed.
- **View all exceptions →** lists channels whose sync failed, attachments that didn't download, and videos too big to store (with **Compress large files now**).
- In the Photo Album, **Make previews now** creates any missing thumbnails.`,
  },
  {
    id: "activity",
    title: "Activity and Preview as",
    group: "Activity",
    audience: "super_admin",
    // Staged rollout: only the accounts that can open Activity read this.
    preview: true,
    routes: ["/portal/activity"],
    keywords: ["activity", "usage", "stats", "statistics", "sign-ins", "logins", "last seen", "sessions", "page views", "who's using", "audit", "trail", "preview as", "view as", "impersonate", "see what they see", "exit preview"],
    body: `Who's using the portal and how. It's in **Settings → Members**: the **Activity** tab, and each person's row on **Approved**. Only you can see it for now — not other super-admins.

**At a glance.** On **Approved** and **Activity**, the tiles count **Sign-ins · 7 days**, people **Active · 24 hours** and **Active · 7 days**, and **Previews · 30 days**.

**The Activity tab.** **People each day** charts how many members opened the portal each day for the last 30 days — hover over (or tap) a bar for that day's numbers. **Most visited pages** lists the pages people open most, and **Previews** lists every preview.

**Each member.** With activity on, **Approved** lists the most recently seen first. Under each name: when they were **Last seen** and the page they were on, and their sessions in the last 30 days — or **Never signed in**. Change their access profile from the same row.

**Sessions.** Tap **Activity** on a member's row to see their sessions each day for the last 30 days and their latest sessions: when, how many pages and how long. Tap a session to see every page they opened, in order, with how long they stayed on each (a long gap shows as **idle**), or **All sessions →** for every one, with the device. **Members · Activity** at the top of those pages takes you back.

**Preview as.** Tap **Preview as** on a member's row, then **Start preview**, to see the portal exactly as they do — the same pages, buttons and players. It's the quickest way to check what a parent or coach can see.

- A yellow bar across the top reminds you who you're previewing. Tap **Exit preview** to go back to your own account.
- **Anything you change during a preview really happens, as them** — so look, don't touch. The Audit Log credits those changes to you ("Jeff Malone (as Pat Smith)").
- A preview ends by itself after 2 hours. **Sign out** during a preview ends it and signs you out.
- You can preview anyone with a portal login, other super-admins included — but not yourself, or people who are waiting for approval or have had their login revoked.
- You can also preview someone marked **Not signed up**. The first preview sets up their portal login (no email goes out), and it's theirs when they sign in with that email. It has no password yet, and they don't need to know it was set up: **Continue with Slack**, **Email me a sign-in code** and **Request access** all work as usual (Request access emails them a code to confirm it's them, then saves the password they chose). After that, Settings no longer shows them as **Invited**. Members with no email (**Directory only**) can't be previewed.
- While you're previewing, activity is hidden (you're seeing exactly what they see) and you can't start another preview until you exit.

**Previews** lists every preview — who previewed whom, when and for how long — and each one's pages show in that member's sessions, marked **Preview**. Previews don't count toward a member's own sign-ins or last seen.

Activity is recorded from the day it went live.`,
  },
  {
    id: "admin-roles",
    title: "Board roles",
    group: "Settings",
    audience: "staff",
    keywords: ["admin", "super-admin", "super admin", "board", "building committee", "role", "permission", "access", "who can"],
    body: `There are three kinds of account. On top of that, a super-admin can give anyone extra permissions, like **Payments**, through an access profile or one at a time (see *Settings: Access Profiles*). A "With **Payments**" in the table means someone who has that permission.

| | Member | Board | Super-admin |
|---|---|---|---|
| Directory, Playbooks, Archives | ✓ | ✓ | ✓ |
| See every player, fees, waivers and volunteer interests | With **See all players** | ✓ | ✓ |
| Member notes on profiles | With **Member notes** | ✓ | ✓ |
| External Contacts: add, edit, history | With **External Contacts** | ✓ | ✓ |
| Approve or deny access requests | With **Approve access requests** | ✓ | ✓ |
| Check players off on requirements (handbook signature, fees) | With **Check off requirements** | ✓ | ✓ |
| Plan the HS Schedule | With **Plan HS Schedule** (coaches always) | ✓ | ✓ |
| Set up requirements in Settings | | With **Settings: Edit** | ✓ |
| Every family's balance; record payments | With **Payments** | With **Payments** | ✓ |
| Bill other programs (team fees, invoices) | Planning Roles holder, or **Invoicing** | Planning Roles holder, or **Invoicing** | ✓ |
| Review new registrations; put players on teams; edit and remove players | With **Registrations** | With **Registrations** | ✓ |
| Add and edit the hotels and places to eat in External Contacts; hotel stays on the HS Schedule; track Booked in block; import a rooming list in Settings | With **Travel** | ✓ | ✓ |
| Send families Slack DMs from the Directory, as yourself | With **Slack DMs** | With **Slack DMs** | ✓ |
| Change the club website's menu, page text and pictures | | With **Settings: Website** | ✓ |
| Add, edit and remove members; change roles | | | ✓ |
| Set up teams and volunteer roles; assign volunteers | With **Teams & volunteers** | With **Teams & volunteers** | ✓ |
| Change the sidebar links and the public Directory link | With **Sidebar Links & Public Directory** | With **Sidebar Links & Public Directory** | ✓ |
| See game film uploads and download them | With **Game film** | With **Game film** | ✓ |
| Mark game film moved or delete it | With **Game film (manage)** | With **Game film (manage)** | ✓ |

**Coaches** (a member in a leadership volunteer role on a team, like Head coach) also plan the **HS Schedule** with the board, and read the External Contacts types shared with them (a super-admin ticks **Coaches can see** in **Settings → Contact Types**), without changing them.

**Board extras around the portal**

- The **Directory** shows every player — including families who asked not to be listed (marked **Not in directory**) — plus **No waiver**, fee and shirt details, and each parent's volunteer interests (**Can help**). **Not signed up** and **Awaiting approval** chips show which parents don't have access yet.
- Each player also has a chip for every requirement, like the handbook signature — see *Player requirements*, with the Directory sections.
- Every profile has a **Member notes** panel only the board can see. Type a note and tap **Save notes**.`,
  },
  {
    id: "settings-members",
    title: "Settings: Members",
    group: "Settings",
    audience: "staff",
    permission: "approve_members",
    routes: ["/portal/settings"],
    keywords: ["settings", "menu", "find a setting", "members", "approve", "deny", "pending", "access request", "badge", "not signed up", "restore", "invite", "add member", "role", "revoke", "login", "family", "spouse", "parents", "children", "grants", "payments", "treasurer", "registrations", "manages", "slack dms", "slack", "website", "access", "permissions", "roles & access", "table", "profile", "access profile", "extras"],
    body: `Where new sign-ups are approved and member accounts are managed.

**Finding your way around Settings.** The menu down the left side sorts Settings into groups: **People & Access**, **Facilities & Equipment**, **Work & Events**, **Communication**, **Website & Portal** and **System**. Type in **Find a setting…** at the top to narrow the menu (try "email" or "roles"), and press Enter to open the first match. The address bar keeps the page you're on, so you can bookmark it or send someone the link. On a phone, the bar at the top names the page you're on; tap **Change ›** to open the full menu, then pick a page or tap **Done**.

**The red badge** on **Settings** in the sidebar counts access requests waiting for you.

**Reviewing requests.** The **Pending** tab lists people who have signed up and asked for access.

- **Approve** lets them in and emails them a sign-in link.
- **Deny** turns them away. They'll see **Access not granted** if they try to sign in.
- Changed your mind? On the **Denied** tab, **Approve** them or **Restore to pending**.
- **Not signed up** lists parents from player registrations who haven't created a login yet. Approving one ahead of time lets them straight in when they sign up.
- Use the search box to find someone by name or email; **Approved** lists everyone with access.

**Super-admins can also:**

- **+ Add member** — set someone up ahead of time. With an email, they finish by requesting access with that email. Leave the email blank to add a **directory-only** entry (a grandparent, say) who won't sign in. Pick their **Access profile** there too: **Member** to start, **Board**, one of your own profiles like Treasurer, or **Super-admin**.
- **Edit** anyone's profile: name, nickname, phone, birthday, photo and email, plus their **Family** links (spouse, parents and children). The same **✎ Edit** is on each member's Directory profile.
- Pick someone's **access profile** from the drop-down on the **Approved** tab: **Member**, **Board**, any profile the club has made (like Treasurer), or **Super-admin**. The profile sets whether they're Board and what they can manage (see *Settings: Access Profiles*). Picking a new one replaces what they had, extras included.
- **Revoke login** to take away someone's access while keeping them in the directory, and **Restore login** to give it back.
- Tap **Access** on someone's row on the **Approved** tab to see what they can do. The number on the button counts it, and the row lists it under their name. Greyed ticks come from their profile; change those in **Settings → Access Profiles**. Tick any other box to give that one person an **extra** on top of their profile, untick to take it away. Rows with extras show **+ extras**, and rows on a profile the club made show its name.
  - **Can manage** (members and board alike): **Payments** to see every family's balance and record payments (the Treasurer, and anyone helping them), **Invoicing** to bill other programs (team fees, co-host splits, gym shares) by Venmo or check, **Registrations** to review new registrations, put players on teams and edit players, **Travel** for the travel coordinator to add and edit hotels and places to eat in External Contacts, set up **hotel stays** on the HS Schedule (booking instructions and who must register), mark **Booked in block** in the Directory, import a hotel **rooming list** in Settings → Import, and email or Slack families about travel, **Slack DMs** to send families Slack DMs from the Directory as themselves (see *Slack DMs to families*; Travel includes this too), **Game film** to open **Film** and download videos families uploaded, and **Game film (manage)** to mark those videos moved or delete them and to open **Settings → Film** (team upload codes). A person can also be a **video manager** for one team in Settings → Film, without the club-wide permission.
  - **Settings (Board)** (board members only): **Edit**, **Delete** and **Undelete** for Settings items like Requirements, and **Website** to change the club website's menu, page text and pictures (see *Settings: Website*).
  - **Board powers** (for people who aren't Board; Board has them all): **See all players** (every player, listed or not, with fees, waivers, shirts and parents' details), **Member notes**, **Check off requirements**, **Approve access requests**, **External Contacts** (see, add and edit every contact, and their history) and **Plan HS Schedule**.
  - **Club setup** (anyone): **Teams & volunteers** to set up teams and volunteer roles and fill team spots (putting someone in a leadership spot makes them a coach), and **Sidebar Links & Public Directory**.
  - Every approved member opens **Settings** and sees **Release Notes**. Someone who isn't Board but has **Approve access requests**, **Teams & volunteers**, **Sidebar Links & Public Directory** or **Travel** also sees those tabs.
  - Super-admins have all of these already, so their rows have no **Access** button.
- To see everyone at once, tap **Roles & access** (next to the tabs, on **Approved**). It's a table with a row per person: their profile drop-down, then a box for each permission. Greyed ticks come from the profile; tick or untick any other box to change that person's extras. The number under each column says how many people have it. Super-admins show ✓ everywhere, and **–** means that box is for board members only. Tap **List** to go back.
- **Remove** a member (demote a super-admin first).

Chips on a row: **You**, **Invited** (has an email but hasn't signed up), **Directory only** (no email), **No login** (access revoked).`,
  },
  {
    id: "settings-access-profiles",
    title: "Settings: Access Profiles",
    group: "Settings",
    audience: "super_admin",
    keywords: ["access profiles", "profile", "profiles", "permissions", "access", "treasurer", "registrar", "travel coordinator", "power user", "role", "board", "member", "extras", "bundle"],
    body: `An access profile is a named set of permissions you hand someone in one step, like **Treasurer** (Payments) or **Registrar** (Registrations and Slack DMs). Open **Settings → Access Profiles**. Super-admins only. Whoever holds President, Athletic Director, or Treasurer in Settings → Planning Roles (plus super admins) can invoice; tick **Invoicing** on a profile only as a manual override.

- **Member** and **Board** are built in. Everyone starts on one of them: Member for members, Board for the board. Tap **Edit permissions** to choose what everyone on it gets. They can't be renamed or deleted.
- **+ New profile** makes your own. Give it a **Name** and choose what it's **Based on**: **Member**, or **Board** if the people on it should be Board too, with everything Board can do (see *Board roles*). Then tick its permissions.
- A Member-based profile can also hand out **Board powers** one at a time, like **See all players** or **Approve access requests**, for power users who aren't on the board. **Club setup** (Teams & volunteers; Sidebar Links & Public Directory) works on any profile.
- Each profile lists what it gives and how many people are on it. **Edit permissions** opens its boxes; tap **Done** to close them.
- Changes reach everyone on the profile straight away. Take **Payments** off Treasurer and every treasurer loses it.
- On your own profiles, the **Based on** drop-down switches between Member and Board, **Rename** changes the name and **Delete** removes it. The people on a deleted profile move to Member or Board, whichever it was based on.
- **Super-admin** isn't a profile you can change: super-admins can do everything.

Put someone on a profile with the drop-down on their row in **Settings → Members**. To give one person something their profile doesn't have, tick it in their **Access** panel there; it's an **extra**, just for them.`,
  },
  {
    id: "settings-teams",
    title: "Settings: Teams",
    group: "Settings",
    audience: "super_admin",
    permission: "teams",
    keywords: ["teams", "settings", "new team", "age group", "color", "colour", "division", "practice times", "practice location", "season", "delete team"],
    body: `Set up this season's teams. Open **Settings → Teams**. Super-admins can, and so can anyone with the **Teams & volunteers** permission.

- **+ New team** — give it a **Team name** (e.g. Gold), then pick an **Age group** (10U–18U) and **Team color**, and add the **Division**, **Practice times** and **Practice location**. Separate more than one practice time with a semicolon.
- Tap the **pencil** to edit a team, or the **trash** can to delete one — its players go back to **No team yet** and its volunteer spots are cleared.
- **Staff & volunteers →** opens the team's page in the Directory, where you assign coaches and volunteers.

What you enter here shows on the team's Directory banner and team page. Players are put on teams in the Directory, with the team chip on each player.`,
  },
  {
    id: "settings-film",
    title: "Settings: Film",
    group: "Settings",
    audience: "super_admin",
    permission: "film_manage",
    keywords: ["film", "game film", "upload code", "team code", "video managers", "rotate", "slug", "/t/", "copy", "upload link", "youtube", "playlist", "connect youtube", "unlisted", "privacy", "public", "private", "template", "slack", "sparky", "lineup"],
    body: `Turn Directory teams on for family uploads and set each team's code. Open **Settings → Film**. Super-admins can, and so can anyone with **Game film (manage)**.

These are the same teams as **Settings → Teams**, not a second list.

- **YouTube** — **Connect YouTube** signs in with the Google account that owns the Omaha Lightning channel (once). The refresh token is stored encrypted on the server, never shown. New family uploads then go to that channel in the background, and into that team's playlist if one is set. **Privacy** starts as **Unlisted**; **Private** and **Public** are there too — that is the default for *new* uploads. **Film** shows each video's real privacy from YouTube, which can be **Private** even when this default is Unlisted. **Made for kids** is off unless you check it. **Disconnect YouTube** stops new uploads from going up. Unverified Google apps often force videos to private until Google audits the app. Playlists need the extra Google **YouTube** permission — add it under Data Access on the consent screen, then **Disconnect YouTube** and **Connect YouTube** again.
- **YouTube playlist** on each team — paste a playlist link or id (the list= value), or **Or pick from the channel** if YouTube is connected. **Save playlist**. **Open playlist** checks the link. Leave blank for none. New film for that team is added after the YouTube upload finishes. A playlist miss does not mark the upload failed.
- **YouTube title template** and **YouTube description template** — each team has its own. Placeholders fill in when a video goes up: {dot} {team} {opponent} {date} {result_line} {our_score} {their_score} {youtube_link}. {dot} is 🟢 on a win and 🔴 on a loss; it is left off on a tie or when there is no score. {result_line} is **Congrats on the win!** or **Better luck next time!** (that line is left off on a tie or when there is no score). **Reset to default** puts the club wording back. **Save template** keeps the title, description, extra-line switches, and Slack channel together.
- **Extra lines** are off to start: **Players list** (names from that game's lineup, or the season roster if no lineup is set), **Playlist link**, **Tournament name**, and **Stats book**. When a switch is off, that extra does not appear in the title, description, or Slack text. Tournament name and stats book have no film data yet, so those lines stay empty even when on. Set a lineup with **Who played** on **Film → Edit**.
- **Slack channel ID** — where Sparky posts after someone taps **Approve** on Film. Paste the channel ID (it starts with C), not the #name. Leave it blank and **Approve** stays off.
- **+ New team** adds a Directory team (same as Settings → Teams) so you can give it a film page without leaving this tab. **Rename** changes the team's name everywhere.
- **On** / **Off** shows or hides that team on **/film** and **/t/…**. Turn it on only after a code is set.
- **Upload address** is the end of the family link, like **14u-white**.
- **Upload link** is the full **https://…** address families open (this site plus **/t/** and the upload address). It is shown in full. **Copy** puts that link on the clipboard and briefly says **Copied**. It copies the link only — never the team's code.
- **Set code** lets you type a short word families will remember, like **white14** or **gold14**. We suggest one from the team name and age. **Suggest** fills that in; **Generate code** makes a random one if you'd rather. Use 4–20 letters or numbers, unique across teams, not case sensitive. We store it hashed and **show it once** — copy it now. There is no reveal later. **Rotate code** makes a new one; phones that already unlocked that team have to enter the new code.
- **Video managers** are portal people who can open **Film** and download that team's videos without the club-wide **Game film** permission. They cannot mark moved or delete.

**FILM_SESSION_SECRET** and the YouTube client id / secret / token key stay in Vercel. Team codes do not.`,
  },
  {
    id: "settings-season",
    title: "Settings: Season",
    group: "Settings",
    audience: "staff",
    keywords: ["season", "season end date", "age cap", "age caps", "eligibility", "14U", "12U", "10U", "play up", "conqueror", "max age", "birthday"],
    body: `The season end date and the age caps the Directory uses for eligibility. Open **Settings → Season**. The board can (admin and super-admin).

**Conqueror league rule.** A player at a level cannot turn older than that level's max age at any point of the season, or they have to play up. 8th / 14U cannot turn 15; 6th / 12U cannot turn 13; 5th cannot turn 12; 4th cannot turn 11; 3rd / 10U-ish cannot turn 10.

- **Season end date** — the last day of the season (starts at December 31, 2026). A player ages out of a level if they turn one year over its max age on or before this day. Tap **Save date**.
- **Age caps by level** — each row is a level (14U, 12U, 10U…) and its **Max age**. Max age 14 on 14U means they must not turn 15 on or before the season end date. **Add a level** for a grade (5th, 4th, 3rd) if you place by grade. **Remove** deletes a row. Tap **Save caps**.

The Directory then shows each player's lowest eligible level and flags anyone rostered on a level they age out of. **Available to swing up** on the Directory lists who can move to a team you pick.`,
  },
  {
    id: "settings-volunteer-roles",
    title: "Settings: Volunteer Roles",
    group: "Settings",
    audience: "super_admin",
    permission: "teams",
    keywords: ["volunteer", "roles", "coach", "team parent", "scorekeeper", "video", "photography", "spots", "leadership", "in directory", "assign", "registration answer"],
    body: `The jobs every team can fill — coach, team parent, scorekeeper and so on. Open **Settings → Volunteer Roles**.

- **+ Add role** — name it, say **What they do**, and set **Spots per team**.
- **Registration answer** links the role to a volunteer option on the registration form, so people who ticked it are suggested first when you assign the role.
- **Leadership** — people in these roles (coaches, for example) can switch the Directory to age groups, like the board can.
- **In Directory** — shows the role on the team's banner when someone picks that team in the Directory. Every role always shows on the team's own page.
- Use the arrows to reorder, the **−/+** to change spots, and the switches to turn Leadership and In Directory on or off. Changes save right away.

**Assigning people.** Open a team's page (Directory → **Team page**) and tap **+ Assign** on an open spot. Pick from people who signed up to help with that role, parents on the team, or anyone else. Tap **Remove** to take someone off. Not in the list? Add them in **Settings → Members** first (no email needed), then assign them.

The public Directory lists the same jobs under **By team** and **Coaches & Volunteers**. Coaching roles (a **Leadership** role, or one whose name says coach) stay open on the page. Every other role — Scorekeeper, Clock, Photographer and any role you add here — is inside **Volunteers**, which stays closed until someone taps it. An empty seat says **Open Spot**. Adding a role here is enough; it shows up on that page on its own. The registration form still only asks who is willing to help. It does not show who has the job.`,
  },
  {
    id: "settings-requirements",
    title: "Settings: Requirements",
    group: "Settings",
    audience: "staff",
    keywords: ["requirements", "settings", "handbook", "signature", "hotel", "hotel registration", "booked", "mark complete as", "fee", "tournament fee", "amount", "due date", "applies to", "teams", "retire", "active", "scan upload"],
    body: `Choose what players need to hand in or pay. Open **Settings → Requirements**. Super-admins can always use this tab. A board member can too once a super-admin gives them **Settings: Edit**, through their access profile or their **Access** panel in **Settings → Members**. **Handbook signature** is set up to start. Hotel room blocks are **hotel stays** on each HS Schedule weekend (see *Hotel stays*), not a season-wide requirement here.

- **Add requirement** — give it a **Name** (what the board sees on each player, like Handbook signature) and a **Description** if it helps.
- **Type** — **Task / form** is marked **Done** by default; **Fee** is marked **Paid** and asks for an **Amount**.
- **Mark complete as** — optional word for the green chip and filter (leave blank for **Done** or **Paid**).
- **Due date** is optional, a reminder for the board.
- **Applies to** — **All players**, or **Only some teams** (a tournament fee for one team, say). Tick the teams it covers.
- **Offer scan upload** lets the board attach a copy when they check a player off: scanned with the phone's camera, or a photo or PDF.
- **Active** — untick it to retire a requirement. It leaves the Directory but keeps everyone's record, and you can turn it back on later.

Use the arrows to change the order (it's the order of the chips in the Directory), and the **pencil** to edit. Super-admins, and board members whose **Delete** chip is on, can remove one with the **trash** can.`
  },
  {
    id: "settings-planning-roles",
    title: "Settings: Planning Roles",
    group: "Settings",
    audience: "staff",
    keywords: ["planning", "roles", "president", "athletic director", "treasurer", "communications", "coaches", "held by", "assign"],
    body: `The roles Planning's tasks belong to: President, Athletic Director, Treasurer, Communications and Coaches to start. Open **Settings → Planning Roles**.

- **Add role** gives it a name and a **Chip color** (the color its tasks wear on the calendar).
- **Held by** is who has the role this season. When the board keeps a task in Planning → Review, it's assigned to that person. Leave it as **Nobody named** for a role several people share, like Coaches. Whoever holds President, Athletic Director, or Treasurer in Settings → Planning Roles (plus super admins) can invoice. On those three roles, **Held by** is read-only for the board — only a super-admin can change who holds them.
- **Order** sets the order of the role buttons and of tasks within a month.

Use the **pencil** to edit a role (name, color and order). The **trash** can removes a role that isn't President, Athletic Director or Treasurer; those three stay unless a super-admin removes them. A removed role's tasks stay; they just show without a role.`,
  },
  {
    id: "settings-playbooks",
    title: "Settings: Playbooks",
    group: "Settings",
    audience: "super_admin",
    keywords: ["playbooks", "settings", "categories", "category", "chip", "color", "colour", "sort order", "delete playbook"],
    body: `Keep the playbook categories tidy and see every playbook in one list. Open **Settings → Playbooks**.

- **Categories** group playbooks and set the colour of their label. **Add category** to make one — give it a **Name**, a **Chip color** and a **Sort order** (lower numbers come first). Tap the **pencil** to change one.
- **Playbooks** lists every playbook, newest-updated first. Tap one to open it and edit its content.

Tap the **trash** can to delete a category or a playbook.`,
  },
  {
    id: "settings-email-templates",
    title: "Settings: Email Templates",
    group: "Settings",
    audience: "staff",
    keywords: ["email templates", "templates", "template", "email", "message", "subject", "reuse", "canned", "practice change", "reminder", "{player}", "families", "waitlist", "teams are full", "starts waitlist messages"],
    body: `Emails you send families again and again, written once: a practice change, picture day, a fee reminder. Open **Settings → Email Templates**. Any board member can add, change and delete them.

- **Add template**: give it a **Name** (what you pick from the list; families don't see it), a **Subject** and a **Message**.
- Type **{player}** where the player's first name goes. Brothers and sisters get one email, with their names together (Sam and Evan).
- Tap the **pencil** to change a template, or the **trash** can to delete it. Emails already sent aren't affected.

**The waitlist's message.** **Waitlist: teams are full**, marked **Starts waitlist messages**, is what the waitlist's **Message everyone** and **Send a message** start with. Change its words here and the waitlist uses yours. Delete it and the waitlist goes back to the wording it started with.

**Using one.** When you email families from the Directory, a player's page or the registration waitlist, pick it from **Template**. It fills in the subject and message, and you can change anything before you send. Anyone who can email families can use the templates, including people with the **Registrations** permission who aren't on the board.`,
  },
  {
    id: "settings-registration-emails",
    title: "Settings: Registration Emails",
    group: "Settings",
    audience: "messaging",
    keywords: ["registration emails", "receipt", "confirmation", "code email", "wording", "subject", "what happens next", "sign-off", "reset to original", "registration form"],
    body: `The words in the emails the registration form sends. Open **Settings → Registration Emails**. Every board member can read them; super-admins and anyone with the **Registrations** permission can change them.

- Pick **Registration receipt** (sent to whoever filled in the form, as soon as they send it) or **Email code** (the 6-digit code the form emails first).
- Change the **Subject**, **Headline**, **Opening**, **Note under the fees**, **What happens next** (one step per line, numbered for you) or **Sign-off**, then tap **Save**. The next email uses the new words. **Undo my edits** throws away what you haven't saved.
- **{player}** becomes the players' first names, **{parent}** the first name of whoever registered, **{season}** the season, **{teams}** "a team" or "teams", and in the code email **{code}** the code.
- The **Preview** shows the email for a made-up family as you type.
- Under each field it says whether it's the **Original wording** or when it was changed and by whom. **Reset to original** puts the original back.

The layout, each family's players and fees, and the Venmo and check instructions stay the same.`,
  },
  {
    id: "settings-registration-automations",
    title: "Settings: Registration Automations",
    group: "Settings",
    audience: "registrations",
    preview: true,
    keywords: ["registration automations", "workflow", "switch", "pause", "automatic emails", "ask me first", "off", "on", "approve automatically", "slack invite link", "handbook link", "parent meeting", "first practice", "clinic details", "offer days"],
    body: `The switches for the registration workflow. Only people with the **Registrations** permission can open it.

- **Use the new registration workflow** turns everything on or off. Off, registration works exactly the way it always has. What families already sent is kept either way.
- **Pause all automatic emails** holds every email without changing their switches.
- Each automatic email has **Off**, **Ask me first** or **On**. Everything starts **Off**. **Ask me first** holds each one on the Onboarding tab until someone taps **Send**. Tap **Words** to change an email's subject and words, with a preview for a made-up family. **Reset to original** puts the original words back.
- **Approve families who register from an offer link** and **Approve returning families** approve those registrations without waiting in **New**.
- **Links and dates**: the handbook link (with one, families sign the handbook on the form), the Slack invite link and the day it runs out (you'll get a reminder a week before), how long offer links last, the parent meeting, the first practice and the clinic details. The emails and family checklists use them.

Tap **Save** when you're done.`,
  },
  {
    id: "settings-uniforms",
    title: "Settings: Uniforms",
    group: "Settings",
    audience: "registrations",
    permission: "uniforms",
    preview: true,
    keywords: ["uniforms", "uniform items", "jersey", "shorts", "grays", "warm-ups", "price", "sizes", "try-on", "order deadline", "charge families"],
    body: `The season's uniform items. Open **Settings → Uniforms**.

- **+ Add item**: give it a name, pick **Who gets it** (everyone who needs a uniform, high school grays, or optional like warm-ups), a **Price** (leave it blank until you know) and its **Sizes**, separated by commas. **Edit** changes one; **Remove** takes it off the form and **Put back** returns it.
- **Try-on night**, **Order deadline** and **Charge families** (when you mark the order placed, or when each registration is approved). Tap **Save**.

While the registration workflow is on, families pick a size for each item on the registration form.`,
  },
  {
    id: "settings-fees",
    title: "Settings: Fees",
    group: "Settings",
    audience: "finance",
    preview: true,
    keywords: ["fees", "reminder", "weekly reminder", "balance reminder", "{balance}", "registration fee", "tiers", "8u-12u", "14u", "16u-18u", "coach's kid", "coaches' kids", "comp", "ck", "fundraising rate", "due date", "club finances", "books"],
    body: `What families are charged this season. Open **Settings → Fees** (the **Payments** permission).

- **Track the club's books on Finances** adds **Budget**, **Income**, **Programs**, **Fundraising** and **Snapshot** to Finances, and the clinic sign-up page. Off hides them again; nothing is lost.
- **Registration fees**: each tier's name, the oldest age it covers on the season's cutoff (blank on the oldest tier) and the fee. The registration form suggests the right one by birthday. Families who already registered keep the fee they registered at.
- **Comp coaches' kids**: a head or assistant coach's player keeps the fee on their account with a **Coach's kid** credit taking it off (all of it, or **How much to take off**). Coaches put on a team after their kid was approved show up here; tap **Comp them now**.
- **A fundraiser hour earns** and **Balances due by** (shown on every family's balance unless you give a family its own date on Finances).
- **Weekly balance reminder**: an email every week to each family that still owes, until they've paid. Pick **Day it goes**, **When it starts** (**As soon as a family owes**, or some days before, on or after their due date), **Who gets it** (Dads, Moms, Guardians, Players), and its **Subject** and **Message**, or **Start from a template**. **{balance}** becomes what the family owes, **{due_date}** their due date, **{family}** their last name and **{player}** their players' names. **Email me a test** sends it to you as one family that owes would get it. Turn on **Send the weekly reminder** and tap **Save reminder**. **Recent weeks** shows how many families it went to. A family with a credit or nothing owed never gets it, and you can take one family off it on Finances.

Tap **Save**. **Show me around** here walks the whole setup, from this tab through importing the spreadsheet, Nelson's shifts, clinics and the Snapshot to who can see it. Each Finances tab has its own walkthrough under the **i** too.`,
  },
  {
    id: "settings-contact-types",
    title: "Settings: Contact Types",
    group: "Settings",
    audience: "super_admin",
    keywords: ["contact types", "types", "categories", "external contacts", "vendors", "group", "filter", "slug", "sort order", "coaches can see", "share", "coaches"],
    body: `The types used to group External Contacts — uniforms, photos, facilities, opponents and so on. Open **Settings → Contact Types**.

- **Add type** — give it a **Name** (e.g. Plumbing) and, if you like, a **Sort order** (lower numbers come first). The **Slug** fills itself in from the name.
- Types show up when someone adds an external contact, and as filter chips on the External Contacts page.
- **Coaches can see** — tick it on a type to let the coaches read its contacts (not change them): the companies of that type and the people at them, as a type chip on the list. Programs, Facilities and Referees start ticked. Coaches see everything on those contacts, notes included.
- **Travel** — **Hotels** or **Places to eat** makes it a travel type: its contacts show under the HS Schedule's weekends away in their city, and the travel coordinator (the **Travel** permission in Settings → Members) adds and edits them. Hotels and Food start that way.
- Tap the **pencil** to rename a type, or the **trash** can to delete it. Contacts of that type aren't deleted — they just lose the grouping.`,
  },
  {
    id: "settings-website",
    title: "Settings: Website",
    group: "Settings",
    audience: "website",
    keywords: ["website", "public site", "club website", "menu", "navigation", "nav", "folder", "page text", "words", "wording", "pictures", "photos", "images", "upload", "flyer", "banner", "footer", "home page", "philosophy", "history", "summer", "programs", "coaches", "sponsors", "logos", "buttons", "new page", "add a page", "address", "draft", "preview", "publish", "discard", "reset", "original", "description"],
    body: `Change the public club website without a developer: the menu across the top, the words, pictures and buttons on its pages, the lists of programs, coaches and sponsors, and pages of your own. Open **Settings → Website**. Super-admins can always use it; a super-admin gives a board member **Settings: Website**, through their access profile or their **Access** panel in **Settings → Members**.

**Draft, preview, publish**

Nothing you save goes on the site straight away. Every **Save draft** keeps your change as a draft, and the box at the top lists your unpublished changes.

- **Preview** opens the site in a new tab with your drafts in place. Only people with the Website permission can see them; a black bar at the bottom says you're previewing. **Exit preview** goes back to the live site.
- **Publish** puts every draft on the live site at once.
- The **×** on a change throws that draft away; **Discard all** throws them all away.
- Each spot says **Draft**, **Published** (changed and live) or **Original** (the website's own). On the **Pages** tab, ◆ on a page's name means it has unpublished changes and • means it has published ones.

**Menu**

- Each item is a **link**, or a **folder** that opens to show its own links (like About → Philosophy, History).
- **Goes to** is a page on the site, like **/coaches** or one of your new pages (pick from the list as you type), or any web address, like a Google Drive file. Web addresses open in a new tab.
- The arrows move an item up or down; the **trash** can removes it. **Add link** and **Add folder** add one at the bottom; **Add link to …** adds one inside a folder.
- Tap **Save draft** when you're done. **Discard changes** throws away what you haven't saved.
- **Reset to original** saves a draft that puts back the menu the website started with.

**Pages**

Pick a page (**Home**, **Philosophy**, **History**, **Summer**, **Programs**, **Coaches**, **Sponsors**, **Footer** for the bottom of every page, or **New pages**), then change any of the spots listed. **Preview this page** opens it with your drafts.

- **Text**: type the new words and tap **Save draft**. In the bigger boxes, leave a blank line between paragraphs. **\\*\\*bold\\*\\***, **\\*italic\\***, **[link words](/philosophy)** and lines starting with a dash (**-**) for a list all work. A bold line on its own gets a little space above it, like a heading.
- **Pictures**: tap **Upload new picture** and choose a JPEG, PNG, WebP or GIF up to 10 MB (iPhone HEIC photos: export them as JPEG first). Fill in **Description** first: it's read aloud to people who can't see the picture.
- **Buttons**: change the **Words on the button** and where it **Goes to**.
- **Lists** (the programs, coaches and sponsors): tap one to open it and change it; the arrows reorder, the **trash** can removes one, and **Add program**, **Add coach** or **Add sponsor** adds one at the bottom. Then **Save draft**. Once the coaches list has been changed, the Coaches page shows them in two even columns rather than the original staggered layout.
- **Reset to original** saves a draft that puts the website's own words, picture or list back for that spot.

**New pages**

Make a page of your own, like a fall camp or a tryouts page. Under **Pages → New pages**, tap **Add page** and fill in its **Title**, its **Address** (filled in from the title: Fall Camp makes **/fall-camp**), an optional **Banner picture**, and the **Page text**. Save the draft, preview it, publish it, then add it to the **Menu** so people can find it. An address the site already uses can't be taken. Delete a page from the list (and publish) to take it down.`,
  },
  {
    id: "settings-release-notes",
    title: "Settings: Release Notes",
    group: "Settings",
    audience: "everyone",
    keywords: ["release notes", "changelog", "what's new", "shipped", "show me how", "walkthrough", "demo", "version", "toast"],
    body: `What just shipped in the portal. Open **Settings → Release Notes**. Every member can read it.

Each release has a **version** pill, a **title**, the **date**, and a short list of what changed. Newest first, down a timeline.

When something ships, a **What's new** card pops up in the bottom-right of any portal page. **See release notes** opens this list; **×** dismisses it. Opening the list also marks the notes as seen, so the card stays away until the next release.

**Show me how →.** When a release changed something you can use, tap **Show me how →**. A guided tour walks you through it on the real page: **Back** / **Next**, and **Skip tour** any time. The button only shows when that tour can run for you — a hotel-stay tour for Travel, an Email families tour if you can email families, and so on.`,
  },
  {
    id: "settings-sidebar-links",
    title: "Settings: Sidebar Links",
    group: "Settings",
    audience: "super_admin",
    permission: "site_links",
    keywords: ["sidebar", "links", "link", "schedule", "website", "url", "web address", "new tab", "same tab", "inside the portal", "frame", "iframe", "embed", "menu", "shortcut", "reorder"],
    body: `Add your own links to the bottom of everyone's sidebar — the season schedule, a sign-up form, the club store. Open **Settings → Sidebar Links**. Super-admins can, and so can anyone with the **Sidebar Links & Public Directory** permission.

- **Add link** — type a **Label** (the name people see, like Schedule) and the **Link** (a web address like https://schedule.omahalightningbasketball.com/, or a portal page like /portal/docs). Tap **Add link**.
- Pick how the link opens:
  - **Open in a new browser tab** (the choice to start with) — the site opens in its own tab, so the portal stays open.
  - **Open inside the portal** — the site shows right in the portal, under the top bar with the sidebar still there, so it feels like part of the portal. Some sites don't allow this; if the one you typed doesn't, saving tells you so and you can pick a new tab instead. Portal pages can't use this choice (they're already inside the portal).
  - **Open in the same tab** — the site replaces the portal in that tab.
- Use the arrows to change the order, the **pencil** to edit a link, and the **trash** can to remove it.

Every signed-in member sees the links; only super-admins can change them.`,
  },
  {
    id: "settings-public-directory",
    title: "Settings: Public Directory",
    group: "Settings",
    audience: "super_admin",
    permission: "site_links",
    keywords: ["public directory", "directory link", "share", "link", "key", "no login", "without signing in", "read-only", "roster", "turn off", "coaches", "coach", "volunteers", "open spot", "scorekeeper", "clock", "photographer", "coaches & volunteers"],
    body: `The public Directory is a read-only copy of the Directory on the club website. It opens without signing in, for anyone you give its private link to. It lists only families who said yes to the directory, shows each player's age (not their birthday) and city and ZIP code (not their street address), and never shows fees or payments. Each team's coaches and volunteers are listed too, with their phone and email. Coaches (a leadership role, or a role whose name says coach) show at the top of each team under **By team**, and all together under **Coaches & Volunteers**. Every other role — Scorekeeper, Clock, Photographer and any role you add in **Volunteer Roles** — is under **Volunteers**, closed until someone taps it. An empty seat says **Open Spot**. Assign people on the team's page in the Directory. The registration form does not list who has the job. Open **Settings → Public Directory**.

- **Link** — the address to share. **Copy link** copies it; **Open** shows the page in a new tab.
- **Key** — the end of the link. Type your own (at least 16 letters, numbers, dashes or underscores) and tap **Save key**, or tap **New random key** to have one made for you.
- Changing the key retires the old link right away. Do it if the link has been passed around more than you'd like.
- **Turn off** — nobody can open the page until you save a key again.

Anyone with the link can see parents', coaches' and volunteers' names, phone numbers and emails, so share it only with families in the program.`,
  },
  {
    id: "settings-hotel-import",
    title: "Settings: Import",
    group: "Settings",
    audience: "travel",
    // No routes: Settings' default "i" stays Members; the Import tab sets this
    // section via TAB_HELP (same pattern as Teams, Requirements, …).
    keywords: ["import", "hotel", "rooming list", "group rooming list", "pdf", "csv", "booked", "confirmation", "staybridge", "ihg", "settings", "travel", "travel coordinator"],
    body: `For the travel coordinator: turn a hotel's **Group Rooming List** into **Booked** marks on a hotel stay. Open **Settings → Import** (with **Travel**, Settings shows this tab).

1. Under **Hotel rooming list**, choose the PDF the hotel sent (or a CSV/TXT export), then **Preview matches**.
2. Check the guessed **Hotel** (from External Contacts → Hotels), **HS Schedule weekend**, and **Hotel stay**. If there's no stay yet, leave **Create new stay…** and set the name (Regionals, Nationals…).
3. Each guest row shows our best guess for the Directory family — parents on the list match their players. Tick or untick players; leave unmatched rows alone.
4. **Mark … Booked** writes confirmation numbers into each player's note and opens **Directory** filtered to that stay.

Text PDFs from the hotel work best (Staybridge / IHG style). A scan-only PDF won't have selectable text — ask the hotel for a text PDF or a CSV with confirmation, name and dates.

You can keep importing lists from different hotels the same way; each run attaches to the stay you pick.`,
  },
  {
    id: "settings-agent-keys",
    title: "Settings: Agent keys",
    group: "Settings",
    audience: "super_admin",
    // No routes: Settings' default "i" stays Members; the Agent keys tab sets
    // this section via TAB_HELP (same pattern as Teams, Requirements, …).
    keywords: ["agent", "api key", "bearer", "film", "youtube", "read-only", "hash", "email", "archive", "write"],
    body: `Give a club agent a key so it can list game film or copy emails into Archives, without signing in as a person. Open **Settings → Agent keys**. Super-admins only.

- **Name** — a label only you see, like **Film reader**.
- **Permissions** — tick **Read game film** and/or **Import email archive**. A film-only key cannot import mail.
- **Create key** makes a long key starting with **olb_ag_**. We show it once: **Copy key** now. We store a hash, so there is no reveal later. **Revoke** if it leaks; anything using it stops.
- The agent sends **Authorization: Bearer** and that key to **GET /api/agent/film**, **GET /api/agent/film/health**, and (with import permission) **POST /api/agent/email-archive**.
- Responses never include team upload codes, YouTube tokens, or storage paths.`,
  },
  {
    id: "settings-audit-log",
    title: "Settings: Audit Log",
    group: "Settings",
    audience: "super_admin",
    keywords: ["audit", "log", "history", "changes", "who changed", "member changes", "approved", "role change"],
    body: `A record of every change to a member's account — who made it, what changed and when. Open **Settings → Audit Log**.

The most recent 100 changes are listed, newest first: new members, approvals, role changes, profile edits and removals. Nothing here can be edited.`,
  },
];

export function guideAnchor(id: string): string {
  return `help-${id}`;
}

export function guideHref(id: string): string {
  return `/portal/guide#${guideAnchor(id)}`;
}

export function canSeeAudience(audience: GuideAudience, viewer: GuideViewer | null | undefined): boolean {
  if (audience === "everyone") return true;
  if (!viewer || viewer.status !== "approved") return false;
  if (audience === "staff") return viewer.isStaff;
  if (audience === "coaches") return viewer.isStaff || !!viewer.isCoach;
  if (audience === "finance") return viewer.role === "super_admin" || !!viewer.canManageFinances;
  if (audience === "registrations") return viewer.role === "super_admin" || !!viewer.canManageRegistrations;
  if (audience === "travel") return viewer.role === "super_admin" || !!viewer.canManageTravel;
  if (audience === "messaging") {
    return (
      viewer.isStaff ||
      viewer.role === "super_admin" ||
      !!viewer.canManageRegistrations ||
      !!viewer.canManageTravel
    );
  }
  if (audience === "slack") {
    return viewer.role === "super_admin" || !!viewer.canSlackDm || !!viewer.canManageTravel;
  }
  if (audience === "website") return viewer.role === "super_admin" || !!viewer.canManageWebsite;
  return viewer.role === "super_admin";
}

export function canSeeGuideSection(section: GuideSection, viewer: GuideViewer | null | undefined): boolean {
  if (section.preview && !viewer?.seesFullUi) return false;
  if (viewer?.status === "approved" && viewer.permissions) {
    if (section.permission && viewer.permissions.includes(section.permission)) return true;
    if (section.alsoPermissions?.some((p) => viewer.permissions!.includes(p))) return true;
  }
  if (section.permission === "invoicing" && viewer?.status === "approved" && viewer.canManageInvoicing) return true;
  return canSeeAudience(section.audience, viewer);
}

export function guideSectionsFor(viewer: GuideViewer | null | undefined): GuideSection[] {
  return GUIDE_SECTIONS.filter((s) => canSeeGuideSection(s, viewer));
}

// The "i" help for a page: the visible section with the most specific route
// that is the path itself or one of its parents. Null → no "i" button.
// The "i" help for a page that has views of its own under one address
// (Settings' tabs): the section the open view names, when the viewer can see
// it, else the page's own section.
export function guideSectionForPage(
  pathname: string,
  viewer: GuideViewer | null | undefined,
  sectionId?: string | null
): GuideSection | null {
  if (sectionId) {
    const s = GUIDE_SECTIONS.find((x) => x.id === sectionId);
    if (s && canSeeGuideSection(s, viewer)) return s;
  }
  return guideSectionForPath(pathname, viewer);
}

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
