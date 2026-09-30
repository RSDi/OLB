// Planning (the Planning page, /portal/events): the August–July season math,
// how the yearly template becomes a season's tasks, which month a task sits
// in, and the agenda draft (lib/planning/season.ts, lib/planning/logic.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  lastDayOf,
  monthLabel,
  monthsBetween,
  relativeMonth,
  seasonLabel,
  seasonMonth,
  seasonMonths,
  seasonOf,
  seasonOfMonth,
} from "../../lib/planning/season.ts";
import {
  agendaDraft,
  parseMonthParam,
  parseSeasonParam,
  seasonTasksFromTemplates,
  sortTemplates,
  splitDescription,
  taskDescription,
  taskMonth,
} from "../../lib/planning/logic.ts";
import type { PlanningTemplate } from "../../lib/planning/types.ts";

function tpl(over: Partial<PlanningTemplate> & { id: string }): PlanningTemplate {
  return {
    kind: "task",
    title: "A task",
    notes: null,
    month: 9,
    role_id: null,
    playbook_id: null,
    sort_order: 10,
    ...over,
  };
}

test("a season runs August through July and is named by its first year", () => {
  assert.equal(seasonOf("2026-08-01"), 2026);
  assert.equal(seasonOf("2026-09-30"), 2026);
  assert.equal(seasonOf("2027-07-31"), 2026);
  assert.equal(seasonOf("2026-07-31"), 2025);
  assert.equal(seasonOfMonth("2027-01"), 2026);
  assert.equal(seasonLabel(2026), "2026–27");
  assert.equal(seasonLabel(2099), "2099–00");
  const months = seasonMonths(2026);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2026-08");
  assert.equal(months[11], "2027-07");
  assert.equal(seasonMonth(2026, 12), "2026-12");
  assert.equal(seasonMonth(2026, 1), "2027-01");
});

test("month arithmetic crosses years", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.equal(addMonths("2026-09", -21), "2024-12");
  assert.deepEqual(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsBetween("2027-02", "2026-11"), []);
  assert.equal(lastDayOf("2027-02"), "2027-02-28");
  assert.equal(lastDayOf("2028-02"), "2028-02-29");
  assert.equal(lastDayOf("2026-09"), "2026-09-30");
  assert.equal(monthLabel("2026-10"), "October 2026");
});

test("months read as this, next and last month around today", () => {
  assert.equal(relativeMonth("2026-09", "2026-09"), "This month");
  assert.equal(relativeMonth("2026-10", "2026-09"), "Next month");
  assert.equal(relativeMonth("2026-08", "2026-09"), "Last month");
  assert.equal(relativeMonth("2027-01", "2026-12"), "Next month");
  assert.equal(relativeMonth("2026-11", "2026-09"), null);
});

test("a season gets one task per monthly template line it doesn't have yet", () => {
  const templates = [
    tpl({ id: "a", month: 9, title: "Update the Player Handbook", notes: "Before October." }),
    tpl({ id: "b", month: 1, title: "Adjust the fundraising plan" }),
    tpl({ id: "c", month: null, title: "Check the Gmail account" }), // year-round
    tpl({ id: "d", kind: "agenda", month: 9, title: "Approve coaches" }), // agenda topic
    tpl({ id: "e", month: 10, title: "Already built" }),
  ];
  const rows = seasonTasksFromTemplates(templates, 2026, ["e"]);
  assert.deepEqual(
    rows.map((r) => [r.planning_template_id, r.start_on, r.due_on]),
    [
      ["a", "2026-09-01", "2026-09-30"],
      ["b", "2027-01-01", "2027-01-31"],
    ],
  );
  assert.equal(rows[0].description, "Update the Player Handbook\n\nBefore October.");
  assert.ok(rows.every((r) => r.review_status === "pending_review" && r.status === "open" && r.planning_season === 2026));
  // Running it again once everything's there adds nothing.
  assert.deepEqual(seasonTasksFromTemplates(templates, 2026, ["a", "b", "e"]), []);
});

test("a task sits in its deadline's month, else its start's, else the template's", () => {
  assert.equal(taskMonth({ due_on: "2026-11-15", start_on: "2026-10-01", planning_season: 2026, template_month: 10 }), "2026-11");
  assert.equal(taskMonth({ due_on: null, start_on: "2026-10-01", planning_season: 2026, template_month: 9 }), "2026-10");
  assert.equal(taskMonth({ due_on: null, start_on: null, planning_season: 2026, template_month: 3 }), "2027-03");
  assert.equal(taskMonth({ due_on: null, start_on: null, planning_season: null, template_month: 3 }), null);
});

test("a task's title and notes round-trip through its description", () => {
  assert.equal(taskDescription("  Title ", "  "), "Title");
  assert.deepEqual(splitDescription(taskDescription("Title", "Line one\nLine two")), {
    title: "Title",
    notes: "Line one\nLine two",
  });
  assert.deepEqual(splitDescription("Just a title"), { title: "Just a title", notes: null });
});

test("the agenda draft lists that month's topics in order", () => {
  const templates = [
    tpl({ id: "1", kind: "agenda", month: 10, sort_order: 20, title: "Budget", notes: "Where are we\nfinancially?" }),
    tpl({ id: "2", kind: "agenda", month: 10, sort_order: 10, title: "Fundamentals Program" }),
    tpl({ id: "3", kind: "agenda", month: 11, title: "Not this month" }),
    tpl({ id: "4", kind: "task", month: 10, title: "A task, not a topic" }),
  ];
  assert.equal(agendaDraft(templates, 10), "- **Fundamentals Program**\n- **Budget**: Where are we financially?");
  assert.equal(agendaDraft(templates, 4), "");
});

test("template lines list year-round first, then August through July", () => {
  const sorted = sortTemplates([
    tpl({ id: "jul", month: 7, title: "July" }),
    tpl({ id: "aug", month: 8, title: "August" }),
    tpl({ id: "yr", month: null, title: "Year-round" }),
    tpl({ id: "jan", month: 1, title: "January" }),
    tpl({ id: "dec", month: 12, title: "December" }),
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ["yr", "aug", "dec", "jan", "jul"]);
});

test("route params only accept real months and seasons", () => {
  assert.equal(parseMonthParam("2026-10"), "2026-10");
  assert.equal(parseMonthParam("2026-13"), null);
  assert.equal(parseMonthParam("2026-1"), null);
  assert.equal(parseMonthParam(undefined), null);
  assert.equal(parseSeasonParam("2025"), 2025);
  assert.equal(parseSeasonParam("25"), null);
  assert.equal(parseSeasonParam("1999"), null);
});
