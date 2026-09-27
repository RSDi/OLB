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
// when a portal page has no section. The guided tours in ./tours.ts retell
// sections step by step, pointed at the real buttons — keep them in step too.
//
// Written for parents, players' families and the board — plain, friendly, no
// jargon. Bodies are markdown (rendered by MarkdownView). Safe to import from
// client components.

import type { MemberRole, MemberStatus } from "../auth/permissions";

// Who a section is for. "staff" = board members and super-admins; the guide
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

export const GUIDE_SECTIONS: GuideSection[] = [
  // ─── Everyone ────────────────────────────────────────────────────────────
  {
    id: "getting-in",
    title: "Signing in",
    audience: "everyone",
    keywords: ["login", "log in", "sign in", "password", "forgot", "reset", "code", "slack", "register", "request access", "pending", "approved", "denied", "account"],
    body: `The member portal is for Omaha Lightning families, coaches and the board. Use the **Login** link at the bottom of the club website, or go straight to the login page.

**Three ways to sign in**

- **Continue with Slack** — the quickest. If you're in the club's Slack workspace, this gets you in right away, even if you're new.
- **Email and password** — the account you created when you requested access.
- **Email me a sign-in code** — no password needed. Enter your email, we email you a code, type it in and you're in. (If the email shows a sign-in button instead of a code, tapping the button works too.) Codes only work for email addresses that already have an account.

**Forgot your password?** Tap **Forgot password?** next to the Password label. We'll email you a code; type it in, then choose a new password (at least 8 characters).

**New here?** Tap **Request access**, then either use **Continue with Slack** or fill in your name, email and a password. If you're asked to confirm your email, click the link we send you.

**Waiting for approval.** Unless you came in through the club's Slack, someone from the club reviews each new request. Until then you'll see **Request submitted** when you try to sign in. You'll get an email ("You're in — Omaha Lightning member portal") as soon as you're approved. If you see **Access not granted** and think it's a mistake, use the club's Contact page.

**Registered a player?** If your email is on a player registration, your account is already set up for you — request access with that same email and you'll be linked to your family.`,
  },
  {
    id: "getting-around",
    title: "Getting around",
    audience: "everyone",
    keywords: ["navigation", "menu", "sidebar", "links", "schedule", "new tab", "collapse", "mobile", "phone", "home", "search", "info", "help", "sign out", "log out", "shortcut", "command k", "ctrl k", "scroll", "back to top", "jump to top", "tour", "walkthrough", "show me around", "take the tour"],
    body: `**Home is the Directory.** After you sign in you land on the Directory of players and parents.

**The sidebar** on the left has everything you can use — you only see the parts that apply to you:

- **Directory** — players, parents, teams, coaches and volunteers.
- **Playbooks** — how-to guides and step-by-step checklists.
- **Slack Archive** — past messages, photos and files from the club's Slack.
- **User Guide** — this page, near the bottom of the sidebar.
- **Sign out** — at the very bottom.

Board members also see **External Contacts**, and **Settings** just below **User Guide**.

Below a thin line you may see extra links the club has added, like **Schedule**. Most open in a new browser tab, so the portal stays open where you left it.

On a computer, **Collapse** (bottom of the sidebar) shrinks it to icons. On a phone, tap the **menu** button at the top left to open it.

**Search.** The search box at the top of every page finds members, playbooks and Slack messages (and, for the board, external contacts). Press **⌘K** on a Mac or **Ctrl K** on Windows to jump to it from anywhere. Type at least 2 letters, use the arrow keys and **Enter** to open a result, and **Esc** to close. Your last few searches are remembered under **Recent**. To find a *player*, use the search box on the Directory page instead.

**Back to the top.** On a long page, once you scroll down a yellow round button with an up arrow appears in the bottom right corner. Tap it to jump back to the top of the page.

**Help on every page.** Tap the **ⓘ** button in the top bar to read about the page you're on, then **Open the User Guide** for the full guide. Some form fields also have a small **ⓘ** next to their label — hover or tap it for a quick tip.

**Guided tours.** A tour walks you around step by step, pointing at each button and explaining what it does. Press **Next** and **Back** (or the ← and → keys) to move along, and **Skip tour** or **Esc** to stop. Start the welcome tour any time with **Take the tour** at the top of this guide (if your account is new, it starts by itself the first time you open the portal). For a tour of just one page, tap **ⓘ** on that page and then **Show me around**, or press **Show me around** next to a section's title below.`,
  },
  {
    id: "directory",
    title: "Directory",
    audience: "everyone",
    routes: ["/portal/directory"],
    keywords: ["players", "parents", "roster", "team", "age group", "10U", "12U", "14U", "16U", "18U", "phone", "email", "address", "contact info", "jersey", "profile", "family", "search"],
    body: `This season's players and their parents, grouped by team.

- **Search** by player, parent, email or phone number (type 3 or more digits to match a phone).
- Tap a **team** chip to show just that team. You'll see the team's division, practice times and location, and who's coaching and helping out. **All teams** shows everyone; **No team yet** shows players who haven't been placed.
- Coaches, other team leaders and board members can switch between **By team** and **By age group** (10U–18U).
- Each player shows their jersey number, team, age and birthday, address, and their parents' phone and email. A **New** chip means it's their first season with us.
- Tap a parent's name to open their profile, and **Team page ›** to open a team's full page.

**Who's listed.** Players appear when their family said yes to being in the directory on the registration form.

**Profiles.** A member's profile shows their photo, phone, email and birthday, plus their players and family. Your own profile has **✎ Edit profile** — see *Your profile* below.`,
  },
  {
    id: "team-pages",
    title: "Team pages",
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
    id: "your-profile",
    title: "Your profile",
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
    id: "playbooks",
    title: "Playbooks",
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
    id: "slack-archive",
    title: "Slack Archive",
    audience: "everyone",
    routes: ["/portal/slack-archive"],
    keywords: ["slack", "archive", "messages", "channels", "threads", "history", "private", "jump to date", "filter", "link", "attachments", "files"],
    body: `The full history of the club's Slack channels, updated every night — so nothing gets lost when Slack hides older messages.

**Which channels you see.** Every public channel, plus the private channels you're a member of in Slack. That's matched by email, so your portal email needs to be the same one you use in Slack.

**Reading a channel.** Pick a channel from the list (or switch with the drop-down at the top of a channel).

- Messages are grouped by day, with each thread's replies tucked under the first message.
- **Newest first / Oldest first** flips the order.
- **Jump to date** opens a calendar — tap any highlighted day to go straight there.
- **Filter** shows only the threads a certain person posted in.
- Tap a photo, video or audio clip to preview it; other files open in a new tab.
- The **link** icon on a message copies a direct link you can share.
- **Photos →** opens the Photo Album for just that channel.`,
  },
  {
    id: "slack-archive-search",
    title: "Searching the Slack Archive",
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

  // ─── Board ───────────────────────────────────────────────────────────────
  {
    id: "admin-roles",
    title: "Board roles",
    audience: "staff",
    keywords: ["admin", "super-admin", "super admin", "board", "building committee", "role", "permission", "access", "who can"],
    body: `There are three kinds of account:

| | Member | Board | Super-admin |
|---|---|---|---|
| Directory, Playbooks, Slack Archive | ✓ | ✓ | ✓ |
| See every player, fees, waivers and volunteer interests | | ✓ | ✓ |
| Member notes on profiles | | ✓ | ✓ |
| External Contacts | | ✓ | ✓ |
| Approve or deny access requests | | ✓ | ✓ |
| Check players off on requirements (handbook signature, fees) | | ✓ | ✓ |
| Set up requirements in Settings | | With **Settings: Edit** | ✓ |
| Add, edit and remove members; change roles | | | ✓ |
| Set up teams and volunteer roles; assign volunteers | | | ✓ |

**Board extras around the portal**

- The **Directory** shows every player — including families who asked not to be listed (marked **Not in directory**) — plus **No waiver**, fee and shirt details, and each parent's volunteer interests (**Can help**). **Not signed up** and **Awaiting approval** chips show which parents don't have access yet.
- Each player also has a chip for every requirement, like the handbook signature — see *Player requirements* below.
- Every profile has a **Member notes** panel only the board can see. Type a note and tap **Save notes**.`,
  },
  {
    id: "settings-members",
    title: "Settings: Members",
    audience: "staff",
    routes: ["/portal/settings"],
    keywords: ["settings", "members", "approve", "deny", "pending", "access request", "badge", "not signed up", "restore", "invite", "add member", "role", "revoke", "login", "family", "spouse", "parents", "children", "grants"],
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
- **Remove** a member (demote a super-admin first).

Chips on a row: **You**, **Invited** (has an email but hasn't signed up), **Directory only** (no email), **No login** (access revoked).`,
  },
  {
    id: "settings-sidebar-links",
    title: "Settings: Sidebar Links",
    audience: "super_admin",
    keywords: ["sidebar", "links", "link", "schedule", "website", "url", "web address", "new tab", "menu", "shortcut", "reorder"],
    body: `Add your own links to the bottom of everyone's sidebar — the season schedule, a sign-up form, the club store. Open **Settings → Sidebar Links**.

- **Add link** — type a **Label** (the name people see, like Schedule) and the **Link** (a web address like https://schedule.omahalightningbasketball.com/, or a portal page like /portal/docs). Tap **Add link**.
- **Open in a new browser tab** is ticked to start with, so the portal stays open. Untick it for a link that should open in the same tab.
- Use the arrows to change the order, the **pencil** to edit a link, and the **trash** can to remove it.

Every signed-in member sees the links; only super-admins can change them.`,
  },
  {
    id: "settings-playbooks",
    title: "Settings: Playbooks",
    audience: "super_admin",
    keywords: ["playbooks", "settings", "categories", "category", "chip", "color", "colour", "sort order", "delete playbook"],
    body: `Keep the playbook categories tidy and see every playbook in one list. Open **Settings → Playbooks**.

- **Categories** group playbooks and set the colour of their label. **Add category** to make one — give it a **Name**, a **Chip color** and a **Sort order** (lower numbers come first). Tap the **pencil** to change one.
- **Playbooks** lists every playbook, newest-updated first. Tap one to open it and edit its content.

Tap the **trash** can to delete a category or a playbook.`,
  },
  {
    id: "settings-contact-types",
    title: "Settings: Contact Types",
    audience: "super_admin",
    keywords: ["contact types", "types", "categories", "external contacts", "vendors", "group", "filter", "slug", "sort order"],
    body: `The types used to group External Contacts — uniforms, photos, facilities, opponents and so on. Open **Settings → Contact Types**.

- **Add type** — give it a **Name** (e.g. Plumbing) and, if you like, a **Sort order** (lower numbers come first). The **Slug** fills itself in from the name.
- Types show up when someone adds an external contact, and as filter chips on the External Contacts page.
- Tap the **pencil** to rename a type, or the **trash** can to delete it. Contacts of that type aren't deleted — they just lose the grouping.`,
  },
  {
    id: "settings-audit-log",
    title: "Settings: Audit Log",
    audience: "super_admin",
    keywords: ["audit", "log", "history", "changes", "who changed", "member changes", "approved", "role change"],
    body: `A record of every change to a member's account — who made it, what changed and when. Open **Settings → Audit Log**.

The most recent 100 changes are listed, newest first: new members, approvals, role changes, profile edits and removals. Nothing here can be edited.`,
  },
  {
    id: "playbooks-editing",
    title: "Writing playbooks",
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
    id: "external-contacts",
    title: "External Contacts",
    audience: "staff",
    routes: ["/portal/contacts"],
    keywords: ["contacts", "vendors", "companies", "people", "photographer", "gym", "facility", "rent", "program", "account number", "billing", "tags", "phone", "email"],
    body: `Everyone outside the club we work with — vendors, photographers, gyms we rent, other programs. Only the board can see it.

- **Search** by name, email, phone, account number or type, and use the chips to show **Companies**, **People** or one **type**.
- **+ New contact** — choose **Company** or **Person**, then fill in what you know: contact info, account and billing details, notes (like how to re-order or who to call for quotes) and tags.
- Add the people you deal with at a company from its page with **+ Add person**, or pick their company under **Works at** when you add them.
- A contact's page shows everything about them, with tap-to-call phone numbers, and **Used by** lists the playbooks it's attached to. Tap **Edit** to make changes.

Super-admins can **Delete** a contact.`,
  },
  {
    id: "player-requirements",
    title: "Player requirements",
    audience: "staff",
    keywords: ["requirements", "handbook", "signature", "signed", "signature page", "fee", "fees", "paid", "owes", "waived", "scan", "upload", "photo", "missing", "collected", "checklist", "forms"],
    body: `Keep track of what each player has handed in or paid — the signed last page of the handbook, a tournament fee, a form. Only the board sees any of this.

**On each player.** In the **Directory**, every player has a chip for each requirement that applies to them:

- A red **Needs Handbook signature** (or **Owes** for a fee) means it's still missing.
- A green chip with a check means it's done or paid. A little page icon means a scan is attached.
- A grey **waived** chip means you've excused them.

**Checking a player off.** Tap the chip. Pick **Done** (**Paid** for a fee), **Waived** or **Not yet**, set the date, and add a **Note** if it helps (a check number, say). Then tap **Save**.

**Scans.** When a requirement offers it, tap **Upload scan** to attach a photo or PDF of what you collected — you can take the picture right from your phone. **View scan** opens it; **Replace scan** and **Remove scan** do what they say. Scans are private to the board.

**Who's still missing?** Pick a requirement from the **All requirements** drop-down above the list. **Missing** shows who still needs it, with counts for **Done** (or **Paid**), **Waived** and **All**. It works together with search and the team and age-group filters, and the line above the list shows how many are done.

Requirements start over each season, since each season has its own roster. The list itself is set up in **Settings → Requirements**.`,
  },
  {
    id: "settings-requirements",
    title: "Settings: Requirements",
    audience: "staff",
    keywords: ["requirements", "settings", "handbook", "signature", "fee", "tournament fee", "amount", "due date", "applies to", "teams", "retire", "active", "scan upload"],
    body: `Choose what players need to hand in or pay. Open **Settings → Requirements**. Super-admins can always use this tab. A board member can too once a super-admin turns on their **Settings: Edit** chip in **Settings → Members**.

- **Add requirement** — give it a **Name** (what the board sees on each player, like Handbook signature) and a **Description** if it helps.
- **Type** — **Task / form** is marked **Done**; **Fee** is marked **Paid** and asks for an **Amount**.
- **Due date** is optional, a reminder for the board.
- **Applies to** — **All players**, or **Only some teams** (a tournament fee for one team, say). Tick the teams it covers.
- **Offer scan upload** lets the board attach a photo or PDF when they check a player off.
- **Active** — untick it to retire a requirement. It leaves the Directory but keeps everyone's record, and you can turn it back on later.

Use the arrows to change the order (it's the order of the chips in the Directory), and the **pencil** to edit. Super-admins, and board members whose **Delete** chip is on, can remove one with the **trash** can.`,
  },
  {
    id: "settings-teams",
    title: "Settings: Teams",
    audience: "super_admin",
    keywords: ["teams", "settings", "new team", "age group", "color", "colour", "division", "practice times", "practice location", "season", "delete team"],
    body: `Set up this season's teams. Open **Settings → Teams**.

- **+ New team** — give it a **Team name** (e.g. Gold), then pick an **Age group** (10U–18U) and **Team color**, and add the **Division**, **Practice times** and **Practice location**. Separate more than one practice time with a semicolon.
- Tap the **pencil** to edit a team, or the **trash** can to delete one — its players go back to unassigned and its volunteer spots are cleared.
- **Staff & volunteers →** opens the team's page in the Directory, where you assign coaches and volunteers.

What you enter here shows on the team's Directory banner and team page.`,
  },
  {
    id: "settings-volunteer-roles",
    title: "Settings: Volunteer Roles",
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
    id: "slack-archive-admin",
    title: "Managing the Slack Archive",
    audience: "super_admin",
    routes: ["/portal/slack-archive/exceptions"],
    keywords: ["slack", "add channel", "channel id", "sync", "sync now", "refresh access", "deactivate", "exceptions", "errors", "previews", "compress", "large files"],
    body: `Super-admins choose which Slack channels are archived and keep an eye on the nightly sync.

- **+ Add channel** — give it a label and its Slack channel ID (in Slack: open the channel → View channel details → the ID is at the bottom).
- Each channel shows when it last synced and who can see it. **Deactivate** stops syncing a channel; its history stays browsable.
- **Refresh access** re-checks private-channel membership with Slack right away (it also happens every night).
- **Sync now** on a channel pulls in its newest messages without waiting for tonight — click again if it says there's more to catch up.
- **View all exceptions →** lists channels whose sync failed, attachments that didn't download, and videos too big to store (with **Compress large files now**).
- In the Photo Album, **Make previews now** creates any missing thumbnails.`,
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
  return viewer.role === "super_admin";
}

export function canSeeGuideSection(section: GuideSection, viewer: GuideViewer | null | undefined): boolean {
  return canSeeAudience(section.audience, viewer);
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
