// Help Center (? → Help Center, /portal/help-center): short how-tos for the
// things people come to the portal to do, each a question with a few steps.
// The User Guide explains each page; these answer "how do I…". Each one
// points at its guide section (Read more) and, when there is one, the guided
// tour step that shows it on the real page (Show me how).
//
// KEEP IT CURRENT alongside the guide and tours: rename a button, rename it
// here too. tests/unit/help-center.test.ts fails when a how-to names a guide
// section or tour that doesn't exist, a tour step that isn't in its tour, or
// reaches people its guide section doesn't.
//
// Safe to import from client components.
import {
  GUIDE_SECTIONS,
  canSeeAudience,
  canSeeGuideSection,
  type GuideAudience,
  type GuideViewer,
} from "./guide.ts";
import { canSeeTour, getTour, tourStepsFor } from "./tours.ts";

export type HowToTopic = "Getting started" | "Your family" | "Around the club" | "Archives" | "Coaches" | "The board";

export const HOW_TO_TOPICS: HowToTopic[] = ["Getting started", "Your family", "Around the club", "Archives", "Coaches", "The board"];

export interface HowTo {
  id: string;
  // The question, the way someone would ask it.
  question: string;
  topic: HowToTopic;
  // The User Guide section with the full story (Read more). The how-to
  // reaches the same people that section does.
  sectionId: string;
  // Narrower than the section, e.g. a board-only task on a page everyone uses.
  audience?: GuideAudience;
  // Markdown, one short step each.
  steps: string[];
  // Show me how: this guided tour, starting at the step pointing at
  // `tourTarget` (or at the start).
  tourId?: string;
  tourTarget?: string;
  keywords?: string[];
}

