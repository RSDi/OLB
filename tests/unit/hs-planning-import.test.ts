// Importing the HS planning spreadsheet (lib/hs-planning-import/): reading
// teams out of its Event cells, its season tabs and its Contacts tab, and
// working out what to add or fill in. The event texts below are the
// spreadsheet's own; the contacts are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamIndex } from "../../lib/hs-schedule/match.ts";
import { eventTitle, parseEventTeams, parseScores } from "../../lib/hs-planning-import/event-text.ts";
import { EMPTY_CELL, type Grid, type GridCell } from "../../lib/hs-planning-import/grid.ts";
import {
  gamesCell,
  normalizeTrip,
  parseScheduleSheet,
  seasonFromSheet,
} from "../../lib/hs-planning-import/schedule-sheet.ts";
import { areaTags, emailResembles, parseContactsSheet } from "../../lib/hs-planning-import/contacts-sheet.ts";
import { fillIns, planContacts, planSeasons, type Existing, type ExistingContact } from "../../lib/hs-planning-import/plan.ts";

// ─── Grids ──────────────────────────────────────────────────────────────────

type In = string | number | null | { t: string | number; fill?: string };

function cell(v: In): GridCell {
  if (v == null || v === "") return EMPTY_CELL;
  if (typeof v === "object") {
    const base = cell(v.t);
    return { ...base, fill: v.fill ?? null };
  }
  return { text: String(v).trim(), value: v, fill: null };
}

function grid(name: string, rows: In[][], hiddenCols: number[] = []): Grid {
  return { name, rows: rows.map((r) => r.map(cell)), hiddenCols };
}

// ─── Event text ─────────────────────────────────────────────────────────────

const PROGRAMS = [
  "Lincoln Eagles", "KC Metro Mavericks", "KC East Lions", "Wichita Warriors", "Des Moines Warriors",
  "Omaha Roadrunners", "Veritas Christian Eagles", "Smoky Valley", "Countryside Classics",
  "North Metro Blazers", "Manhattan Chiefs", "NE Kansas", "Sunrise Christian Academy", "Faith Baptist",
  "OKC Knights", "Wichita Defenders", "First Baptist", "Trinity Classical Academy", "Tulsa CHEF Arrows",
  "Sioux City Warriors", "Hardin County", "Hastings Red Tide", "Des Moines Defenders",
];
const ALIASES: Record<string, string[]> = {
  "Omaha Roadrunners": ["RR"],
  "Des Moines Warriors": ["DMW", "DM Warriors"],
  "NE Kansas": ["NEK"],
  "Trinity Classical Academy": ["TCA"],
};
const CITY: Record<string, string> = { "First Baptist": "Plattsmouth" };
const index = buildTeamIndex(PROGRAMS.map((n) => ({ id: n, name: n, aliases: ALIASES[n] ?? [], city: CITY[n] ?? null })));

const LEVELS_2627 = ["V", "JV1", "14U", "12U", "JV2", "14U A", "14U B"].map((label) => ({
  label,
  hidden: label === "14U" || label === "12U",
}));
const LEVELS_2425 = ["18U", "16U", "14U (2)", "12U", "14U"].map((label) => ({ label, hidden: label === "14U (2)" || label === "12U" }));

const teams = (text: string, levels = LEVELS_2627) =>
  parseEventTeams(text, index, levels).map((t) => `${t.matchId ?? `"${t.text}"`}${t.levels ? `[${t.levels.join("+")}]` : ""}${t.tentative ? "?" : ""}`);

test("a list in parentheses is who's coming; after “Potentials” they're on the fence", () => {
  assert.deepEqual(
    teams(
      "Missouri River Shootout (OLB / Lincoln / KC Metro / KC East / Wichita Warriors / BluePrint) - Potentials....DMW, RR, Veritas, Smoky, Classics, North Metro, Manhattan, NEK, Sunrise, Faith, OKC Knights, OKC Storm / Wichita Def"
    ),
    [
      "Lincoln Eagles", "KC Metro Mavericks", "KC East Lions", "Wichita Warriors", `"BluePrint"`,
      "Des Moines Warriors?", "Omaha Roadrunners?", "Veritas Christian Eagles?", "Smoky Valley?",
      "Countryside Classics?", "North Metro Blazers?", "Manhattan Chiefs?", "NE Kansas?",
      "Sunrise Christian Academy?", "Faith Baptist?", "OKC Knights?", `"OKC Storm"?`, "Wichita Defenders?",
    ]
  );
});

