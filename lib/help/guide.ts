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
// travel coordinator). Super-admins always have all three. The guide hides a
// section from anyone it doesn't apply to.
export type GuideAudience = "everyone" | "coaches" | "staff" | "finance" | "registrations" | "travel" | "super_admin";

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
}

export const GUIDE_UPDATED = "September 2026";

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
    keywords: ["navigation", "menu", "sidebar", "links", "schedule", "new tab", "collapse", "mobile", "phone", "home", "search", "info", "help", "sign out", "log out", "shortcut", "command k", "ctrl k", "scroll", "back to top", "jump to top", "tour", "walkthrough", "show me around", "take the tour", "dropdown", "drop down", "pick list", "autocomplete", "space bar"],
    body: `**Home is the Directory.** After you sign in you land on the Directory of players and parents.

**The sidebar** on the left has everything you can use — you only see the parts that apply to you:

- **Directory** — players, parents, teams, coaches and volunteers.
- **Playbooks** — how-to guides and step-by-step checklists.
- **Payments** — what you owe for the season and what you've paid. It appears once the Treasurer has your family's balance ready.
- **Slack Archive** — past messages, photos and files from the club's Slack.
- **User Guide** — this page, near the bottom of the sidebar.
- **Sign out** — at the very bottom.

Coaches and board members also see the **HS Schedule** and **External Contacts**, and board members **Settings**, just below **User Guide**.

Below a thin line you may see extra links the club has added, like **Schedule**. Most open in a new browser tab, so the portal stays open where you left it.

On a computer, **Collapse** (bottom of the sidebar) shrinks it to icons. On a phone, tap the **menu** button at the top left to open it.

**Search.** The search box at the top of every page finds members, playbooks and Slack messages (and, for coaches and the board, external contacts). Press **⌘K** on a Mac or **Ctrl K** on Windows to jump to it from anywhere. Type at least 2 letters, use the arrow keys and **Enter** to open a result, and **Esc** to close. Tap the **×** inside the box to clear what you typed and start over. Your last few searches are remembered under **Recent**. To find a *player*, use the search box on the Directory page instead. That one, and the other search boxes on a page, have the same **×**.

**Dropdowns.** Every dropdown works the same way. Start typing to narrow the list to what matches, or press the space bar (or the down arrow, or click it) to see the whole list. Move with the arrow keys and press **Enter** or **Tab** to pick, or click one. **Esc** closes the list without changing anything. On a phone, tap a dropdown to see the list and tap your choice, or type a few letters to narrow it down.

**Back to the top.** On a long page, once you scroll down a yellow round button with an up arrow appears in the bottom right corner. Tap it to jump back to the top of the page.

**Help on every page.** Tap the **ⓘ** button in the top bar to read about the page you're on, then **Open the User Guide** for the full guide. Some form fields also have a small **ⓘ** next to their label — hover or tap it for a quick tip.

**Guided tours.** A tour walks you around step by step, pointing at each button and explaining what it does. Press **Next** and **Back** (or the ← and → keys) to move along, and **Skip tour** or **Esc** to stop. Start the welcome tour any time with **Take the tour** at the top of this guide (if your account is new, it starts by itself the first time you open the portal). For a tour of just one page, tap **ⓘ** on that page and then **Show me around** (in Settings, it's for the tab you're on), or press **Show me around** next to a section's title below.`,
  },
  {
    id: "ask-a-question",
    title: "Asking a question (Search page)",
    group: "Getting started",
    audience: "everyone",
    keywords: ["search", "ask", "question", "ai", "answer", "find", "sources", "portal search"],
    routes: ["/portal/search"],
    body: `The Search page answers questions about the club in plain words. It isn't in the sidebar: type **/portal/search** after the portal's web address to open it.

**Ask anything.** Type a question in the big box, like "When is the next tournament?", and press **Enter** or the arrow button. You can also tap one of the suggested questions or a **Popular topics** card.

**AI answer.** A short answer appears at the top, written only from records you can already open in the portal: members, playbooks, events, tasks, Slack messages (and, for the board, external contacts). The small numbers in the answer, and the cards under **Sources**, open the record each fact came from. AI can make mistakes, so open the source before you act on it.

**In the portal.** Below the answer is every record that matched. Tap a type, like **Playbooks**, to show only those, or **All** to see everything again.

Tap **Search home** to start over. To share a search, copy the page's address: it includes your question. Whoever opens it only sees what their own account allows.`,
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

**Upcoming, Past and All.** **Upcoming** starts with this month and runs through the end of the season. **Past** starts with last month and goes back. **All** is everything, oldest first (**Jump to this month** takes you to today). Each month shows its **Board meeting**, its events (a repeating event, like practice, is one line with how many times it meets that month) and its tasks under **To do**. Tap the circle beside a task to mark it done, or tap the task to assign it, comment or add to-dos. The book chip on a task opens the playbook that explains how. Use **Everyone**, **President**, **Athletic Director** and the other role buttons to see one role's tasks.

**Year.** One season on a page, a card per month, plus the year-round duties. Use the arrows beside the season's name to step back to last season or ahead to the next.

**Review.** Each season starts as a copy of the template. Press **Send 2026–27 to Review** (the season you pick) and every monthly task in the template lands in **Needs review**. Press **Keep** for what the board will do this season and **Toss** for what it won't, or **Keep all** for a month you take as it is. Kept tasks go on the calendar, into Opportunities, and to whoever holds the role (Settings → Planning Roles). Changed your mind? **Kept** and **Tossed** list them, with **Back to Review**. Pressing the button again for a season only adds template items it doesn't have yet, and never brings back what you tossed.

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
- Tap a **team** chip to show just that team. You'll see the team's division, practice times and location, and who's coaching and helping out. **All teams** shows everyone; **No team yet** shows players who haven't been placed.
- Coaches, other team leaders and board members can switch between **By team** and **By age group** (10U–18U).
- Each player shows their jersey number, team, age and birthday, address, and their parents' phone and email. A **New** chip means it's their first season with us.
- Tap a player's name to open their player page, a parent's name to open their profile, and **Team page ›** to open a team's full page.

**Who's listed.** Players appear when their family said yes to being in the directory on the registration form. If your family said no, you still see your own players, marked **Not in directory**; other families don't.

**Profiles.** A member's profile shows their photo, phone, email and birthday, plus their players and family. Your own profile has **✎ Edit profile** — see *Your profile* below.`,
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

- **The top** shows their jersey number, team (tap it to open the team page), age and birthday, address, and the player's own phone and email. A **New** chip means it's their first season with us.
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
    keywords: ["registration", "registrations", "register", "sign up", "approve", "not this season", "new player", "team", "place", "put on a team", "no team yet", "roster", "edit player", "remove player", "take off the roster", "jersey", "age group", "birthday", "registration form", "cognito", "code", "email confirmed", "wizard"],
    body: `You see this if you have the **Registrations** permission (a super-admin turns it on in Settings → Members).

**New registrations.** When families fill in the registration form, a yellow bar at the top of the Directory says how many are waiting. Tap **Review registrations** to see them, oldest first. Each one shows the player, the fee for their age group, how the family said they'd pay, the waiver, the homeschool answer, whether they need a uniform, and each parent's phone, email and what they can help with.

- **Approve** adds the player to the Directory under **No team yet** and puts their registration fee on the family's Payments account. Their parents are set up so they can sign in with the email on the form.
- **Not this season** takes the registration off the list. Nothing is added to the Directory or Payments.
- A note on a registration means the player's name is already on the roster. **Already on the roster** means Approve updates that player instead of adding a second one. If the birthdays don't match, Approve adds a second player, so check the birthday first and fix it on their player page if it's the same child.
- **Open the registration form ›** opens the form families fill in, so you can copy its link to send out.
- The form starts with the family's email and emails them a 6-digit code. Once they type it in, it fills in what we already know about any players on that email (names, birthdays, address and parents), so returning families just check it over. Brothers and sisters are registered together, and each one arrives here as their own registration. **Email confirmed** on a registration means the family typed the code back.

**Putting players on teams.** In the Directory, every player has a **Team** drop-down. Pick a team and the player moves there right away. Pick **No team yet** to take them off their team. Tap the **No team yet** chip at the top to see who still needs a team.

**Editing a player.** On a player's page, the **Team** drop-down works the same way, and **Edit player** changes their **Name**, **Birthday**, **Jersey number** and **Age group**. Tap **Save**.

**Taking a player off the roster.** In **Edit player**, **Take off the roster** removes a player who isn't in the program this season. Their parents stay as members. If the player has charges or payments on the Payments page, the Treasurer voids those first.`,
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
    routes: ["/portal/schedule"],
    keywords: ["schedule", "hs schedule", "high school", "season", "weekend", "tournament", "games", "varsity", "jv", "14u", "opponents", "teams coming", "who plays who", "which of our teams", "jv only", "all our teams", "on the fence", "maybe", "confirmed", "not coming", "facility", "secured", "trip", "overnight", "notes", "scores", "results", "record", "compare", "last season", "columns", "spreadsheet", "coaches", "filter", "needs work", "good to go", "waiting", "to do", "hotel", "hotels", "food", "restaurant", "where to eat", "where to stay", "travel", "room block", "rates"],
    body: `The high school season weekend by weekend, laid out like the planning spreadsheet's "HS Schedule" tab, for the coaches and the board. Every season has its own schedule, and the earlier ones stay to look back on.

**The grid.** A row per weekend, grouped by month: the dates and days, **Where** and the trip, the **Event**, a column for each of our teams (V, JV1, JV2, 14U A…) with its games, and **Notes** (the venue and game times). The event's color says how it stands, as in the spreadsheet: **Tentative** (red), **Need to secure facility** (yellow), **Final details in process** (pale yellow) and **Facility secured** (green); off and open weekends are grey. Under the event are the teams coming and how many are on the fence. **Total games** at the bottom adds up each team's games, with the record for a season that has scores.

**Show just some weekends.** The colors above the schedule are filters too, each with how many weekends it has. Tap **Tentative** or **Need to secure facility** to see what still needs work, **Final details in process** for what's waiting, or **Facility secured** for what's good to go. **Not sure yet** shows the weekends with a **3?**, and **Teams on the fence** the ones with a maybe. Tap more than one to see them together, and **All** to see every weekend again. While you're filtering, the total at the bottom adds up just the weekends showing.

**Where to stay and eat.** On a weekend away, a bed and a fork under **Where** count the hotels and places to eat we've saved there. Tap them for the list: each place's notes (rates, what worked last time), who to call or email, and its website. They come from External Contacts' **Hotels** and **Food** types: a place shows on the weekends in its **City**, or in a city it's tagged with.

**Who's coming.** Hover over a team's count (tap it on a phone) to see its games and the teams it plays: **Coming**, **On the fence** and **Not coming**, each linked to its program in External Contacts. In parentheses are the other teams of ours it plays that weekend, **(also JV1, JV2)**, with a **?** where it's a maybe. **For our other teams** lists the ones coming that weekend that don't play this team (a program bringing just its JV, on the varsity's card). Teams from the spreadsheet start out down for all our teams, and the card says so until you mark who plays whom. A **3?** with a dashed line means the games aren't settled yet; a small amber dot means a team is on the fence.

**Change it right there.** Press **Edit** on that card. Use **−** and **+** for the games, and tick **Not sure yet** if they aren't settled. For each team tap **Yes**, **Maybe** or **No**. Under it, tap the teams of ours it plays (**V**, **JV1**, **JV2**…) to add or take one off, or **All** for every team we bring: filled means you picked that team, outlined means it's there because of **All**, and dashed is a maybe. **Add a team** finds programs the way coaches write them (DMW, So Metro, RR), or keeps what you type as a name. Don't know the name? Press the space bar (or the down arrow) in the empty field, or tap the arrow at its right end, to see every team, then pick one with the arrows and Enter or with a click. For a weekend that's over, **Score** records the result. Everything saves as you go.

**A weekend's details.** Tap the event, or **Weekend details** on the card, to change its dates, **Where**, **Trip**, **Status**, **Notes**, **Facility** and **Details**, set every team's games at once, and see every team coming with the teams of ours it plays (the same chips as on the card). **Add weekend** adds one; **Delete** removes one.

**Seasons.** Use the arrows, or the season buttons, to move between seasons. **Compare with** puts another season's same weekend beside each row, so you can see what we did a year ago. **Season** changes the notes and the columns: add, rename, reorder or hide one, or link it to its team in the Directory. The board can also **Start 2027–28 from 2026–27** there (the same weekends a year on, with the teams that came now on the fence), or add a **+ New season**.

**Walk me through it.** Press **Show me around** next to this section's title, or tap **ⓘ** on the HS Schedule and then **Show me around**.`,
  },
  {
    id: "external-contacts",
    title: "External Contacts",
    group: "External Contacts",
    audience: "coaches",
    routes: ["/portal/contacts"],
    keywords: ["contacts", "vendors", "companies", "people", "photographer", "gym", "facility", "rent", "program", "programs", "opponents", "referees", "refs", "scheduler", "athletic director", "coach", "role", "team colors", "also known as", "account number", "billing", "tags", "nchc", "ndii", "phone", "email", "history", "changes", "who changed", "restore", "undo", "coaches can see", "read-only"],
    body: `Everyone outside the club we work with — other programs, gyms we rent, referees, vendors, photographers. The board sees and edits all of it. Coaches see the types the board shares with them (the programs, gyms and referees), read-only.

- **All** lists each company with the people who work there under it (their role, email and phone), then **People on their own**. **Companies** shows just the companies; **People** lists everyone, each with the company they work at.
- **Search** by name, role, email, phone, city, account number or type, or by another name a program goes by (like RR). Use the chips to show **Companies**, **People**, one **type**, or one **tag** (tap the tag again to show everyone).
- A person's page shows **Works at**: their company, with its details, and everyone else who works there. A company's page lists **People at this company**, and a program's or gym's page shows **On the HS Schedule**: every weekend it came to or hosted. Numbers are tap-to-call.

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

The coaches and the board see these places under each weekend away on the HS Schedule, with your notes. Only the board can delete a contact.`,
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
- Tap a photo, video or audio clip to preview it; other files open in a new tab. Files linked from outside Slack, like Google Docs, show a ↗ and open where they're kept.
- The **link** icon on a message copies a direct link you can share.
- **Photos →** opens the Photo Album for just that channel.`,
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
- Tap a photo to open it full-screen. Use the arrows (or ← and → keys) to move through them, **Show details** to see the caption and who posted it, **View in conversation** to see the Slack thread, and **Download original** to save it.
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
    body: `Who's using the portal and how. Open **Activity** near the bottom of the sidebar. Only you can see it for now — not other super-admins.

**At a glance.** The tiles count **Sign-ins · 7 days**, people **Active · 24 hours** and **Active · 7 days**, and **Previews · 30 days**. **People each day** charts how many members opened the portal each day for the last 30 days — hover over (or tap) a bar for that day's numbers. **Most visited pages** lists the pages people open most.

**Members.** Everyone with a portal login, most recently seen first, then approved members who haven't signed up yet (marked **Not signed up**, or **Directory only** when there's no email): their role, **Last sign-in**, **Last seen** (when, and the page they were on) and **Sessions · 30d**. Search by name or email, or tap **Seen in 30 days** or **Never signed in** to narrow the list.