export const HOW_TOS: HowTo[] = [
  // ── Getting started ────────────────────────────────────────────────
  {
    id: "sign-in-code",
    question: "How do I sign in without a password?",
    topic: "Getting started",
    sectionId: "getting-in",
    steps: [
      "On the login page, tap **Email me a sign-in code**.",
      "Enter the email you use with the club.",
      "Type in the code we email you (or tap the button in the email) and you're in.",
      "In the club's Slack? **Continue with Slack** is even quicker.",
    ],
    keywords: ["login", "log in", "code", "slack", "password"],
  },
  {
    id: "forgot-password",
    question: "I forgot my password. How do I reset it?",
    topic: "Getting started",
    sectionId: "getting-in",
    steps: [
      "On the login page, tap **Forgot password?** next to the Password label.",
      "Type in the code we email you.",
      "Choose a new password (at least 8 characters).",
    ],
    keywords: ["reset", "password", "locked out", "can't sign in"],
  },
  {
    id: "install-app",
    question: "How do I put the portal on my phone's home screen?",
    topic: "Getting started",
    sectionId: "install-app",
    steps: [
      "**iPhone or iPad (Safari):** tap **Share**, then **Add to Home Screen**, then **Add**.",
      "**Android (Chrome):** tap the **⋮** menu, then **Add to Home screen** (or **Install app**).",
      "Open it from your home screen and sign in once. It shows up as **OLB - Portal**.",
    ],
    keywords: ["app", "home screen", "install", "iphone", "android"],
  },
  {
    id: "turn-on-notifications",
    question: "How do I get notifications on my phone?",
    topic: "Getting started",
    sectionId: "notifications",
    steps: [
      "On an iPhone or iPad, put the portal on your home screen first and open it from there.",
      "Tap **Notifications** near the bottom of the sidebar.",
      "Tap **Turn on notifications** and say **Allow** when asked.",
      "Tap **Send a test** to make sure it works.",
    ],
    keywords: ["push", "alerts", "notify"],
  },
  {
    id: "ask-the-board",
    question: "Something isn't working. How do I get help?",
    topic: "Getting started",
    sectionId: "ask-for-help",
    steps: [
      "Tap **?** in the top-right corner, then **Ask for help**.",
      "Say what you were trying to do. Add a screenshot or **Record screen** if it helps.",
      "Press **Send**. When the board replies, a dot shows on **?**. Read it under **My requests**.",
    ],
    keywords: ["help", "problem", "bug", "broken", "contact", "support", "question"],
  },
  {
    id: "whats-new",
    question: "How do I see what's new in the portal?",
    topic: "Getting started",
    sectionId: "settings-release-notes",
    steps: [
      "Tap **?**, then **Release Notes** (or **Settings → Release Notes**).",
      "Newest changes are at the top.",
      "Tap **Show me how →** on a change to be walked through it.",
    ],
    tourId: "settings-release-notes",
    tourTarget: "settings-tab-release-notes",
    keywords: ["release notes", "changes", "updates", "new features"],
  },

  // ── Your family ────────────────────────────────────────────────────
  {
    id: "update-profile",
    question: "How do I change my phone number or nickname?",
    topic: "Your family",
    sectionId: "your-profile",
    steps: [
      "Find yourself in the **Directory** (under your player) and tap your name.",
      "Tap **✎ Edit profile**.",
      "Change your name, **nickname**, phone or birthday, then **Save**.",
      "Email changed? Ask a board member to update it.",
    ],
    keywords: ["profile", "phone", "nickname", "photo", "edit", "my info"],
  },
  {
    id: "see-balance",
    question: "How do I see what we owe, and how do I pay?",
    topic: "Your family",
    sectionId: "your-balance",
    steps: [
      "Tap **Payments** in the sidebar (it shows once the Treasurer has your balance ready).",
      "The big number at the top is what's **due**.",
      "To pay, Venmo the club with your player's name in the note, or pay by check.",
      "Your payment shows here once the Treasurer records it, which can take a few days.",
    ],
    keywords: ["pay", "fees", "balance", "venmo", "owe", "money"],
  },
  {
    id: "watch-plays",
    question: "How do I watch my team's plays?",
    topic: "Your family",
    sectionId: "team-playbook",
    steps: [
      "Tap **Team Playbook** in the sidebar.",
      "Pick your team at the top, then a play from the list.",
      "Press **Play**. Tap a step to watch just that part, and turn on **Captions** or **Sound** to hear the coach.",
    ],
    keywords: ["plays", "playbook", "offense", "defense", "court"],
  },

  // ── Around the club ────────────────────────────────────────────────
  {
    id: "find-contact",
    question: "How do I find a player's or parent's phone number?",
    topic: "Around the club",
    sectionId: "directory",
    steps: [
      "Tap **Directory** in the sidebar.",
      "Type a player's or parent's name in **Search** (or 3 or more digits of a phone number).",
      "Each player shows their parents' phone and email. Tap a name for the full page.",
    ],
    tourId: "directory",
    tourTarget: "directory-search",
    keywords: ["phone", "email", "contact", "directory", "parent", "find someone"],
  },
  {
    id: "team-roster",
    question: "How do I see my team's roster and coaches?",
    topic: "Around the club",
    sectionId: "team-pages",
    steps: [
      "Tap **Directory** in the sidebar.",
      "Pick your team from the **All teams** drop-down.",
      "Tap **Team page ›** for its coaches, volunteers and full roster.",
    ],
    tourId: "directory",
    tourTarget: "directory-teams",
    keywords: ["roster", "team", "coach", "volunteers", "practice"],
  },
  {
    id: "find-playbook",
    question: "Where do I find how the club does things?",
    topic: "Around the club",
    sectionId: "playbooks",
    steps: [
      "Tap **Playbooks** in the sidebar.",
      "Tap one to open it, or search for it from the top bar.",
    ],
    tourId: "playbooks",
    tourTarget: "playbooks-card",
    keywords: ["playbook", "how to", "procedure", "rules", "policy"],
  },
  {
    id: "ask-a-question",
    question: "Can I just ask a question about the club?",
    topic: "Around the club",
    sectionId: "ask-a-question",
    steps: [
      "Open the Search page: add **/portal/search** to the portal's web address.",
      "Type a question like \"When is our next game?\" and press **Enter**.",
      "Tap the small numbers or **Sources** to check where each answer came from.",
    ],
    keywords: ["search", "ai", "question", "answer", "assistant"],
  },

  // ── Archives ───────────────────────────────────────────────────────
  {
    id: "old-slack-message",
    question: "How do I find an old Slack message?",
    topic: "Archives",
    sectionId: "slack-archive-search",
    steps: [
      "Go to **Archives → Slack** and tap **Search archive →**.",
      "Type words to find; put **\"an exact phrase\"** in quotes.",
      "Narrow it with **Channel** or **User**, then **Jump to message ↗**.",
    ],
    tourId: "slack-archive-search",
    tourTarget: "archive-search-text",
    keywords: ["slack", "message", "old", "search", "archive"],
  },
  {
    id: "team-photos",
    question: "How do I find and save team photos?",
    topic: "Archives",
    sectionId: "slack-archive-album",
    steps: [
      "Go to **Archives** and open the **Album** tab.",
      "Search a caption, person, channel or month (like \"june 2024\"), or pick **Photos**.",
      "Tap a photo to open it, then **Download original** to save it.",
    ],
    tourId: "slack-archive-album",
    tourTarget: "album-search",
    keywords: ["photos", "pictures", "videos", "album", "download"],
  },

  // ── Coaches ────────────────────────────────────────────────────────
  {
    id: "add-play",
    question: "How do I add a play from a video?",
    topic: "Coaches",
    sectionId: "team-playbook-coaches",
    steps: [
      "In **Team Playbook**, tap **+ Add a play from a video** and pick the video (a whiteboard talk-through works best).",
      "Add a name, the coaches and the teams, then **Create play**. Keep the page open until the upload finishes.",
      "A few minutes later it shows under **Not shared yet**. Check it, then **Share with the team**.",
    ],
    keywords: ["play", "video", "upload", "whiteboard", "draw"],
  },
  {
    id: "weekend-teams",
    question: "How do I mark which teams are coming to a weekend?",
    topic: "Coaches",
    sectionId: "hs-schedule",
    steps: [
      "Open **HS Schedule** and find the weekend.",
      "Tap a team's count to open its card, then **Edit**.",
      "Tap **Yes**, **Maybe** or **No** beside each team.",
    ],
    tourId: "hs-schedule",
    tourTarget: "schedule-cell",
    keywords: ["schedule", "weekend", "tournament", "coming", "maybe"],
  },

  // ── The board ──────────────────────────────────────────────────────
  {
    id: "approve-access",
    question: "How do I let someone into the portal?",
    topic: "The board",
    sectionId: "settings-members",
    steps: [
      "Open **Settings → Members**. The red badge on **Settings** counts who's waiting.",
      "On the **Pending** tab, tap **Approve**. They get an email with a sign-in link.",
      "Changed your mind? **Denied** has **Approve** and **Restore to pending**.",
    ],
    tourId: "settings-members",
    tourTarget: "members-status",
    keywords: ["approve", "access", "pending", "new member", "sign up"],
  },
  {
    id: "check-off-requirement",
    question: "How do I check off a player's handbook or fee?",
    topic: "The board",
    sectionId: "player-requirements",
    steps: [
      "In the **Directory**, tap the player's red chip (like **Needs Handbook signature**).",
      "Pick **Done** (or **Paid**), **Waived** or **Not yet**, and set the date.",
      "Attach a scan if you have one, then **Save**.",
      "To see who's still missing, pick the requirement from **All requirements**, then **Missing**.",
    ],
    tourId: "requirements",
    tourTarget: "requirement-chip",
    keywords: ["requirement", "handbook", "fee", "waiver", "scan", "missing"],
  },
  {
    id: "email-a-team",
    question: "How do I email all the families on one team?",
    topic: "The board",
    sectionId: "email-families",
    steps: [
      "In the **Directory**, pick the team from **All teams**.",
      "Tap **Email families**. Tap **see who gets it** to leave anyone out.",
      "Pick a **Template** or write your own, then send. A copy is kept on each player's page.",
    ],
    tourId: "email-families-send",
    tourTarget: "directory-email",
    keywords: ["email", "families", "team", "message", "send"],
  },
  {
    id: "answer-help-request",
    question: "How do I answer someone's help request?",
    topic: "The board",
    sectionId: "help-requests",
    steps: [
      "Open **Help Requests** in the sidebar (or **Open in portal** on the #olb-help post in Slack).",
      "Tap the request to see the page it came from and any screenshot or video.",
      "Write a reply and press **Send**, or **Reply and close** if that settles it.",
    ],
    keywords: ["help requests", "reply", "support", "olb-help"],
  },
  {
    id: "film-moment",
    question: "How do I share a moment from a game video?",
    topic: "The board",
    sectionId: "film",
    steps: [
      "Open **Film** and tap **Watch** on the video.",
      "Pause at the moment (use **‹ Frame** and **Frame ›** to get it exact).",
      "Tap **Copy link to this moment** and paste it wherever you like.",
    ],
    tourId: "film",
    tourTarget: "film-play",
    keywords: ["film", "video", "game", "link", "moment", "youtube"],
  },
];

