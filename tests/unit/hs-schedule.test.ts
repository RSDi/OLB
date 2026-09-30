// The HS Schedule's pure parts: matching the coaches' team names to programs
// (lib/hs-schedule/match.ts), and the dates, cells, totals and season carry-
// over (lib/hs-schedule/logic.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamIndex, findMentions, matchTeam, normalizeTeamName } from "../../lib/hs-schedule/match.ts";
import {
  addDays,
  carryWeekend,
  cellOpponents,
  formatWeekdays,
  formatWeekendDates,
  levelPlays,
  levelTotals,
  matchesWeekendFilters,
  matchingWeekends,
  nextWeekendDates,
  recordLabel,
  resultLabel,
  sortWeekends,
  summarizeCell,
  weekdayOf,
  weekendFacts,
  weekendFilterCounts,
  type WeekendFilter,
} from "../../lib/hs-schedule/logic.ts";
import type { HsGames, HsOpponent, HsWeekend } from "../../lib/hs-schedule/types.ts";

// Programs from the planning spreadsheet's Contacts tab (names and cities only).
const PROGRAMS = [
  ["Ames Vision", "Ames"],
  ["Christ Prep", "Kansas City"],
  ["Cornerstone Christian", "Topeka"],
  ["Countryside Classics", "Boone"],
  ["Des Moines Defenders", "Des Moines"],
  ["Des Moines Warriors", "Des Moines"],
  ["First Baptist", "Plattsmouth"],
  ["Hastings Red Tide", "Hastings"],
  ["KC East Lions", "Kansas City"],
  ["KC Metro Mavericks", "Kansas City"],
  ["Lincoln Eagles", "Lincoln"],
  ["Manhattan Chiefs", "Manhattan"],
  ["Mid Mo Mavericks", "Columbia"],
  ["North Metro Blazers", "Minneapolis"],
  ["NE Kansas", "Topeka"],
  ["OKC Knights", "Ok City"],
  ["Oklahoma Flame", "Tulsa"],
  ["Omaha Roadrunners", "Omaha"],
  ["Reno County Sabres", "Hutchinson"],
  ["Sioux City Warriors", "Sioux City"],
  ["Smoky Valley", "Salina"],
  ["South Metro Huskies", "Minneapolis"],
  ["St Louis Blue Knights", "St. Louis"],
  ["Sunrise Christian Academy", "Wichita"],
  ["Trinity Classical Academy", "Omaha"],
  ["Tulsa CHEF Arrows", "Tulsa"],
  ["Tulsa NOAH", "Tulsa"],
  ["Veritas Christian Eagles", "Lawrence"],
  ["Wichita Angels", "Wichita"],
  ["Wichita Defenders", "Wichita"],
  ["Wichita Warriors", "Wichita"],
];

const ALIASES: Record<string, string[]> = { "Omaha Roadrunners": ["RR"], "NE Kansas": ["NEK"] };

const index = buildTeamIndex(
  PROGRAMS.map(([name, city]) => ({ id: name, name, city, aliases: ALIASES[name] ?? [] }))
);
const m = (s: string, loose = false) => matchTeam(index, s, { loose })?.id ?? null;

test("names are compared without case, punctuation or spacing", () => {
  assert.equal(normalizeTeamName("  Mid-Mo  Mavs! "), "mid mo mavs");
  assert.equal(normalizeTeamName("Navy & Gold"), "navy and gold");
  assert.equal(m("ChristPrep"), "Christ Prep");
  assert.equal(m("OKC KNIGHTS"), "OKC Knights");
});

