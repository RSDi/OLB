// In-app release notes. Dated entries the board (and later a What's new
// page) can read. Newest first. Audience matches the User Guide: "staff" is
// the board and super-admins; "super_admin" is narrower; "everyone" is
// anyone approved.

export type ReleaseAudience = "everyone" | "staff" | "super_admin";

export interface ReleaseNote {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  audience: ReleaseAudience;
  summary: string;
  body: string;
}

export const RELEASES: ReleaseNote[] = [
  {
    id: "2026-10-16-age-eligibility",
    date: "2026-10-16",
    title: "Age eligibility and swing-ups",
    audience: "staff",
    summary: "Conqueror league age caps, a season end date, and who can play up or move down.",
    body: `The board can set a **Season end date** and an **Age caps** table in **Settings → Season**. The Directory then shows each player's lowest eligible level through that date and flags anyone rostered on a level they age out of (**Ages out 10/25/26**).

**Available to swing up** on the Directory: pick a team (for example 14U White) to list younger players who can play up, and older players still age-eligible to move down, with age at season end and current team. Players whose own team already has a game that weekend on the HS Schedule are marked **Plays same weekend** (or hidden).

Birthdays and eligibility stay board-only.

Conqueror rule from Ted Smith via the league (16 Oct 2026): 8th / 14U cannot turn 15 during the season; 6th / 12U cannot turn 13; 5th cannot turn 12; 4th cannot turn 11; 3rd / 10U-ish cannot turn 10.`,
  },
];
