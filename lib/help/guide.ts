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
// HS Schedule, External Contacts, Playbooks, Slack Archive, Activity, then Settings with
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
// travel coordinator); "messaging" = the board and the Registrations grant,
// who can email families from the Directory; "slack" = anyone with the Slack
// DMs grant; "website" = board members with the Website grant. Super-admins always have all of them. The guide hides a section
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
}

export const GUIDE_UPDATED = "October 2026";

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-in",
    title: "Signing in",
    group: "Getting started",
    audience: "everyone",
    keywords: ["login", "log in", "sign in", "password", "forgot", "reset", "code", "slack", "register", "request access", "pending", "approved", "denied", "account"],
    body: `The member portal is for Omaha Lightning families, coaches and the board. Use the **Login** button at the top of the club website (or the **Login** link at the bottom), or go straight to the login page.

**Three ways to sign in**

- **Continue with Slack** — the quickest. If you're in the club's Slack workspace, this gets you in right away, even if you're new.
- **Email and password** — the account you created when you requested access.
- **Email me a sign-in code** — no password needed. Enter your email, we email you a code, type it in and you're in. (If the email shows a sign-in button instead of a code, tapping the button works too.) Codes only work for email addresses that already have an account.

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
    keywords: ["navigation", "menu", "sidebar", "links", "schedule", "new tab", "inside the portal", "frame", "collapse", "mobile", "phone", "home", "search", "info", "help", "sign out", "log out", "shortcut", "command k", "ctrl k", "scroll", "back to top", "jump to top", "tour", "walkthrough", "show me around", "take the tour", "dropdown", "drop down", "pick list", "autocomplete", "space bar"],
    body: `**Home is the Directory.** After you sign in you land on the Directory of players and parents.

**The sidebar** on the left has everything you can use — you only see the parts that apply to you:

- **Directory** — players, parents, teams, coaches and volunteers.
- **Playbooks** — how-to guides and step-by-step checklists.
- **Payments** — what you owe for the season and what you've paid. It appears once the Treasurer has your family's balance ready.
- **Slack Archive** — past messages, photos and files from the club's Slack.
- **User Guide** — this page, near the bottom of the sidebar.
- **Notifications** — turn on notifications for your phone or computer (see **Notifications** below).
- **Sign out** — at the very bottom.

Coaches and board members also see the **HS Schedule** and **External Contacts** (the travel coordinator does too), and board members **Settings**, just below **User Guide**.

Below a thin line you may see extra links the club has added, like **Schedule**. Some open in a new browser tab, so the portal stays open where you left it. Others open right inside the portal, with the sidebar still there. If one of those doesn't look right, tap **Open in a new tab** in its bottom left corner.

On a computer, **Collapse** (bottom of the sidebar) shrinks it to icons, and the arrow button in the same spot opens it again. On a small screen, like a car's browser or a small laptop, the sidebar starts out collapsed. If the sidebar is taller than the window, scroll it to reach the buttons at the bottom. On a phone, tap the **menu** button at the top left to open it.

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
    preview: true,
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
    keywords: ["players", "parents", "roster", "team", "age group", "10U", "12U", "14U", "16U", "18U", "phone", "email", "address", "contact info", "jersey", "profile", "family", "search"],
    body: `This season's players and their parents, grouped by team.

- **Search** by player, parent, email or phone number (type 3 or more digits to match a phone).
- Pick a team from the **All teams** drop-down to show just that team. You'll see the team's division, practice times and location, and who's coaching and helping out. **All teams** shows everyone; **No team yet** shows players who haven't been placed. The number next to each team is how many players are on it.
- Coaches, other team leaders and board members can switch between **By team** and **By age group** (10U–18U), then pick one from the **All ages** drop-down.
- Each player shows their jersey number, team, age and birthday, address, and their parents' phone and email. A player's own email shows too, unless it's the same as a parent's. A **New** chip means it's their first season with us.
- Tap an address and pick **Apple Maps** or **Google Maps** to get directions.
- Tap a player's name to open their player page, a parent's name to open their profile, and **Team page ›** to open a team's full page.

**Who's listed.** Players appear when their family said yes to being in the directory on the registration form. If your family said no, you still see your own players, marked **Not in directory**; other families don't.

**Public directory.** The same players and parents are also on a read-only page on the club website that opens without signing in, for anyone given its private link. Only people with the link can find it, and super-admins manage the link in **Settings → Public Directory**. It lists only families who said yes to the directory, shows no fees or payment details, and can be grouped **Alphabetical** (the default), **By city**, **By team** or **By age group**. It shows each player's age (not their birthday) and their city and ZIP code (not their street address).

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
    keywords: ["player", "player page", "kid", "child", "son", "siblings", "brother", "sister", "parents", "mom", "dad", "balance", "payments", "fees"],
    body: `Everything about one player in one place. Open it by tapping a player's name in the Directory, on a team page, on a parent's profile, or on the Payments page.