test("“Var --”, “JV --”, “(JV)” and “- JV/Varsity” say which of our teams plays them", () => {
  assert.deepEqual(teams("Var -- First Baptist (Plattsmouth), JV --  Pro Vision Select", LEVELS_2425), [
    "First Baptist[18U]",
    `"Pro Vision Select"[16U]`,
  ]);
  assert.deepEqual(teams("Var, JV -- Des Moines Defenders; JV -- Trinity Classical ", LEVELS_2425), [
    "Des Moines Defenders[18U+16U]",
    "Trinity Classical Academy[16U]",
  ]);
  assert.deepEqual(teams("TCA -- JV (Friday), DM Warriors (Saturday)", LEVELS_2425), [
    "Trinity Classical Academy[16U]",
    "Des Moines Warriors",
  ]);
  assert.deepEqual(teams("Sioux City, Hardin County (JV)", LEVELS_2425), ["Sioux City Warriors[16U]", "Hardin County[16U]"]);
  assert.deepEqual(teams("Faith Baptist Tourney (Varisty)", LEVELS_2425), ["Faith Baptist[18U]"]);
  assert.deepEqual(teams("Hastings Tourney - JV/Varsity"), ["Hastings Red Tide[JV1+JV2+V]"]);
  // "All Program" is every team we bring.
  assert.deepEqual(teams("Omaha Roadrunners -- All Program (Var, JV, JH, GS)"), ["Omaha Roadrunners"]);
});

test("in running text only known programs are picked out", () => {
  assert.deepEqual(teams("Wichita Warriors / OKC Knights / OKC Flame (1st game start 3pm Friday)"), [
    "Wichita Warriors",
    "OKC Knights",
    `"OKC Flame"`,
  ]);
  assert.deepEqual(teams("Central Iowa Homeschool Classic"), []);
  assert.deepEqual(teams("Lightning / Lincoln Eagles pre-season scrimmage"), ["Lincoln Eagles"]);
  assert.deepEqual(teams("Lincoln Tri/Quad (Ames, Sioux City, etc)"), ["Lincoln Eagles", `"Ames"`, "Sioux City Warriors"]);
  assert.deepEqual(
    teams("JH vs OCA (Thurs 12/17 - 4-430 start at OCA)--- (Varsity -BluePrint Tourney in Omaha at Levi Carter)----NEK, Manhattan, Veritas.. Possibly in Sebetha, KS (Lincoln is open this weekend)"),
    [`"OCA"[14U A+14U B]`, "NE Kansas", "Manhattan Chiefs", "Veritas Christian Eagles", "Lincoln Eagles?"]
  );
});

test("scores are read from our side", () => {
  assert.deepEqual(parseScores("OLB 71 vs So Metro 40 / No Metro 63 vs OLB 45 / OLB 49 vs Cornerstone 44"), [
    { opponent: "So Metro", ours: 71, theirs: 40 },
    { opponent: "No Metro", ours: 45, theirs: 63 },
    { opponent: "Cornerstone", ours: 49, theirs: 44 },
  ]);
  assert.deepEqual(parseScores("Surise 72 - OLB 26"), [{ opponent: "Surise", ours: 26, theirs: 72 }]);
  assert.deepEqual(parseScores("RR 46 vs OLB 45"), [{ opponent: "RR", ours: 45, theirs: 46 }]);
});

test("a long event keeps a short name and its full text as details", () => {
  assert.deepEqual(eventTitle("Central Iowa Homeschool Classic"), { event: "Central Iowa Homeschool Classic", details: null });
  const long = eventTitle(
    "Lightning JV Invitational (Hastings / Lincoln/ Sioux City) (Possibly 1 Game for Varsity - Maybe Senior Night? "
  );
  assert.equal(long.event, "Lightning JV Invitational");
  assert.match(long.details!, /Possibly 1 Game for Varsity/);
});

// ─── A season tab ───────────────────────────────────────────────────────────

const GREEN = "00FF00";
const YELLOW = "FFFF00";
const PALE = "FFF2CC";
const MINT = "D9EAD3";