const SECTIONS = new Map(GUIDE_SECTIONS.map(s => [s.id, s]));

export function canSeeHowTo(h: HowTo, viewer: GuideViewer | null | undefined): boolean {
  const section = SECTIONS.get(h.sectionId);
  if (!section || !canSeeGuideSection(section, viewer)) return false;
  return !h.audience || canSeeAudience(h.audience, viewer);
}

export function howTosFor(viewer: GuideViewer | null | undefined): HowTo[] {
  return HOW_TOS.filter(h => canSeeHowTo(h, viewer));
}

// Show me how: the tour and the step to start on, when this viewer can run
// it. A step this viewer doesn't get starts the tour from the beginning.
export function howToTour(h: HowTo, viewer: GuideViewer | null | undefined): { tourId: string; step?: number } | null {
  if (!h.tourId) return null;
  const tour = getTour(h.tourId);
  if (!tour || !canSeeTour(tour, viewer)) return null;
  if (!h.tourTarget) return { tourId: tour.id };
  const step = tourStepsFor(tour, viewer).findIndex(s => s.target === h.tourTarget);
  return step >= 0 ? { tourId: tour.id, step } : { tourId: tour.id };
}

/** Matches every word of the search in the question, steps or keywords. */
export function matchesHowTo(h: HowTo, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [h.question, ...h.steps, ...(h.keywords ?? [])].join(" ").toLowerCase().replace(/\*\*/g, "");
  return words.every(w => hay.includes(w));
}