- **The top** shows their jersey number, team (tap it to open the team page), age and birthday, address, and the player's own phone and email (their email is left off when it's the same as a parent's, since it shows with that parent). A **New** chip means it's their first season with us. Tap the address to open it in **Apple Maps** or **Google Maps**.
- **Parents** lists each parent with their phone and email. Tap a parent's name to open their profile. **Siblings** links to their brothers' and sisters' pages.
- **Payments** shows what the family owes and has paid, with each charge and payment. You see it for your own kids once the Treasurer has opened balances to families, and the Treasurer sees it for everyone.

**For the board.** The top also shows the registration fee, how the family said they'd pay, shirt size and waiver, plus a chip for each requirement. Tap a chip to check it off, the same as in the Directory.

**For the Treasurer.** **Record payment**, **Add a charge** and **Take off an amount** work right on the player page, for the whole family. **Open in Payments ›** jumps to the family on the Payments page.`,
  },
  {
    id: "registrations",
    title: "New registrations and teams",
    group: "Directory",
    audience: "registrations",
    routes: ["/portal/directory/registrations"],
    keywords: ["registration", "registrations", "register", "sign up", "approve", "waitlist", "wait list", "not this season", "contacted", "message", "email families", "recipients", "dad", "mom", "player email", "spreadsheet", "csv", "new player", "team", "place", "put on a team", "no team yet", "roster", "edit player", "remove player", "take off the roster", "remove from team", "withdrawn", "removed", "new", "jersey", "age group", "birthday", "registration form", "cognito", "code", "email confirmed", "wizard"],
    body: `You see this if you have the **Registrations** permission (a super-admin turns it on in Settings → Members).

**New registrations.** The **Registrations** button at the top of the Directory opens registrations from the form any time, with how many are new and on the waitlist. When some are new, a yellow bar also says how many; tap **Review registrations** to see them. The page has four tabs: **New** (to review, oldest first), **Waitlist**, **Approved** and **Removed**. Each registration shows the player, the fee for their age group, how the family said they'd pay, the waiver, the homeschool answer, whether they need a uniform, and each parent's phone, email and what they can help with.