**Sessions.** Tap a member to see each time they signed in: when, how long, how many pages and on what device. Tap a session to see every page they opened, in order, with how long they stayed on each. A long gap shows as **idle**.

**Preview as.** Tap **Preview as** on a member's row, then **Start preview**, to see the portal exactly as they do — the same pages, buttons and players. It's the quickest way to check what a parent or coach can see.

- A yellow bar across the top reminds you who you're previewing. Tap **Exit preview** to go back to your own account.
- **Anything you change during a preview really happens, as them** — so look, don't touch. The Audit Log credits those changes to you ("Jeff Malone (as Pat Smith)").
- A preview ends by itself after 2 hours. **Sign out** during a preview ends it and signs you out.
- You can preview anyone with a portal login, other super-admins included — but not yourself, or people who are waiting for approval or have had their login revoked.
- You can also preview someone marked **Not signed up**. The first preview sets up their portal login (no email goes out), and it's theirs when they sign in with that email. It has no password yet, and they don't need to know it was set up: **Continue with Slack**, **Email me a sign-in code** and **Request access** all work as usual (Request access emails them a code to confirm it's them, then saves the password they chose). After that, Settings no longer shows them as **Invited**. Members with no email (**Directory only**) can't be previewed.
- While you're previewing, Activity is hidden (you're seeing exactly what they see) and you can't start another preview until you exit.

