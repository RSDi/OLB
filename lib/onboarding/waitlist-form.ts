// The public "Join the waitlist" form (0130), which takes the place of the
// Cognito waitlist while the registration workflow is on. It asks what
// Rachel asks every new family. Plain module, pure, safe for client and
// server.

import { looksLikeEmail } from "../teams/registration-form.ts"; // explicit extension so node --test can load this file

export const EXPERIENCE = ["Never played", "Rec league", "Church or co-op league", "Club or travel team"];
export const HEARD_FROM = ["A friend", "Our co-op", "Church", "Facebook or Instagram", "The website", "Something else"];

export interface WaitlistInput {
  parent_first: string;
  parent_last: string;
  email: string;
  phone: string;
  athlete_first: string;
  athlete_last: string;
  athlete_dob: string;
  homeschooled: boolean | null;
  experience: string;
  friends: string;
  heard_from: string;
  notes: string;
  // Assessment forms only. The waitlist form leaves this unset.
  grade?: string;
}

export function emptyWaitlist(): WaitlistInput {
  return {
    parent_first: "",
    parent_last: "",
    email: "",
    phone: "",
    athlete_first: "",
    athlete_last: "",
    athlete_dob: "",
    homeschooled: null,
    experience: "",
    friends: "",
    heard_from: "",
    notes: "",
  };
}

export function waitlistProblem(w: WaitlistInput): string | null {
  if (!w.athlete_first.trim() || !w.athlete_last.trim()) return "Please add your son's first and last name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.athlete_dob)) return "Please add his birthday.";
  if (w.homeschooled === null) return "Please tell us whether he's homeschooled.";
  if (!w.parent_first.trim() || !w.parent_last.trim()) return "Please add your name.";
  if (!looksLikeEmail(w.email)) return "Please add an email we can reach you at.";
  if (!w.experience) return "Please tell us whether he's played before.";
  return null;
}

const clip = (s: string, n: number) => (s ?? "").trim().slice(0, n);

// The answers as the waitlist registration's extra.intake.
export function intakeOf(w: WaitlistInput) {
  return {
    homeschooled: w.homeschooled === true,
    experience: clip(w.experience, 60),
    friends: clip(w.friends, 200),
    heard_from: clip(w.heard_from, 60),
    notes: clip(w.notes, 1000),
  };
}

export type Intake = ReturnType<typeof intakeOf> & { level?: string; grade?: string };
