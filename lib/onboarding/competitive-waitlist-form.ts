// The 10U–14U competitive waitlist: Cognito form 17, rebuilt as an OLB
// wizard. Submissions land on the same waitlist as /waitlist, tagged
// "10U-14U competitive waitlist". Preview and local only. Plain module,
// pure, safe for client and server.

import { looksLikeEmail } from "../teams/registration-form.ts";

export const COMPETITIVE_WAITLIST_TAG = "10U-14U competitive waitlist";
export const COMPETITIVE_WAITLIST_PATH = "/10u-14u-waitlist";
export const COMPETITIVE_WAITLIST_API = "/api/10u-14u-waitlist";

// Exact words from the Cognito form header (captured 2026-10-22).
export const COMPETITIVE_WAITLIST_COPY =
  "Our 10u-14u teams are currently waitlisted but are likely to have a few spaces open in the coming weeks, please fill out this form to be added to the waitlist. We will contact you when space is available.";

export const HOMESCHOOL_HELP =
  "If your son is in a co-op three or more days a week please reach out to us at LightningBasketballOmaha@gmail.com to discuss eligibility.";

export const PARENT_NA_HELP = "Fill with N/A if these fields do not apply.";

export const PRODUCTION_WRITE_BLOCKED =
  "This waitlist form isn't open on the public website. Use the preview link to sign up.";

export function isPreviewDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

export function previewWriteBlocked(env: Record<string, string | undefined> = process.env): string | null {
  return isPreviewDeployment(env) ? null : PRODUCTION_WRITE_BLOCKED;
}

export interface CompetitiveParent {
  first: string;
  last: string;
  email: string;
  phone: string;
}

export interface CompetitiveWaitlistInput {
  athlete_first: string;
  athlete_last: string;
  athlete_dob: string;
  first_experience: boolean | null;
  athlete_phone: string;
  athlete_email: string;
  homeschooled: boolean | null;
  father: CompetitiveParent;
  mother: CompetitiveParent;
}

export function emptyParent(): CompetitiveParent {
  return { first: "", last: "", email: "", phone: "" };
}

export function emptyCompetitiveWaitlist(): CompetitiveWaitlistInput {
  return {
    athlete_first: "",
    athlete_last: "",
    athlete_dob: "",
    first_experience: null,
    athlete_phone: "",
    athlete_email: "",
    homeschooled: null,
    father: emptyParent(),
    mother: emptyParent(),
  };
}

export function isNaText(s: string): boolean {
  return /^n\/?a$/i.test((s ?? "").trim());
}

export function isNaName(p: CompetitiveParent): boolean {
  const first = p.first.trim();
  const last = p.last.trim();
  return isNaText(first) || isNaText(last) || isNaText(`${first} ${last}`.trim());
}

// Cognito's US phone field: area code + 7 digits, optional extension.
export function looksLikeUsPhone(s: string): boolean {
  return /^\s*\(?([1-9][0-9]{2})\)?[ -]?([0-9]{3})-?([0-9]{4})( ?x[0-9]{1,8})?\s*$/.test(s);
}

export function parentNameProblem(p: CompetitiveParent, who: "father" | "mother"): string | null {
  if (!p.first.trim() || !p.last.trim()) {
    return who === "father" ? "Please add the father's first and last name, or N/A." : "Please add the mother's first and last name, or N/A.";
  }
  return null;
}

export function parentContactProblem(p: CompetitiveParent, who: "father" | "mother"): string | null {
  if (isNaName(p)) {
    if (p.email.trim() && !isNaText(p.email) && !looksLikeEmail(p.email)) {
      return who === "father" ? "Please add a father's email we can use, or N/A." : "Please add a mother's email we can use, or N/A.";
    }
    if (p.phone.trim() && !isNaText(p.phone) && !looksLikeUsPhone(p.phone)) {
      return who === "father" ? "Please add a father's phone we can use, or N/A." : "Please add a mother's phone we can use, or N/A.";
    }
    return null;
  }
  if (!looksLikeEmail(p.email)) {
    return who === "father" ? "Please add the father's email." : "Please add the mother's email.";
  }
  if (!looksLikeUsPhone(p.phone)) {
    return who === "father" ? "Please add the father's phone." : "Please add the mother's phone.";
  }
  return null;
}