test("the coaches' short names find the program", () => {
  assert.equal(m("So Metro"), "South Metro Huskies");
  assert.equal(m("No Metro"), "North Metro Blazers");
  assert.equal(m("Wichita Def"), "Wichita Defenders");
  assert.equal(m("Witchita Def"), "Wichita Defenders");
  assert.equal(m("Des Moines Def"), "Des Moines Defenders");
  assert.equal(m("KC East"), "KC East Lions");
  assert.equal(m("Mid-Mo"), "Mid Mo Mavericks");
  assert.equal(m("Mid-Mo Mavs"), "Mid Mo Mavericks");
  assert.equal(m("St Louis Knights"), "St Louis Blue Knights");
  assert.equal(m("OK Flame"), "Oklahoma Flame");
  assert.equal(m("Surise"), "Sunrise Christian Academy");
  assert.equal(m("Lincoln"), "Lincoln Eagles");
  assert.equal(m("Smoky"), "Smoky Valley");
  assert.equal(m("DMW"), "Des Moines Warriors");
  assert.equal(m("RR"), "Omaha Roadrunners");
  assert.equal(m("NEK"), "NE Kansas");
});

test("a name that could be two programs stays unmatched", () => {
  assert.equal(m("Des Moines"), null); // Warriors or Defenders
  assert.equal(m("Wichita"), null);
  assert.equal(m("TCA"), null); // Trinity Classical Academy or Tulsa CHEF Arrows
  assert.equal(m("Knights", true), null);
});

test("common words and our own city never stand for a program", () => {
  assert.equal(m("Omaha"), null);
  assert.equal(m("Mid"), null);
  assert.equal(m("First"), null);
  assert.equal(m("Classic"), null);
  assert.equal(m("OKC Storm"), null);
  assert.equal(m("BluePrint"), null);
});

test("loose matching also takes one word of a name, or the only program in a city", () => {
  assert.equal(m("Classics"), null);
  assert.equal(m("Classics", true), "Countryside Classics");
  assert.equal(m("Plattsmouth"), null);
  assert.equal(m("Plattsmouth", true), "First Baptist");
  assert.equal(m("Tulsa", true), null); // two programs start with it, and more are there
});

test("mentions in running text: known programs only, never across list punctuation", () => {
  const found = (t: string) => findMentions(index, t).map((x) => x.match?.id);
  assert.deepEqual(
    found("Lincoln is open this weekend and would play someone, Adam is seeing if Smoky will come up too"),
    ["Lincoln Eagles", "Smoky Valley"]
  );
  assert.deepEqual(found("Mid-America Homeschool Hoops Classic"), []);
  assert.deepEqual(found("Central Iowa Homeschool Classic"), []);
  assert.deepEqual(found("BluePrint Tourney in Omaha at Levi Carter"), []);
  assert.deepEqual(found("Des Moines Warriors Invitational"), ["Des Moines Warriors"]);
  assert.deepEqual(found("Lincoln, Sioux City"), ["Lincoln Eagles", "Sioux City Warriors"]);
});

// ─── Dates ──────────────────────────────────────────────────────────────────