function seasonGrid(): Grid {
  const blank = (n: number) => Array.from({ length: n }, () => null as In);
  return grid(
    "HS Schedule - 26-27",
    [
      ["Omaha Lightning"],
      ["High School Schedule", ...blank(5), { t: "Need to secure facility ", fill: YELLOW }],
      ["2026-27", ...blank(5), { t: "Facility Secured", fill: GREEN }],
      [...blank(6), { t: "Final details still in process ", fill: PALE }],
      [],
      ["Month", "Thurs", "Fri", "Sat", "Location", "Trip Type", "Event", "V", "JV1", "14U", "JV2", "", "Notes:"],
      [],
      ["Nov", 5, 6, 7, "Omaha, NE", "Local", "OPEN WEEKEND"],
      [null, 12, 13, 14, "Omaha, NE", "Local", { t: "Missouri River Shootout (OLB / Lincoln)", fill: GREEN }, 4, 3, null, { t: "?", fill: MINT }, null, "Secured IA West Fieldhouse "],
      [null, 19, 20, 21, "Hastings, NE", "Day Trip", { t: "Hastings Tourney", fill: PALE }, { t: 2, fill: MINT }, 2, "1-3", 2],
      ["Jan", null, null, 30, "Wichita, KS", "(1) Overnight", "NCHC Districts - CANCELED due to Weather", 3],
      [null, 29, 30, 31, "Omaha, NE", "Local", { t: "PLANNED OPEN WEEKEND", fill: YELLOW }, 3, 3],
      [null, null, null, 1, "Lincoln, NE", "Local", "Lincoln Eagles", 1, null, null, null, null, "13-6"],
      [null, 26, 27, 28, "Lawrence, KS", "Overnight", "NCHC Heartland Regionals", 3],
      ["Mar", 4, 5, 6, "Wichita, KS", "Week Long", "Wichita Warriors", 0],
      [],
      [...blank(6), "Total Games", 99],
      [null, 12, 13, 14, "Nowhere", "Local", "After the totals"],
    ],
    [9]
  );
}

test("a season tab: its season, columns and weekends", () => {
  const s = parseScheduleSheet(seasonGrid())!;
  assert.equal(s.season, 2026);
  assert.equal(seasonFromSheet({ name: "HS Schedule - 24-25", rows: [], hiddenCols: [] }), 2024);
  assert.deepEqual(
    s.levels.map((l) => `${l.label}${l.hidden ? "(hidden)" : ""}`),
    ["V", "JV1", "14U(hidden)", "JV2"]
  );
  assert.deepEqual(
    s.weekends.map((w) => `${w.startsOn}..${w.endsOn} ${w.status}`),
    [
      "2026-11-05..2026-11-07 off",
      "2026-11-12..2026-11-14 secured",
      "2026-11-19..2026-11-21 in_process",
      "2027-01-30..2027-01-30 canceled",
      // "PLANNED OPEN WEEKEND" is off by its words (the plan makes it a
      // weekend we play, since games are entered).
      "2027-01-29..2027-01-31 off",
      // A day number lower than the weekend before: the next month.
      "2027-02-01..2027-02-01 planned",
      "2027-02-26..2027-02-28 planned",
      "2027-03-04..2027-03-06 planned",
    ]
  );
  const mrs = s.weekends[1];
  assert.deepEqual(
    mrs.games.map((g) => `${g.label}=${g.games ?? ""}${g.unsure ? "?" : ""}`),
    ["V=4", "JV1=3", "JV2=?"]
  );
  assert.equal(mrs.notes, "Secured IA West Fieldhouse");
  const hastings = s.weekends[2];
  assert.deepEqual(
    hastings.games.map((g) => `${g.label}=${g.games}${g.unsure ? "?" : ""}${g.note ? ` (${g.note})` : ""}`),
    ["V=2?", "JV1=2", "14U=3? (1–3 games)", "JV2=2"]
  );
  assert.equal(hastings.trip, "Day trip");
  // A won–lost record in the Notes column isn't a note.
  assert.equal(s.weekends[5].notes, null);
  assert.ok(s.skipped.some((x) => /records/.test(x)));
});

test("cells and trips read the spreadsheet's way", () => {
  assert.deepEqual(gamesCell(cell("?")), { games: null, unsure: true, note: null });
  assert.deepEqual(gamesCell(cell(3)), { games: 3, unsure: false, note: null });
  assert.deepEqual(gamesCell({ ...cell(2), fill: MINT }), { games: 2, unsure: true, note: null });
  assert.deepEqual(gamesCell(cell("3?")), { games: 3, unsure: true, note: null });
  assert.equal(gamesCell(cell("")), null);
  assert.equal(normalizeTrip("(2) Overnights"), "2 overnights");
  assert.equal(normalizeTrip("Local or Day Trip"), "Local or day trip");
  assert.equal(normalizeTrip("Week Trip"), "Week-long");
  assert.equal(normalizeTrip("No Games"), null);
});