- **Approve** adds the player to the Directory under **No team yet** and puts their registration fee on the family's Payments account. Their parents are set up so they can sign in with the email on the form.
- **Waitlist** keeps a family you can't place yet. Add a note on why if you like ("14u is full"); families don't see it. Nothing is added to the Directory or Payments.
- A note on a registration means the player's name is already on the roster. **Already on the roster** means Approve updates that player instead of adding a second one. If the birthdays don't match, Approve adds a second player, so check the birthday first and fix it on their player page if it's the same child.
- **Open the registration form ›** opens the form families fill in, so you can copy its link to send out.
- The form starts with the family's email and emails them a 6-digit code. Once they type it in, it fills in what we already know about any players on that email (names, birthdays, address and parents), so returning families just check it over. Brothers and sisters are registered together, and each one arrives here as their own registration. **Email confirmed** on a registration means the family typed the code back. When a family sends the form, whoever filled it in gets a receipt by email (their players, the fees, how to pay by Venmo or check, and what happens next), and the club's Gmail gets a **New registration** email with the details and a link to review it. A copy of the receipt is kept on the registration, and on the player's page under **Messages sent** (from the registration form) once it's approved. **Send receipt** on a registration sends it again: it starts addressed to whoever registered, or type another address to send yourself a test (a test isn't kept).

**The waitlist.** The **Waitlist** tab lists those families in the order they registered, with who put them there, when, and the note (**Edit note** changes it).

- **Message everyone** writes one email to every family on the waitlist; **Send a message** on a registration writes to just that family. Pick who it goes to: for one family, tick **Dad**, **Mom** and the **Player** (when they have their own email); for everyone, tick **Dads**, **Moms** and **Players**. All are ticked to start. It's sent from the club's email address, one email per family (brothers and sisters get one between them), and replies go to the club's Gmail. For one family the player's name is already in the message; for everyone, **{player}** becomes each family's player names, and a preview shows how it reads. The message starts from the board's **Waitlist: teams are full** template (change its words in Settings → Email Templates), and **Template** swaps in any other. A copy is kept on the registration under **Messages sent**.
- **Contacted** marks that someone has reached out, with the date and who, so two people don't both call. Sending a message ticks it for you.
- **Email from my app** opens your own email app addressed to the parents instead. **Copy all emails** copies every parent's email to paste into Bcc, and **Download spreadsheet** saves the waitlist as a file for Excel or Google Sheets.
- The Directory has the same thing for players already on the roster: see *Emailing families*.
- When a spot opens, **Approve** works right from the waitlist. **Move back to New** puts a registration back in the review queue, and **Remove** moves it to the **Removed** tab (for a test, or a family that withdrew).

**Approved** lists every registration that's been approved, newest first, with who approved it and when. Tap a name to open the player's page.

**Removed** keeps families who withdrew or were taken off the roster, newest first, with who removed them, when, why, and the team they were on. Nothing is ever deleted: **Approve** puts them back under **No team yet**, and **Move to the waitlist** puts them on the Waitlist.

**Putting players on teams.** In the Directory, every player has a team chip showing their team (or **No team yet**). Tap it and pick a team, and the player moves there right away. Pick **No team yet** to take them off their team. Pick **No team yet** from the **All teams** drop-down at the top to see who still needs a team.

**Editing a player.** On a player's page, the team chip works the same way, and **Edit player** changes their **Name**, **Birthday**, **Jersey number** and **Age group**. Tap **Save**.

**Taking a player off their team.** For a family that lost their spot, or a player who isn't in the program this season. On the player's page, tap **Edit player**, then **Remove from team…**, and pick where they go:

- **Waitlist**: they lost their spot (they didn't show, or stopped answering). They show on the **Waitlist** tab and can be approved again when a spot opens.
- **Withdrawn**: they aren't playing this season. They show on the **Removed** tab.

Add a line on why if you like, and tap **Move to the waitlist** or **Mark withdrawn**. They leave their team and the Directory, with "Taken off the roster" and the team they were on. Their notes and the emails sent to them go with them, and what they owe on Payments comes off. If the family has already paid something, the Treasurer refunds it and voids the payment first (the **Void** button is on the player's Payments card). Log what happened in the player's **Notes** first (see *Notes on players*). To find them later, pick **On the waitlist** or **Removed** from the **All teams** drop-down in the Directory.`,
  },
  {
    id: "player-notes",
    title: "Notes on players",
    group: "Directory",
    audience: "messaging",
    keywords: ["notes", "note", "log", "history", "document", "record", "screenshot", "screenshots", "attachment", "attach", "file", "pdf", "photo", "text messages", "texts", "link", "slack archive", "save to notes", "thread", "no show", "no-show"],
    body: `You see this if you're on the board or have the **Registrations** permission. Families never see notes.

In the Directory, a player with notes has a **1 note** (or **2 notes**…) chip by their name; tap it to open them. Every player's page has a **Notes** card: a running log of what happened with the family, newest first, with who wrote each note and when. While a player is off the roster, the same notes show on their registration on the **New**, **Waitlist** and **Removed** tabs, and they follow the player back onto the roster when they're approved.

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
    keywords: ["email", "message", "families", "parents", "dad", "mom", "guardian", "player email", "team email", "announcement", "reminder", "send", "missing", "messages sent", "template", "templates", "primary email", "same email", "{player}"],
    body: `You see this if you're on the board or have the **Registrations** permission.

**Email the players in view.** On the Directory, **Email families** (next to how many players are showing) writes to the families of the players the list shows right now. Narrow it first: pick a team or **No team yet**, pick an age group, search, or pick a requirement and **Missing** to remind just the families who still need it. The top of the window says who it's going to, and **see who gets it** lists each family.

**Email one family.** On a player's page, **Email family** writes to just that player's family.

**Who gets it.** For one family, tick each person: **Dad**, **Mom**, a **Guardian**, and the **Player** when they have their own email. For several, tick **Dads**, **Moms** and **Players** (and **Guardians** when anyone has one). All are ticked to start. When a player's email is the same as a parent's, it's listed once, on that parent, marked **Primary email**. It's sent from the club's email address, one email per family (brothers and sisters get one between them), and replies go to the club's Gmail. If a family has no email for the people picked, the window names them so you can reach them another way.

**Templates.** Pick one from **Template** to fill in the subject and message, then change anything you like. The board writes them in **Settings → Email Templates**.

**{player}** in the subject or message becomes the family's player names. Writing to several families, a preview shows how it reads for the first one.

**A copy** of each email is kept on the player's page under **Messages sent**, with who sent it and when.`,
  },
  {
    id: "slack-dms",
    title: "Slack DMs to families",
    group: "Directory",
    audience: "slack",
    keywords: ["slack", "dm", "direct message", "message", "families", "parents", "dad", "mom", "remind", "reminder", "missing", "handbook", "connect slack", "disconnect", "reply", "replies", "{name}", "{player}"],
    body: `You see this if a super-admin turned on **Slack DMs** for you in **Settings → Members**: board members, coaches, the travel coordinator, anyone the club picks.

**What it does.** Sends the parents of the players you pick a Slack direct message **from you**, one to each person, never a group DM. It looks just like a message you typed yourself, so when a parent replies, the reply comes straight to you in Slack.

**Connect Slack, once.** The first time, **Slack families** asks you to **Connect Slack**. A Slack window opens; tap **Allow** and it closes by itself. After that the portal can send DMs for you. To stop, tap **Disconnect Slack** at the top of the window.

**Slack the players in view.** On the Directory, **Slack families** (next to **Email families**, when you have both) writes to the families of the players the list shows right now. Narrow it first: tap a team, pick an age group, search, or (for the board) pick a requirement like the handbook and **Missing**, so only the families who still need it hear from you.

**Slack one family.** On a player's page, **Slack family** writes to just that player's parents.

**Who gets it.** Tick **Dads**, **Moms**, **Guardians** and **Players**. The window looks each person up in the club's Slack by the email on file and lists them: a ✓ means they're on Slack and get a DM, a ✗ means no Slack account uses their email. A parent of brothers and sisters gets one DM about all of them. Nobody gets a DM from themselves. You can send up to 150 DMs at a time.

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
    keywords: ["requirements", "handbook", "signature", "signed", "signature page", "fee", "fees", "paid", "owes", "waived", "scan", "scanner", "camera", "auto", "pdf", "heic", "iphone photo", "upload", "photo", "missing", "collected", "checklist", "forms", "walkthrough", "show me how"],
    body: `Keep track of what each player has handed in or paid — the signed last page of the handbook, a tournament fee, a form. Only the board sees any of this.

**On each player.** In the **Directory**, every player has a chip for each requirement that applies to them:

- A red **Needs Handbook signature** (or **Owes** for a fee) means it's still missing.
- A green chip with a check means it's done or paid. A little page icon means a scan is attached.
- A grey **waived** chip means you've excused them.

**Checking a player off.** Tap the chip. Pick **Done** (**Paid** for a fee), **Waived** or **Not yet**, set the date, and add a **Note** if it helps (a check number, say). Then tap **Save**.

**Scans.** When a requirement offers it, you can attach a copy of what you collected. Scans are private to the board.

- **Scan with camera** works like the scanner built into your phone. Point the camera at the page and hold still: once the yellow outline finds it, the ring around the round button fills and it takes the picture by itself. Tap the round button to take it sooner, or tap **Auto** to turn that off and always tap it yourself (your phone remembers). Drag the corners if they're off, then tap **Keep scan**. The page comes out straight and cleaned up. Pick **Color**, **Grayscale**, **B&W** or **Photo** (the picture as taken), tap **Add page** for more pages (it waits until you turn to the next page), then **Attach scan** to save them all as one PDF. **Photo** next to the round button scans a picture you already took.
- **Upload scan** attaches a photo or PDF you already have. A photo opens in the scanner first, so you can drag the corners and pick a look the same way, or tap **Upload as is** to attach it untouched. iPhone photos (HEIC) work on any computer; with **Upload as is** they're saved as a JPEG so everyone can open them.
- **View scan** opens it; **Replace scan** and **Remove scan** do what they say.

If the camera won't open, allow it for this site in your browser's settings, or tap **Use a photo instead**.

**Who's still missing?** Pick a requirement from the **All requirements** drop-down above the list. **Missing** shows who still needs it, with counts for **Done** (or **Paid**), **Waived** and **All**. It works together with search and the team and age-group filters, and the line above the list shows how many are done.

Requirements start over each season, since each season has its own roster. The list itself is set up in **Settings → Requirements**.

**Walk me through it.** For a hands-on walkthrough in three parts (setting a requirement up, checking players off with a scan, and seeing how many are in and who's left), press **Show me around** next to this section's title, or tap **ⓘ** on **Settings → Requirements** and then **Show me around**.`,
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

**A weekend's details.** Tap the event, or **Weekend details** on the card. At the top is how the weekend stands, where it is, its notes and details; press **Edit** to change its dates, **Where**, **Trip**, **Status**, **Notes**, **Facility** and **Details**, then **Save details** (or **Cancel**). Below that, **−** and **+** set every team's games, with **Not sure** for the ones that aren't settled, and **Teams coming** lists how many are coming and on the fence, then every team with **Yes**, **Maybe** or **No** and the teams of ours it plays (the same chips as on the card). The trash can at the end of a team's chips takes it off the weekend. Games and teams save as you change them. **Add weekend** adds one; **Delete this weekend**, at the bottom, removes one.

**Seasons.** Use the arrows beside the season's name to move between seasons, or tap the name (**2026–27 ▾**) for the list of them all. A tag beside it says whether it's **This season**, a **Past season** or the **Next season**, and the season's notes from Season settings show under it (**more** for the rest). On the newest season, the board sees **+** in place of the right arrow to start the next one. On a computer the column headings (the season, **Where**, **Event**, our teams) stay at the top as you scroll. **⋯** beside the gear has **Print** (the grid on landscape pages, with what's showing at the top) and **Copy link** (the schedule as you're seeing it, filters and all). Pick a season under **Compare with** in **View** to put its same weekend beside each row, so you can see what we did a year ago. The gear (**Season settings**) next to **Add weekend** opens **Our teams** (a column each on the schedule): **Add team**, the arrows to reorder, the eye to hide or show one in a tap, and the pencil to rename one or link it to its team in the Directory. Below them are the season's **Notes**, with **Save notes** once you've typed. The board can also **Start 2027–28 from 2026–27** there (the same weekends a year on, with the teams that came now on the fence), add any other season with **New season** (it starts on the season after the newest one: pick **Copy 2026–27** for the same weekends a year on, or **Start empty**), or delete the season. With no seasons at all, the board presses **Start 2026–27** on the empty page. A season with no weekends yet offers **Add weekend** right there, and **Season settings** first when it has no teams of ours yet; **Compare with…** shows once it has weekends.

**Walk me through it.** Press **Show me around** next to this section's title, or tap **ⓘ** on the HS Schedule and then **Show me around**.`,
  },
  {
    id: "hs-schedule-travel",
    title: "HS Schedule",
    group: "HS Schedule",
    audience: "travel",
    routes: ["/portal/schedule"],
    keywords: ["schedule", "hs schedule", "high school", "season", "weekend", "tournament", "travel", "travel coordinator", "weekends away", "overnight", "trip", "hotel", "hotels", "room block", "food", "restaurant", "where to stay", "where to eat", "teams coming", "view only", "read-only"],
    body: `For the travel coordinator: the high school season weekend by weekend, to plan the hotel blocks and team meals. It's **HS Schedule** in the sidebar. You see all of it; the coaches and the board keep it up to date, so there's nothing to change here (**View only** at the top).

- **The grid.** A row per weekend: the dates, **Where** and the trip (**Local**, **Day trip**, **Overnight**…), the event, a column for each of our teams (V, JV1, JV2…) with its games, and **Notes** (the venue and game times). The event's color says how it stands: **Tentative** (red), **Need to secure facility** (yellow), **Final details in process** (pale yellow) and **Facility secured** (green).
- **Where to stay and eat.** On a weekend away, a bed and a fork under **Where** count the hotels and places to eat saved there. Tap them for the list, with the places that have your notes first, who to call (and the **Front desk**) and the website; tap a place's name to open it. They're the ones you keep in **External Contacts** (**Add or edit places in External Contacts** at the bottom of the list): a place shows on the weekends in its **City**, or in a city it's tagged with.
- **Who's coming.** Hover over a team's count (tap it on a phone) to see its games and the teams it plays, with the other teams of ours each one plays in parentheses and a line for the ones not coming. Scroll or click in the card and it stays open, with an **✕** to close it.
- **A weekend's details.** Tap the event, or **Weekend details** on a team's card. At the top are how it stands, the days, where and the trip, then the notes and details. On a weekend away, **Where to stay and eat** lists the hotels and places to eat near it, with your notes, who to call and the website. Below that are every team's games and the teams coming: how many are coming and on the fence, each team by name (with the teams of ours it plays when it's only some), and a line for the ones not coming.
- **Show just some weekends.** Tap the **All weekends** drop-down above the schedule and tick **Facility secured** for the weekends that are set, or **Tentative** for the ones that may still change. Tick both to see them together.
- **Seasons.** The arrows beside the season's name move between seasons. **View** → **Compare with** puts another season's same weekend beside each row, to see where we went a year ago. **Search events, places, teams** finds a weekend by its event, place or a team coming.`,
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
    keywords: ["travel", "travel coordinator", "hotel", "hotels", "room block", "rates", "food", "restaurant", "places to eat", "dinner", "team meal", "external contacts", "tags", "closed"],
    body: `For the travel coordinator: the hotels we book and the places that feed the team on the road, in **External Contacts** (in the sidebar). You see and change these; the rest of External Contacts is the board's.

- Each hotel or restaurant is listed with the people there under it, their role, phone and email. Tap one to open it.
- **+ New contact** adds a place. Choose **Company**, give it the **Hotels** or **Food** type, then fill in its **City** and **State**, phone, website and notes: the rates, the room block, what worked last time.
- On a place's page, **+ Add person** adds who you deal with there, and **Edit** changes the place. If someone else saved it after you opened it, your save stops and says so, so nobody's changes are lost.
- **Tags** put a place on the HS Schedule's weekends in a nearby city: tag a hotel in Ankeny **des moines** and it shows on Des Moines weekends as well as Ankeny's. Tag one **closed** to keep it off the schedule.

You, the coaches and the board see these places under each weekend away on the **HS Schedule**, with your notes. Only the board can delete a contact.`,
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
    id: "payments",
    title: "Payments: recording what families pay",
    group: "Payments",
    audience: "finance",
    routes: ["/portal/payments"],
    keywords: ["payments", "treasurer", "fees", "registration fee", "owes", "owed", "balance", "paid", "venmo", "check", "cash", "uniform", "tournament", "covered", "hardship", "scholarship", "credit", "refund", "void", "spreadsheet", "csv", "download", "export"],
    body: `The season's money, one family at a time. You see this if you have the **Payments** permission (a super-admin turns it on in Settings → Members).

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
    id: "slack-archive",
    title: "Slack Archive",
    group: "Slack Archive",
    audience: "everyone",
    routes: ["/portal/slack-archive"],
    keywords: ["slack", "archive", "messages", "channels", "threads", "history", "private", "jump to date", "filter", "link", "attachments", "files"],
    body: `The full history of the club's Slack channels, updated every night — so nothing gets lost when Slack hides older messages.

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
    group: "Slack Archive",
    audience: "everyone",
    routes: ["/portal/slack-archive/search"],
    keywords: ["slack", "search", "find", "message", "exact phrase", "quotes", "exclude", "user", "channel"],
    body: `Find an old message. Open **Search archive →** from the Slack Archive.

- Type words to find messages with all of them. Put **"an exact phrase"** in quotes, and put a minus in front of a word (**-hotel**) to leave it out.
- Narrow it down with the **Channel** and **User** pickers — or leave the text empty and pick a person to see everything they've posted.
- Results show the newest 200 matches. **Jump to message ↗** opens the message in its conversation.
- **Clear all** starts over.

Quick lookups work from the top-bar search too — Slack messages show up there under **Slack**.`,
  },
  {
    id: "slack-archive-album",
    title: "Photo Album",
    group: "Slack Archive",
    audience: "everyone",
    routes: ["/portal/slack-archive/album"],
    keywords: ["photos", "pictures", "videos", "album", "gallery", "download", "month", "slideshow", "gif"],
    body: `Every photo and video shared in the Slack channels you can see, arranged by month. Open it from the **Photo Album** card on the Slack Archive.

- **Search** captions, people, channels or a month (e.g. "june 2024").
- Show **All**, just **Photos** or just **Videos**, and narrow by **Channel** or **People**.
- **Jump to month** skips straight to a month; **Newest first / Oldest first** flips the order.
- Tap a photo to open it full-screen. Use the arrows (or ← and → keys) to move through them, **Show details** to see the caption and who posted it, **View in conversation** to see the Slack thread (the message is highlighted in yellow), and **Download original** to save it.
- Your filters stay in the page address, so you can bookmark or share a filtered view.

If the page has been open a long time and pictures stop loading, tap **Reload previews**.`,
  },
  {
    id: "slack-archive-admin",
    title: "Managing the Slack Archive",
    group: "Slack Archive",
    audience: "super_admin",
    routes: ["/portal/slack-archive/exceptions"],
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
| Directory, Playbooks, Slack Archive | ✓ | ✓ | ✓ |
| See every player, fees, waivers and volunteer interests | With **See all players** | ✓ | ✓ |
| Member notes on profiles | With **Member notes** | ✓ | ✓ |
| External Contacts: add, edit, history | With **External Contacts** | ✓ | ✓ |
| Approve or deny access requests | With **Approve access requests** | ✓ | ✓ |
| Check players off on requirements (handbook signature, fees) | With **Check off requirements** | ✓ | ✓ |
| Plan the HS Schedule | With **Plan HS Schedule** (coaches always) | ✓ | ✓ |
| Set up requirements in Settings | | With **Settings: Edit** | ✓ |
| Every family's balance; record payments | With **Payments** | With **Payments** | ✓ |
| Review new registrations; put players on teams; edit and remove players | With **Registrations** | With **Registrations** | ✓ |
| Add and edit the hotels and places to eat in External Contacts; see the HS Schedule | With **Travel** | ✓ | ✓ |
| Send families Slack DMs from the Directory, as yourself | With **Slack DMs** | With **Slack DMs** | ✓ |
| Change the club website's menu, page text and pictures | | With **Settings: Website** | ✓ |
| Add, edit and remove members; change roles | | | ✓ |
| Set up teams and volunteer roles; assign volunteers | With **Teams & volunteers** | With **Teams & volunteers** | ✓ |
| Change the sidebar links and the public Directory link | With **Sidebar Links & Public Directory** | With **Sidebar Links & Public Directory** | ✓ |

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
  - **Can manage** (members and board alike): **Payments** to see every family's balance and record payments (the Treasurer, and anyone helping them), **Registrations** to review new registrations, put players on teams and edit players, **Travel** for the travel coordinator to add and edit the hotels and places to eat in External Contacts and see the HS Schedule, and **Slack DMs** to send families Slack DMs from the Directory as themselves (see *Slack DMs to families*).
  - **Settings (Board)** (board members only): **Edit**, **Delete** and **Undelete** for Settings items like Requirements, and **Website** to change the club website's menu, page text and pictures (see *Settings: Website*).
  - **Board powers** (for people who aren't Board; Board has them all): **See all players** (every player, listed or not, with fees, waivers, shirts and parents' details), **Member notes**, **Check off requirements**, **Approve access requests**, **External Contacts** (see, add and edit every contact, and their history) and **Plan HS Schedule**.
  - **Club setup** (anyone): **Teams & volunteers** to set up teams and volunteer roles and fill team spots (putting someone in a leadership spot makes them a coach), and **Sidebar Links & Public Directory**.
  - Someone who isn't Board but has **Approve access requests**, **Teams & volunteers** or **Sidebar Links & Public Directory** opens **Settings** and sees only those tabs.
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
    body: `An access profile is a named set of permissions you hand someone in one step, like **Treasurer** (Payments) or **Registrar** (Registrations and Slack DMs). Open **Settings → Access Profiles**. Super-admins only.

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

**Assigning people.** Open a team's page (Directory → **Team page**) and tap **+ Assign** on an open spot. Pick from people who signed up to help with that role, parents on the team, or anyone else. Tap **Remove** to take someone off. Not in the list? Add them in **Settings → Members** first (no email needed), then assign them.`,
  },
  {
    id: "settings-requirements",
    title: "Settings: Requirements",
    group: "Settings",
    audience: "staff",
    keywords: ["requirements", "settings", "handbook", "signature", "fee", "tournament fee", "amount", "due date", "applies to", "teams", "retire", "active", "scan upload"],
    body: `Choose what players need to hand in or pay. Open **Settings → Requirements**. Super-admins can always use this tab. A board member can too once a super-admin gives them **Settings: Edit**, through their access profile or their **Access** panel in **Settings → Members**.

- **Add requirement** — give it a **Name** (what the board sees on each player, like Handbook signature) and a **Description** if it helps.
- **Type** — **Task / form** is marked **Done**; **Fee** is marked **Paid** and asks for an **Amount**.
- **Due date** is optional, a reminder for the board.
- **Applies to** — **All players**, or **Only some teams** (a tournament fee for one team, say). Tick the teams it covers.
- **Offer scan upload** lets the board attach a copy when they check a player off: scanned with the phone's camera, or a photo or PDF.
- **Active** — untick it to retire a requirement. It leaves the Directory but keeps everyone's record, and you can turn it back on later.

Use the arrows to change the order (it's the order of the teams in the Directory), and the **pencil** to edit. Super-admins, and board members whose **Delete** chip is on, can remove one with the **trash** can.`,
  },
  {
    id: "settings-planning-roles",
    title: "Settings: Planning Roles",
    group: "Settings",
    audience: "staff",
    preview: true,
    keywords: ["planning", "roles", "president", "athletic director", "treasurer", "communications", "coaches", "held by", "assign"],
    body: `The roles Planning's tasks belong to: President, Athletic Director, Treasurer, Communications and Coaches to start. Open **Settings → Planning Roles**.

- **Add role** gives it a name and a **Chip color** (the color its tasks wear on the calendar).
- **Held by** is who has the role this season. When the board keeps a task in Planning → Review, it's assigned to that person. Leave it as **Nobody named** for a role several people share, like Coaches.
- **Order** sets the order of the role buttons and of tasks within a month.

Use the **pencil** to edit a role, for example when a new President takes over, and the **trash** can to remove one. A removed role's tasks stay; they just show without a role.`,
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
    keywords: ["public directory", "directory link", "share", "link", "key", "no login", "without signing in", "read-only", "roster", "turn off"],
    body: `The public Directory is a read-only copy of the Directory on the club website. It opens without signing in, for anyone you give its private link to. It lists only families who said yes to the directory, shows each player's age (not their birthday) and city and ZIP code (not their street address), and never shows fees or payments. Open **Settings → Public Directory**.

- **Link** — the address to share. **Copy link** copies it; **Open** shows the page in a new tab.
- **Key** — the end of the link. Type your own (at least 16 letters, numbers, dashes or underscores) and tap **Save key**, or tap **New random key** to have one made for you.
- Changing the key retires the old link right away. Do it if the link has been passed around more than you'd like.
- **Turn off** — nobody can open the page until you save a key again.

Anyone with the link can see parents' names, phone numbers and emails, so share it only with families in the program.`,
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
  if (audience === "messaging") return viewer.isStaff || viewer.role === "super_admin" || !!viewer.canManageRegistrations;
  if (audience === "slack") return viewer.role === "super_admin" || !!viewer.canSlackDm;
  if (audience === "website") return viewer.role === "super_admin" || !!viewer.canManageWebsite;
  return viewer.role === "super_admin";
}

export function canSeeGuideSection(section: GuideSection, viewer: GuideViewer | null | undefined): boolean {
  if (section.preview && !viewer?.seesFullUi) return false;
  if (
    section.permission &&
    viewer?.status === "approved" &&
    viewer.permissions?.includes(section.permission)
  )
    return true;
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