export function competitiveWaitlistProblem(w: CompetitiveWaitlistInput): string | null {
  if (!w.athlete_first.trim() || !w.athlete_last.trim()) return "Please add the athlete's first and last name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.athlete_dob)) return "Please add the athlete's birthdate.";
  if (w.athlete_email.trim() && !looksLikeEmail(w.athlete_email)) return "Please add an athlete email we can use, or leave it blank.";
  if (w.athlete_phone.trim() && !looksLikeUsPhone(w.athlete_phone)) return "Please add an athlete phone we can use, or leave it blank.";
  if (w.homeschooled === null) return "Please tell us whether he's homeschooled.";
  if (w.homeschooled !== true) {
    return "This waitlist is for homeschooled athletes (answer Yes). If your son is in a co-op three or more days a week, email LightningBasketballOmaha@gmail.com to discuss eligibility.";
  }
  return parentNameProblem(w.father, "father") ?? parentContactProblem(w.father, "father") ?? parentNameProblem(w.mother, "mother") ?? parentContactProblem(w.mother, "mother");
}

const clip = (s: string, n: number) => (s ?? "").trim().slice(0, n);

export function parentOf(p: CompetitiveParent) {
  return {
    first: clip(p.first, 60),
    last: clip(p.last, 60),
    email: clip(p.email, 120),
    phone: clip(p.phone, 40),
  };
}

export function competitiveIntakeOf(w: CompetitiveWaitlistInput) {
  return {
    homeschooled: w.homeschooled === true,
    first_experience: w.first_experience,
    athlete_phone: clip(w.athlete_phone, 40),
    athlete_email: clip(w.athlete_email, 120),
    father: parentOf(w.father),
    mother: parentOf(w.mother),
  };
}

export function competitiveExtra(w: CompetitiveWaitlistInput) {
  const intake = competitiveIntakeOf(w);
  return {
    source: "waitlist_form" as const,
    tag: COMPETITIVE_WAITLIST_TAG,
    first_season: w.first_experience !== false,
    athlete_phone: intake.athlete_phone || null,
    athlete_email: intake.athlete_email || null,
    father: intake.father,
    mother: intake.mother,
    intake,
  };
}

export function competitiveNotes(w: CompetitiveWaitlistInput): string | null {
  return w.homeschooled === false ? "Not homeschooled, from the 10U-14U competitive waitlist." : null;
}

export function primaryParent(w: CompetitiveWaitlistInput): { name: string; email: string; phone: string } {
  const pick = !isNaName(w.father) ? w.father : w.mother;
  return {
    name: `${pick.first.trim()} ${pick.last.trim()}`.trim().slice(0, 120),
    email: pick.email.trim().toLowerCase(),
    phone: pick.phone.trim().slice(0, 40),
  };
}

export const COMPETITIVE_MISSING_DB =
  "This preview page can't save right now (database isn't configured). Email lightningbasketballomaha@gmail.com and we'll add you.";
export const COMPETITIVE_NOT_OPEN =
  "The waitlist isn't open on this page right now. Email lightningbasketballomaha@gmail.com and we'll add you.";
export const COMPETITIVE_RATE_LIMITED = "We've had a few from this email already. Try again in an hour, or email us.";
export const COMPETITIVE_SAVE_FAILED = "Something went wrong saving that. Please try again.";
export const COMPETITIVE_SEND_FAILED = "Something went wrong sending that. Please reload the page and try again.";

export function friendlyCompetitiveDbError(error: { code?: string; message?: string; details?: string } | null | undefined): string {
  const msg = `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (/permission denied|42501|pgrst301/.test(msg)) {
    return "This preview couldn't save (database permission). Email lightningbasketballomaha@gmail.com and we'll add you.";
  }
  if (/column|pgrst204|42703/.test(msg)) {
    return "This preview couldn't save (the form and the database don't match). Email lightningbasketballomaha@gmail.com and we'll add you.";
  }
  if (/foreign key|23503/.test(msg)) {
    return COMPETITIVE_NOT_OPEN;
  }
  return COMPETITIVE_SAVE_FAILED;
}

export type CompetitiveSaveGate = {
  error?: string;
  id?: string;
  status: number;
};

export function competitiveSaveGate(
  w: CompetitiveWaitlistInput,
  honeypot: string,
  env: Record<string, string | undefined> = process.env,
): CompetitiveSaveGate | null {
  const blocked = previewWriteBlocked(env);
  if (blocked) return { error: blocked, status: 403 };
  if (honeypot && honeypot.trim()) return { status: 200 };
  const problem = competitiveWaitlistProblem(w);
  if (problem) return { error: problem, status: 400 };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: COMPETITIVE_MISSING_DB, status: 503 };
  }
  return null;
}

export function friendlyCompetitiveClientError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (/Invalid Server Actions request/i.test(raw)) {
    return "This preview page couldn't send the form (the request was blocked). Reload and try again.";
  }
  if (/Failed to find Server Action/i.test(raw)) {
    return "This page is out of date. Reload and try again.";
  }
  return COMPETITIVE_SEND_FAILED;
}
