// Shapes shared by the Planning page, its actions and the board meeting page.
// Safe to import from client components.

import type { MonthKey } from "./season.ts";

export type TemplateKind = "task" | "agenda";
export type MeetingStatus = "planned" | "held" | "skipped";
export type ReviewStatus = "pending_review" | "approved" | "declined";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

// Settings → Planning Roles. member_id is who holds the role now.
export interface PlanningRole {
  id: string;
  name: string;
  chip_class: string;
  member_id: string | null;
  sort_order: number;
}

export interface RoleChip {
  id: string;
  name: string;
  chip_class: string;
}

export interface PlaybookLink {
  id: string;
  title: string;
}

// One line of the yearly template. month null = a year-round duty.
export interface PlanningTemplate {
  id: string;
  kind: TemplateKind;
  title: string;
  notes: string | null;
  month: number | null;
  role_id: string | null;
  playbook_id: string | null;
  sort_order: number;
}

// A season's copy of a template task: an ordinary task (Opportunities).
export interface PlanningTask {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  reviewStatus: ReviewStatus;
  season: number;
  // The month it's planned for: its deadline's month.
  month: MonthKey;
  dueOn: string | null;
  role: RoleChip | null;
  playbook: PlaybookLink | null;
  assignee: string | null;
  // Its place in the template's month, so a month reads in the template's order.
  sortOrder: number;
}

export interface PlanningMeeting {
  id: string;
  month: MonthKey;
  meets_on: string | null;
  status: MeetingStatus;
  agenda_md: string;
  minutes_md: string;
}
