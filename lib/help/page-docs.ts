// Per-page help docs (hardcoded). The "i" button in the top bar opens the doc
// for the current route. Member-facing — plain, friendly, no jargon.
//
// Resolution: exact route match first, then the longest registered prefix
// (so /portal/tasks/<id> inherits the Tasks doc unless it has its own entry).
// Returns null when nothing matches → the top bar hides the "i" button.

export interface PageDoc {
  title: string;
  // Markdown. Rendered by MarkdownView in the info panel.
  body: string;
}

const DOCS: Record<string, PageDoc> = {
  "/portal": {
    title: "Dashboard",
    body: `Your home base in the church portal.

- **Make a request** — start a maintenance or building-use request right from here.
- **Recent activity** — see the latest requests and what's happening.
- Use the menu on the left to jump to Tasks, Events, the Directory, and more.
- The **search** box (top bar) finds people, tasks, events, and playbooks fast.

Look for the **ⓘ** in the top-right corner of any page for help like this.`,
  },

  "/portal/requests": {
    title: "Making a request",
    body: `Need something fixed, or want to use a space in the building? Submit it here.

- Pick the kind of request, then fill in the details — the more specific, the better.
- For building use, include the date, time, and which space you need.
- After you submit, the building committee reviews it. You'll be able to follow along on the **Tasks & Projects** page.
- You can add comments to your request at any time to share more info.`,
  },

  "/portal/tasks": {
    title: "Tasks & Projects",
    body: `Everything being worked on around the church lives here.

- **Tasks** are individual to-dos (a repair, a setup, a follow-up). **Projects** group related tasks together.
- Each task shows its status (Open, In Progress, Done) and who it's assigned to.
- Open a task to read the details, add a **comment**, or record a quick **voice note** that's transcribed for you.
- Big tasks can be promoted to a **Project** to track them as a group.
- The building committee assigns and reviews tasks; anyone can comment on their own.`,
  },

  "/portal/events": {
    title: "Events",
    body: `The church calendar — services, classes, meetings, and special events.

- Browse what's coming up. A **Repeats** badge means an event happens on a regular schedule.
- Open an event for the time, place, and details.
- Building-committee members can add events and link a **building-shutdown** procedure so the right steps happen after an event.`,
  },

  "/portal/directory": {
    title: "Directory",
    body: `The church family directory — find and connect with other members.

- Browse **All members**, **Households**, **Birthdays**, **Anniversaries**, and the **Phone tree**.
- Open anyone's profile for their contact info.
- **Edit your own profile** to keep your phone, birthday, and photo current. Set a **Nickname** (e.g. "Jeff") and that's how you'll appear on tasks and lists.
- Your **photo** comes from [Gravatar](https://gravatar.com) automatically — set one for your email and it shows up everywhere.
- Names in the directory show in full; everywhere else you'll see the short version.`,
  },

  "/portal/docs": {
    title: "Playbooks",
    body: `Step-by-step guides for how we do things around the church.

- Each playbook is a reference doc. Some also have one or more **procedures** — runnable checklists (for example, a Soundbooth **Startup** and **Shutdown**).
- To run a procedure, open the playbook, pick the procedure, press **Start**, and check off each step.
- When you finish, it's logged — and, if the procedure is set up to, the team gets a heads-up.`,
  },

  "/portal/reelnotes": {
    title: "ReelNotes",
    body: `Capture a note by **voice** instead of typing.

- Record a thought, and ReelNotes transcribes it and pulls out any **action items** automatically.
- You can also record straight onto a task's comments — the transcript and action items land right on that task.
- Action items can be pushed to **Things** (on Apple devices) for your own to-do list.`,
  },

  "/portal/pm": {
    title: "Preventative maintenance",
    body: `Recurring upkeep for the building and equipment, scheduled ahead of time.

- PM tasks are generated automatically from templates on their schedule.
- Open one to see its checklist and mark it complete.
- This area is for the building committee.`,
  },

  "/portal/review": {
    title: "Review queue",
    body: `Where the building committee reviews and decides on incoming requests.

- Each pending request is decided by a simple majority vote of the committee.
- A "no" vote asks for a short note explaining why.
- Once decided, the requester is notified automatically.`,
  },

  "/portal/settings": {
    title: "Settings",
    body: `Admin tools for the building committee.

- **Members** — approve new sign-ups, set roles, and edit profiles.
- **Categories, Areas, Priorities, Teams** — the building blocks the rest of the portal uses.
- **Integrations** — where ReelNotes lives.
- **Audit log** and **Deleted** items for keeping things tidy.`,
  },
};

// Resolve the doc for a path: exact match, else the longest registered prefix.
export function pageDocFor(pathname: string): PageDoc | null {
  if (DOCS[pathname]) return DOCS[pathname];
  const prefixes = Object.keys(DOCS)
    .filter(k => k !== "/portal") // don't let the root swallow every route
    .sort((a, b) => b.length - a.length);
  for (const key of prefixes) {
    if (pathname === key || pathname.startsWith(key + "/")) return DOCS[key];
  }
  if (pathname === "/portal") return DOCS["/portal"];
  return null;
}