test("weekend dates read like the spreadsheet's", () => {
  assert.equal(formatWeekendDates("2026-11-12", "2026-11-14"), "Nov 12–14");
  assert.equal(formatWeekendDates("2025-01-31", "2025-02-01"), "Jan 31–Feb 1");
  assert.equal(formatWeekendDates("2027-01-02", "2027-01-02"), "Jan 2");
  assert.equal(formatWeekdays("2026-11-12", "2026-11-14"), "Thu–Sat");
  assert.equal(formatWeekdays("2027-01-02", "2027-01-02"), "Sat");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("a new weekend goes on the next Friday–Saturday, or November's first", () => {
  assert.deepEqual(nextWeekendDates(2026, []), { starts_on: "2026-11-06", ends_on: "2026-11-07" });
  assert.equal(weekdayOf("2026-11-06"), 5);
  assert.deepEqual(
    nextWeekendDates(2026, [{ starts_on: "2027-03-14", ends_on: "2027-03-19" }]),
    { starts_on: "2027-03-26", ends_on: "2027-03-27" }
  );
});

test("the same weekend in another season is 52 weeks away, give or take a day", () => {
  const last = [
    { id: "a", starts_on: "2025-11-14", ends_on: "2025-11-15" },
    { id: "b", starts_on: "2025-11-21", ends_on: "2025-11-22" },
  ];
  assert.deepEqual(
    matchingWeekends({ starts_on: "2026-11-12", ends_on: "2026-11-14" }, 2026, 2025, last).map((w) => w.id),
    ["a"]
  );
  assert.deepEqual(matchingWeekends({ starts_on: "2026-12-03", ends_on: "2026-12-05" }, 2026, 2025, last), []);
});

// ─── Cells ──────────────────────────────────────────────────────────────────

function opp(over: Partial<HsOpponent> & { id: string; name: string }): HsOpponent {
  return {
    weekend_id: "w1",
    level_id: null,
    contact_id: null,
    status: "confirmed",
    our_score: null,
    their_score: null,
    note: null,
    sort_order: 0,
    ...over,
  };
}

const games = (level: string, n: number | null, unsure = false): HsGames => ({
  weekend_id: "w1",
  level_id: level,
  games: n,
  unsure,
  note: null,
});

test("a cell lists its own teams, and the whole weekend's when that team plays", () => {
  const list = [
    opp({ id: "1", name: "Lincoln Eagles", contact_id: "lincoln" }),
    opp({ id: "2", name: "Lincoln Eagles", contact_id: "lincoln", level_id: "V", our_score: 50, their_score: 40 }),
    opp({ id: "3", name: "Veritas", status: "tentative" }),
    opp({ id: "4", name: "Hastings", level_id: "JV1" }),
    opp({ id: "5", name: "Elsewhere", weekend_id: "w2" }),
  ];
  // V: its own Lincoln row wins over the weekend's; Veritas comes along.
  assert.deepEqual(cellOpponents("w1", "V", list).map((o) => o.id), ["2", "3"]);
  assert.deepEqual(cellOpponents("w1", "JV1", list).map((o) => o.id), ["4", "1", "3"]);
  // A team of ours with no games that weekend only lists its own teams.
  assert.deepEqual(cellOpponents("w1", "14U", list, false).map((o) => o.id), []);
  assert.equal(levelPlays(games("V", 3)), true);
  assert.equal(levelPlays(games("V", null, true)), true);
  assert.equal(levelPlays(games("V", 0)), false);
  assert.equal(levelPlays(undefined), false);
});

test("a cell's count is the games entered, never guessed from the teams", () => {
  const list = [opp({ id: "1", name: "A" }), opp({ id: "2", name: "B" }), opp({ id: "3", name: "C", status: "tentative" })];
  const s = summarizeCell(games("V", 4), list);
  assert.equal(s.count, 4);
  assert.equal(s.tbd, 2);
  assert.equal(s.confirmed.length, 2);
  assert.equal(s.tentative.length, 1);
  assert.equal(summarizeCell(undefined, list).count, null);
  assert.equal(summarizeCell(games("V", null, true), []).unsure, true);
  assert.equal(resultLabel({ our_score: 71, their_score: 40 }), "W 71–40");
  assert.equal(resultLabel({ our_score: 45, their_score: 63 }), "L 45–63");
  assert.equal(resultLabel({ our_score: null, their_score: null }), null);
});

test("totals leave out off and canceled weekends, and count the record", () => {
  const weekends = [
    { id: "w1", status: "secured" as const },
    { id: "w2", status: "off" as const },
    { id: "w3", status: "planned" as const },
  ];
  const g = [
    games("V", 4),
    { ...games("V", 3), weekend_id: "w2" },
    { ...games("V", 2, true), weekend_id: "w3" },
  ];
  const o = [
    opp({ id: "1", name: "A", level_id: "V", our_score: 50, their_score: 40 }),
    opp({ id: "2", name: "B", level_id: "V", our_score: 30, their_score: 40, weekend_id: "w3" }),
    opp({ id: "3", name: "C", our_score: 1, their_score: 0 }), // no level: not in a team's record
  ];
  const t = levelTotals([{ id: "V" }], weekends, g, o).get("V")!;
  assert.equal(t.games, 6);
  assert.equal(t.unsure, 2);
  assert.equal(recordLabel(t), "1–1");
});

function weekend(over: Partial<HsWeekend> & { id: string }): HsWeekend {
  return {
    season_id: "s",
    starts_on: "2026-11-12",
    ends_on: "2026-11-14",
    event: "Missouri River Shootout",
    details: null,
    location: "Omaha, NE",
    trip: "Local",
    status: "secured",
    notes: "Secured IA West Fieldhouse",
    facility_contact_id: null,
    sort_order: 0,
    updated_at: "",
    updated_by: null,
    ...over,
  };
}

test("starting next season carries a weekend 52 weeks on, as planned", () => {
  const next = carryWeekend(weekend({ id: "a" }), 1)!;
  assert.equal(next.starts_on, "2027-11-11");
  assert.equal(weekdayOf(next.starts_on), weekdayOf("2026-11-12"));
  assert.equal(next.status, "planned");
  assert.equal(carryWeekend(weekend({ id: "b", status: "off" }), 1)!.status, "off");
  assert.equal(carryWeekend(weekend({ id: "c", status: "canceled" }), 1), null);
});

test("weekends sort by date, then the order they were entered", () => {
  const ws = sortWeekends([
    weekend({ id: "b", starts_on: "2026-01-31", ends_on: "2026-01-31", sort_order: 2 }),
    weekend({ id: "a", starts_on: "2026-01-29", ends_on: "2026-01-31", sort_order: 1 }),
    weekend({ id: "c", starts_on: "2026-01-31", ends_on: "2026-01-31", sort_order: 1 }),
  ]);
  assert.deepEqual(ws.map((w) => w.id), ["a", "c", "b"]);
});

// ─── Filtering the schedule (the chips above it) ────────────────────────────

test("the chips show weekends by status, not-sure games and teams on the fence", () => {
  const ws = [
    weekend({ id: "w1", status: "need_facility" }),
    weekend({ id: "w2", status: "secured" }),
    weekend({ id: "w3", status: "in_process" }),
    weekend({ id: "w4", status: "secured" }),
  ];
  const levels = new Set(["V", "JV1"]);
  const facts = weekendFacts(
    ws,
    [
      { ...games("V", 3, true), weekend_id: "w2" },
      // A "?" on a column that's hidden doesn't count.
      { ...games("14U", 2, true), weekend_id: "w3" },
    ],
    [
      opp({ id: "a", name: "Lincoln Eagles", weekend_id: "w4", status: "tentative" }),
      opp({ id: "b", name: "KC East Lions", weekend_id: "w4", status: "tentative", level_id: "V" }),
      // A maybe for one team that's a yes for another isn't on the fence.
      opp({ id: "c", name: "Ames Vision", weekend_id: "w3", status: "tentative", level_id: "JV1" }),
      opp({ id: "d", name: "Ames Vision", weekend_id: "w3", status: "confirmed" }),
      opp({ id: "e", name: "Wichita Warriors", weekend_id: "w1", status: "declined" }),
    ],
    levels
  );
  assert.deepEqual(facts.get("w2"), { unsure: true, fence: 0 });
  assert.deepEqual(facts.get("w3"), { unsure: false, fence: 0 });
  assert.deepEqual(facts.get("w4"), { unsure: false, fence: 2 });
  assert.deepEqual(facts.get("w1"), { unsure: false, fence: 0 });

  const shown = (...f: WeekendFilter[]) => ws.filter((w) => matchesWeekendFilters(w, new Set(f), facts)).map((w) => w.id);
  // Nothing picked: every weekend.
  assert.deepEqual(shown(), ["w1", "w2", "w3", "w4"]);
  // Good to go.
  assert.deepEqual(shown("secured"), ["w2", "w4"]);
  // What needs work: any of the chips picked.
  assert.deepEqual(shown("need_facility", "fence"), ["w1", "w4"]);
  assert.deepEqual(shown("unsure"), ["w2"]);
  assert.deepEqual(shown("tentative"), []);

  const counts = weekendFilterCounts(ws, facts);
  assert.equal(counts.get("secured"), 2);
  assert.equal(counts.get("need_facility"), 1);
  assert.equal(counts.get("in_process"), 1);
  assert.equal(counts.get("tentative"), undefined);
  assert.equal(counts.get("unsure"), 1);
  assert.equal(counts.get("fence"), 1);
});