// ─── The Contacts tab ───────────────────────────────────────────────────────

function contactsGrid(): Grid {
  const shade = (t: string) => ({ t, fill: PALE });
  return grid("Contacts", [
    ["Omaha Lightning"],
    ["Master Contact List"],
    [],
    ["Program", "City", "State", "Contact", "Role", "Email", "Phone"],
    [],
    [shade("NCHC / Tier I Teams")],
    ["Prairie Hawks", "Ames", "ia", "Pat One", "Scheduler", "hawks@example.org", "555-0100"],
    [null, null, null, "Sam Two", "Head Coach", null, "555-0101"],
    ["River Knights", "Topeka", "KS", "Lee Three", "Athletic Director", "lee@example.com", "555-0102", "riverknights@example.com"],
    [null, null, null, null, null, "lee@school.example.edu"],
    ["Blue Blazers", "Minneapolis", "MN", " ", "Scheduler", "scheduling@blueblazers.example"],
    [shade("NDII / Tier 2 Teams")],
    ["Newton Stallions", "Newton", "KS", "Kim Four", null, "kim@example.com"],
    [null, null, null, "Tim Five", null, "tim@example.com"],
    [shade("Facility Contacts")],
    ["Big Gym", null, null, " ", " ", " ", "555-0200", "x206"],
    ["Center Court", null, null, "Jo Six", "Facilities Director", "jo@example.com", "555-0201", "555-0299"],
    [shade("Referee Contacts")],
    ["Lincoln / Omaha Home Games", null, null, "Ray Seven", "Pool Coordinator", "ray@example.com", "555-0300"],
    [shade("Pivot Table from NDII (all added above)")],
    ["Newton Panthers", "Black & White", "Newton, KS", "Tim Five", "tim@example.com"],
    ["Prairie Hawks (PH) Flyers", "Green & Gold", "Ames, IA", "Pat One", "hawks@example.org"],
  ]);
}

test("the Contacts tab: programs, their people, facilities and referees", () => {
  const book = parseContactsSheet(contactsGrid());
  assert.deepEqual(book.warnings, []);
  const byName = new Map(book.companies.map((c) => [c.name, c]));
  const hawks = byName.get("Prairie Hawks")!;
  assert.equal(hawks.section, "tier1");
  assert.equal(hawks.state, "IA");
  assert.deepEqual(hawks.people.map((p) => `${p.name} (${p.title})`), ["Pat One (Scheduler)", "Sam Two (Head Coach)"]);
  // The pivot table's colors and longer name.
  assert.equal(hawks.teamColors, "Green & Gold");
  assert.deepEqual(hawks.aliases, ["Prairie Hawks (PH) Flyers", "PH"]);

  const knights = byName.get("River Knights")!;
  // An extra column that looks like the program's inbox is the program's;
  // an email alone on the next row is the person's other address.
  assert.equal(knights.email, "riverknights@example.com");
  assert.equal(knights.people[0].altEmail, "lee@school.example.edu");

  // No name: the email is the program's, with who it's for in the notes.
  const blazers = byName.get("Blue Blazers")!;
  assert.equal(blazers.people.length, 0);
  assert.equal(blazers.email, "scheduling@blueblazers.example");
  assert.equal(blazers.notes, "Scheduler: scheduling@blueblazers.example");

  // Listed under Newton Stallions but its own program in the NDII table.
  assert.deepEqual(byName.get("Newton Stallions")!.people.map((p) => p.name), ["Kim Four"]);
  const panthers = byName.get("Newton Panthers")!;
  assert.equal(panthers.section, "tier2");
  assert.deepEqual(panthers.people.map((p) => p.name), ["Tim Five"]);
  assert.equal(panthers.teamColors, "Black & White");

  assert.equal(byName.get("Big Gym")!.phone, "555-0200 x206");
  assert.equal(byName.get("Center Court")!.people[0].mobile, "555-0299");

  assert.deepEqual(
    book.people.map((p) => `${p.name}: ${p.tags.join(",")}`),
    ["Ray Seven: lincoln,omaha"]
  );
  assert.deepEqual(areaTags('Wichita "Pool"'), ["wichita"]);
  assert.equal(emailResembles("desmoinesdefenders@gmail.com", "Des Moines Defenders"), true);
  assert.equal(emailResembles("jooss@missouri.edu", "Mid Mo Mavericks"), false);
});

