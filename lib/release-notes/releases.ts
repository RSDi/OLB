// Hand-maintained release history for Settings → Release Notes and the
// "What's new" toast. Newest first. Omit `version` on a new entry — it is
// derived from the nearest versioned row below it (see withVersions).
import { withVersions, type AuthoredRelease, type Release } from "./model.ts";

export type { Release } from "./model.ts";
export {
  RELEASES_SEEN_EVENT,
  SEEN_PREF_KEY,
  cmpVersion,
  nextSeenVersion,
  seenReleaseVersion,
  unseenReleases,
} from "./model.ts";

const AUTHORED: AuthoredRelease[] = [
  {
    date: "October 16, 2026",
    title: "Age eligibility and swing-ups",
    color: "#c45c26",
    tour: ["settings-season", "directory"],
    features: [
      "Settings → Season has a Season end date (starts at December 31, 2026) and an editable Age caps table",
      "The Directory shows the lowest level a player is eligible for through that date, and Ages out when they are rostered on a level they age out of",
      "Available to swing up lists younger players who can play up to a team you pick, and older players still age-eligible to move down",
      "Birthdays and eligibility stay board-only",
    ],
  },
  {
    date: "October 16, 2026",
    title: "Tick families off before you send",
    color: "#2f7de1",
    tour: ["email-families-send", "slack-dms-send"],
    features: [
      "Email families and Slack families let you leave a family out of a send without changing the list filters",
      "Each family in see who gets it has a checkbox, all on to start; the count and Send button follow the ticks",
      "Select all / none ticks every family or none; changing Dads / Moms / Players, or the Directory filters, starts the ticks over",
    ],
  },
  {
    date: "October 16, 2026",
    title: "Roadmap Preview column",
    color: "#7c5cbf",
    features: [
      "The roadmap board has a Preview column between In progress and Released",
      "An item in Preview carries a Vercel preview link; Open preview opens it in a new tab",
      "The Product Manager bot can move an item one column forward (progress → preview needs the link)",
    ],
  },
  {
    date: "October 16, 2026",
    title: "Covered via sibling, and Travel sees every player",
    color: "#2a9d8f",
    tour: "hotel-covered-sibling",
    features: [
      "A player with no hotel-stay mark of their own shows Covered via sibling when a sibling is Booked in block or Staying elsewhere on the same stay",
      "Those players drop out of the Not yet known count and filter; they still show under All",
      "Travel can read every current-season player for hotel-stay tracking, including families who said no to the Directory",
    ],
  },
  {
    date: "October 16, 2026",
    title: "Staying elsewhere and sibling marking",
    color: "#e07a3d",
    tour: "hotel-staying-elsewhere",
    version: "26.10.0",
    features: [
      "Waived is now Staying elsewhere, Booked is Booked in block, and Missing is Not yet known",
      "Staying elsewhere needs a note (for example staying with family); the note shows on the chip",
      "When Travel marks Booked in block or Staying elsewhere, siblings on the same stay are ticked by default so one save covers them",
    ],
  },
];

export const RELEASES: Release[] = withVersions(AUTHORED);