**Previews** lists every preview — who previewed whom, when and for how long — and each one's pages show in that member's sessions, marked **Preview**. Previews don't count toward a member's own sign-ins or last seen.

Activity is recorded from the day this page went live.`,
  },
  {
    id: "admin-roles",
    title: "Board roles",
    group: "Settings",
    audience: "staff",
    keywords: ["admin", "super-admin", "super admin", "board", "building committee", "role", "permission", "access", "who can"],
    body: `There are three kinds of account:

| | Member | Board | Super-admin |
|---|---|---|---|
| Directory, Playbooks, Slack Archive | ✓ | ✓ | ✓ |
| See every player, fees, waivers and volunteer interests | | ✓ | ✓ |
| Member notes on profiles | | ✓ | ✓ |
| External Contacts: add, edit, history | | ✓ | ✓ |
| Approve or deny access requests | | ✓ | ✓ |
| Check players off on requirements (handbook signature, fees) | | ✓ | ✓ |
| Set up requirements in Settings | | With **Settings: Edit** | ✓ |
| Every family's balance; record payments | With **Payments** | With **Payments** | ✓ |
| Review new registrations; put players on teams; edit and remove players | With **Registrations** | With **Registrations** | ✓ |
| Add and edit the hotels and places to eat in External Contacts | With **Travel** | ✓ | ✓ |
| Add, edit and remove members; change roles | | | ✓ |
| Set up teams and volunteer roles; assign volunteers | | | ✓ |

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
    routes: ["/portal/settings"],
    keywords: ["settings", "members", "approve", "deny", "pending", "access request", "badge", "not signed up", "restore", "invite", "add member", "role", "revoke", "login", "family", "spouse", "parents", "children", "grants", "payments", "treasurer", "registrations", "manages"],
    body: `Where new sign-ups are approved and member accounts are managed.

**The red badge** on **Settings** in the sidebar counts access requests waiting for you.

**Reviewing requests.** The **Pending** tab lists people who have signed up and asked for access.

- **Approve** lets them in and emails them a sign-in link.
- **Deny** turns them away. They'll see **Access not granted** if they try to sign in.
- Changed your mind? On the **Denied** tab, **Approve** them or **Restore to pending**.
- **Not signed up** lists parents from player registrations who haven't created a login yet. Approving one ahead of time lets them straight in when they sign up.
- Use the search box to find someone by name or email; **Approved** lists everyone with access.

**Super-admins can also:**

- **+ Add member** — set someone up ahead of time. With an email, they finish by requesting access with that email. Leave the email blank to add a **directory-only** entry (a grandparent, say) who won't sign in.
- **Edit** anyone's profile: name, nickname, phone, birthday, photo and email, plus their **Family** links (spouse, parents and children). The same **✎ Edit** is on each member's Directory profile.
- Change someone's **role** (Member / Board / Super-admin) from the drop-down on the **Approved** tab.
- **Revoke login** to take away someone's access while keeping them in the directory, and **Restore login** to give it back.
- Next to **Manages:** on the **Approved** tab, turn on **Payments** to let someone see every family's balance and record payments (the Treasurer, and anyone helping them), **Registrations** to let someone review new registrations, put players on teams and edit players, and **Travel** to let the travel coordinator add and edit the hotels and places to eat in External Contacts. They all work for members and board alike. Tap one again to take it away.
- **Remove** a member (demote a super-admin first).

Chips on a row: **You**, **Invited** (has an email but hasn't signed up), **Directory only** (no email), **No login** (access revoked).`,
  },
  {
    id: "settings-teams",
    title: "Settings: Teams",
    group: "Settings",
    audience: "super_admin",
    keywords: ["teams", "settings", "new team", "age group", "color", "colour", "division", "practice times", "practice location", "season", "delete team"],
    body: `Set up this season's teams. Open **Settings → Teams**.

- **+ New team** — give it a **Team name** (e.g. Gold), then pick an **Age group** (10U–18U) and **Team color**, and add the **Division**, **Practice times** and **Practice location**. Separate more than one practice time with a semicolon.
- Tap the **pencil** to edit a team, or the **trash** can to delete one — its players go back to **No team yet** and its volunteer spots are cleared.
- **Staff & volunteers →** opens the team's page in the Directory, where you assign coaches and volunteers.

What you enter here shows on the team's Directory banner and team page. Players are put on teams in the Directory, with the **Team** drop-down on each player.`,
  },
  {
    id: "settings-volunteer-roles",
    title: "Settings: Volunteer Roles",
    group: "Settings",
    audience: "super_admin",
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
    body: `Choose what players need to hand in or pay. Open **Settings → Requirements**. Super-admins can always use this tab. A board member can too once a super-admin turns on their **Settings: Edit** chip in **Settings → Members**.

- **Add requirement** — give it a **Name** (what the board sees on each player, like Handbook signature) and a **Description** if it helps.
- **Type** — **Task / form** is marked **Done**; **Fee** is marked **Paid** and asks for an **Amount**.
- **Due date** is optional, a reminder for the board.
- **Applies to** — **All players**, or **Only some teams** (a tournament fee for one team, say). Tick the teams it covers.
- **Offer scan upload** lets the board attach a copy when they check a player off: scanned with the phone's camera, or a photo or PDF.
- **Active** — untick it to retire a requirement. It leaves the Directory but keeps everyone's record, and you can turn it back on later.

Use the arrows to change the order (it's the order of the chips in the Directory), and the **pencil** to edit. Super-admins, and board members whose **Delete** chip is on, can remove one with the **trash** can.`,
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
    id: "settings-sidebar-links",
    title: "Settings: Sidebar Links",
    group: "Settings",
    audience: "super_admin",
    keywords: ["sidebar", "links", "link", "schedule", "website", "url", "web address", "new tab", "menu", "shortcut", "reorder"],
    body: `Add your own links to the bottom of everyone's sidebar — the season schedule, a sign-up form, the club store. Open **Settings → Sidebar Links**.

- **Add link** — type a **Label** (the name people see, like Schedule) and the **Link** (a web address like https://schedule.omahalightningbasketball.com/, or a portal page like /portal/docs). Tap **Add link**.
- **Open in a new browser tab** is ticked to start with, so the portal stays open. Untick it for a link that should open in the same tab.
- Use the arrows to change the order, the **pencil** to edit a link, and the **trash** can to remove it.

Every signed-in member sees the links; only super-admins can change them.`,
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
  return viewer.role === "super_admin";
}

export function canSeeGuideSection(section: GuideSection, viewer: GuideViewer | null | undefined): boolean {
  if (section.preview && !viewer?.seesFullUi) return false;
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