// ─── The plan ───────────────────────────────────────────────────────────────

function existing(over: Partial<ExistingContact> & { id: string; name: string }): ExistingContact {
  return {
    kind: "company",
    nickname: null,
    parent_contact_id: null,
    category_id: null,
    email: null,
    alt_email: null,
    phone: null,
    mobile_phone: null,
    title: null,
    city: null,
    state: null,
    team_colors: null,
    notes: null,
    tags: [],
    aliases: [],
    ...over,
  };
}

test("contacts already there are matched and only filled in", () => {
  const book = parseContactsSheet(contactsGrid());
  const have: Existing = {
    categories: [{ id: "cat-f", name: "Facilities" }, { id: "cat-o", name: "Opponents" }],
    contacts: [
      existing({ id: "hawks", name: "PRAIRIE HAWKS", city: "Ames", phone: "keep me" }),
      existing({ id: "pat", kind: "person", name: "Pat One", parent_contact_id: "hawks", email: "HAWKS@example.org" }),
      existing({ id: "court", name: "Center", category_id: "cat-f" }),
    ],
    seasons: [],
  };
  const plan = planContacts(book, have);
  // "Opponents" is the Programs type already; Referees is new.
  assert.deepEqual(plan.typesToCreate, ["Referees"]);
  assert.equal(plan.typeIds.Programs, "cat-o");
  const hawks = plan.companies.find((c) => c.name === "Prairie Hawks")!;
  assert.equal(hawks.action, "update");
  assert.equal(hawks.existingId, "hawks");
  assert.deepEqual(hawks.changes, ["state", "team colors", "tag nchc", "also known as Prairie Hawks (PH) Flyers, PH", "type"]);
  const pat = hawks.people.find((p) => p.name === "Pat One")!;
  assert.equal(pat.existingId, "pat");
  assert.deepEqual(pat.changes, ["role", "phone", "type"]);
  // Not the same company, but maybe: offered, not assumed.
  const court = plan.companies.find((c) => c.name === "Center Court")!;
  assert.equal(court.action, "create");
  assert.deepEqual(court.similar, [{ id: "court", name: "Center" }]);
  const { patch } = fillIns(have.contacts[0], hawks.values);
  assert.equal(patch.phone, undefined, "a field with a value is never overwritten");
});

test("the plan's weekends: teams linked, unsettled ones on the fence, scores deduped", () => {
  const book = parseContactsSheet(contactsGrid());
  const have: Existing = { categories: [], contacts: [], seasons: [{ id: "s26", season: 2026, weekends: 5 }] };
  const contacts = planContacts(book, have);
  const season = parseScheduleSheet(seasonGrid())!;
  season.weekends[2].eventText = "Hastings Tourney (Prairie Hawks, River Knights)";
  // As a "Varsity Scores" column would.
  season.scoresLevel = "V";
  season.weekends[5].scores = [{ opponent: "Lincoln Eagles", ours: 50, theirs: 40 }];
  const [p] = planSeasons([season], have, contacts);
  assert.equal(p.existingId, "s26");
  assert.equal(p.label, "2026–27");
  // In process: the teams it names are on the fence, linked to the new programs.
  const hastings = p.weekends[2];
  assert.deepEqual(
    hastings.teams.map((t) => `${t.name}:${t.status}:${t.ref && "key" in t.ref ? t.ref.key : "-"}`),
    ["Prairie Hawks:tentative:program:prairie hawks", "River Knights:tentative:program:river knights"]
  );
  // "PLANNED OPEN WEEKEND" with games entered is a weekend we play.
  assert.equal(p.weekends[4].status, "planned");
  // Off and canceled weekends name no teams.
  assert.deepEqual(p.weekends[3].teams, []);
  // Lincoln Eagles isn't a program here: kept by name, with the score, once.
  const lincoln = p.weekends[5].teams;
  assert.equal(lincoln.length, 1);
  assert.equal(lincoln[0].our_score, 50);
  assert.deepEqual(lincoln[0].levels, ["V"]);
  assert.ok(p.unmatched.includes("Lincoln Eagles"));
});
