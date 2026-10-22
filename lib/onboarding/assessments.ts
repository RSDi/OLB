// Assessments: one row per tryout (14U, high school, …). Age/grade rule,
// copy, place and time live on the row so the same wizard can run for each.
// Plain module, pure, safe for client and server.

export const ASSESSMENTS_PATH = "/assessments";
export const ASSESSMENT_PATH = "/14u-assessment";
export const ASSESSMENT_TAG = "14U assessment";
export const ASSESSMENT_LEVEL = "14U";
export const BUILTIN_14U_SLUG = "14u";
export const BUILTIN_HS_SLUG = "high-school";
export const PROGRAMS_INFO_URL = "https://omahalightningbasketball.com/programs";

export const ASSESSMENT_COPY =
  "We are accepting two more players at the 14U level. Please sign up for an assessment if you are interested in being considered. Playing for Omaha Lightning is a commitment to a competitive team, October through February. Practices have already begun, so assessments will be immediate.";

export const HS_ASSESSMENT_COPY =
  "Sign up for a high school assessment if you are interested in being considered. Playing for Omaha Lightning is a commitment to a competitive team. We'll follow up with the time and what to bring.";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BLOCKED_SLUGS = new Set([
  "assessments",
  "14u-assessment",
  "waitlist",
  "register",
  "family",
  "login",
  "portal",
  "api",
]);

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type Assessment = {
  id: string;
  slug: string;
  name: string;
  level: string | null;
  dob_from: string | null;
  dob_to: string | null;
  grade_from: number | null;
  grade_to: number | null;
  starts_at: string | null;
  place: string | null;
  details: string;
  open: boolean;
  thanks_subject: string | null;
  thanks_body: string | null;
  reminder_subject: string | null;
  reminder_body: string | null;
  builtin?: boolean;
};

export type AssessmentInput = {
  id?: string;
  slug: string;
  name: string;
  level: string;
  dob_from: string;
  dob_to: string;
  grade_from: string;
  grade_to: string;
  starts_at: string;
  place: string;
  details: string;
  open: boolean;
  thanks_subject: string;
  thanks_body: string;
  reminder_subject: string;
  reminder_body: string;
};

export const BUILTIN_14U: Assessment = {
  id: "builtin-14u",
  slug: BUILTIN_14U_SLUG,
  name: "14U assessment",
  level: ASSESSMENT_LEVEL,
  dob_from: "2012-01-01",
  dob_to: "2013-12-31",
  grade_from: null,
  grade_to: null,
  starts_at: null,
  place: null,
  details: ASSESSMENT_COPY,
  open: true,
  thanks_subject: null,
  thanks_body: null,
  reminder_subject: null,
  reminder_body: null,
  builtin: true,
};

export const BUILTIN_HS: Assessment = {
  id: "builtin-hs",
  slug: BUILTIN_HS_SLUG,
  name: "High school assessment",
  level: "HS",
  dob_from: null,
  dob_to: null,
  grade_from: 9,
  grade_to: 12,
  starts_at: "2026-11-08T15:00:00.000Z",
  place: "TBD — we'll email the gym",
  details: HS_ASSESSMENT_COPY,
  open: true,
  thanks_subject: null,
  thanks_body: null,
  reminder_subject: null,
  reminder_body: null,
  builtin: true,
};

export const BUILTIN_ASSESSMENTS: Assessment[] = [BUILTIN_14U, BUILTIN_HS];

export function emptyAssessmentInput(): AssessmentInput {
  return {
    slug: "",
    name: "",
    level: "",
    dob_from: "",
    dob_to: "",
    grade_from: "",
    grade_to: "",
    starts_at: "",
    place: "",
    details: "",
    open: false,
    thanks_subject: "",
    thanks_body: "",
    reminder_subject: "",
    reminder_body: "",
  };
}

export function inputFromAssessment(a: Assessment): AssessmentInput {
  return {
    id: a.builtin ? undefined : a.id,
    slug: a.slug,
    name: a.name,
    level: a.level ?? "",
    dob_from: a.dob_from ?? "",
    dob_to: a.dob_to ?? "",
    grade_from: a.grade_from == null ? "" : String(a.grade_from),
    grade_to: a.grade_to == null ? "" : String(a.grade_to),
    starts_at: a.starts_at ? toDatetimeLocal(a.starts_at) : "",
    place: a.place ?? "",
    details: a.details,
    open: a.open,
    thanks_subject: a.thanks_subject ?? "",
    thanks_body: a.thanks_body ?? "",
    reminder_subject: a.reminder_subject ?? "",
    reminder_body: a.reminder_body ?? "",
  };
}

export function normalizeAssessmentSlug(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidAssessmentSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 60 && !BLOCKED_SLUGS.has(slug);
}

export function parseGrade(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}

export function gradeLabel(n: number): string {
  const suf = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suf}`;
}

export function hasDobRule(a: Pick<Assessment, "dob_from" | "dob_to">): boolean {
  return Boolean(a.dob_from || a.dob_to);
}

export function hasGradeRule(a: Pick<Assessment, "grade_from" | "grade_to">): boolean {
  return a.grade_from != null || a.grade_to != null;
}

export function inDobRange(dob: string, from: string | null, to: string | null): boolean {
  if (!ISO.test(dob)) return false;
  if (from && ISO.test(from) && dob < from) return false;
  if (to && ISO.test(to) && dob > to) return false;
  return true;
}

export function inGradeRange(grade: number, from: number | null, to: number | null): boolean {
  if (from != null && grade < from) return false;
  if (to != null && grade > to) return false;
  return true;
}

// A player fits when they match the birthday rule or the grade rule (or
// both, when both are set). No rule means anyone can sign up.
export function playerFitsAssessment(a: Assessment, dob: string, grade: number | null): boolean {
  const dobOk = hasDobRule(a) ? Boolean(dob) && inDobRange(dob, a.dob_from, a.dob_to) : null;
  const gradeOk = hasGradeRule(a) ? grade != null && inGradeRange(grade, a.grade_from, a.grade_to) : null;
  if (dobOk === null && gradeOk === null) return true;
  return dobOk === true || gradeOk === true;
}

export function openAssessmentsFor(assessments: Assessment[], dob: string, grade: number | null): Assessment[] {
  return assessments.filter((a) => a.open && playerFitsAssessment(a, dob, grade));
}

export function assessmentRuleLabel(a: Assessment): string {
  const parts: string[] = [];
  if (hasDobRule(a)) {
    if (a.dob_from && a.dob_to) parts.push(`birthdays ${formatDay(a.dob_from)}–${formatDay(a.dob_to)}`);
    else if (a.dob_from) parts.push(`birthdays on or after ${formatDay(a.dob_from)}`);
    else if (a.dob_to) parts.push(`birthdays on or before ${formatDay(a.dob_to)}`);
  }
  if (hasGradeRule(a)) {
    const from = a.grade_from ?? 1;
    const to = a.grade_to ?? 12;
    parts.push(from === to ? `${gradeLabel(from)} grade` : `${gradeLabel(from)}–${gradeLabel(to)} grade`);
  }
  return parts.join(" or ") || "any player";
}

export function eligibilityProblem(a: Assessment): string {
  if (a.slug === BUILTIN_14U_SLUG || a.level === ASSESSMENT_LEVEL) {
    return "This assessment is for 14U players only. Please check his birthday, or email lightningbasketballomaha@gmail.com.";
  }
  return `This assessment is for ${assessmentRuleLabel(a)}. Please check his birthday or grade, or email lightningbasketballomaha@gmail.com.`;
}

export function assessmentTag(a: Assessment): string {
  return a.slug === BUILTIN_14U_SLUG ? ASSESSMENT_TAG : a.name;
}

export function assessmentPublicPath(a: Pick<Assessment, "slug">): string {
  return `${ASSESSMENTS_PATH}/${a.slug}`;
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function assessmentWhen(startsAt: string | null | undefined, timeZone = "America/Chicago"): string {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toDatetimeLocal(iso: string, timeZone = "America/Chicago"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function fromDatetimeLocal(local: string, timeZone = "America/Chicago"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtcGuess = new Date(`${local}:00`);
  if (Number.isNaN(asUtcGuess.getTime())) return null;
  const shown = toDatetimeLocal(asUtcGuess.toISOString(), timeZone);
  const deltaMin = (asUtcGuess.getTime() - new Date(`${shown}:00`).getTime()) / 60000;
  return new Date(asUtcGuess.getTime() + deltaMin * 60000).toISOString();
}

function clip(s: string, n: number): string {
  return (s ?? "").trim().slice(0, n);
}

export function cleanAssessmentInput(raw: AssessmentInput): { error: string } | Assessment {
  const name = clip(raw.name, 120);
  if (!name) return { error: "Please add a name." };
  const slug = normalizeAssessmentSlug(raw.slug || name);
  if (!isValidAssessmentSlug(slug)) return { error: "Please pick a simple address, like 14u or high-school." };
  const dobFrom = clip(raw.dob_from, 10) || null;
  const dobTo = clip(raw.dob_to, 10) || null;
  if (dobFrom && !ISO.test(dobFrom)) return { error: "Birthday from needs a date." };
  if (dobTo && !ISO.test(dobTo)) return { error: "Birthday to needs a date." };
  if (dobFrom && dobTo && dobFrom > dobTo) return { error: "Birthday from can't be after birthday to." };
  const gradeFrom = parseGrade(raw.grade_from);
  const gradeTo = parseGrade(raw.grade_to);
  if (raw.grade_from.trim() && gradeFrom == null) return { error: "Grade from must be 1–12." };
  if (raw.grade_to.trim() && gradeTo == null) return { error: "Grade to must be 1–12." };
  if (gradeFrom != null && gradeTo != null && gradeFrom > gradeTo) return { error: "Grade from can't be after grade to." };
  const startsAt = raw.starts_at.trim() ? fromDatetimeLocal(raw.starts_at.trim()) : null;
  if (raw.starts_at.trim() && !startsAt) return { error: "Date and time need a day and a time." };
  return {
    id: raw.id?.trim() || "",
    slug,
    name,
    level: clip(raw.level, 20) || null,
    dob_from: dobFrom,
    dob_to: dobTo,
    grade_from: gradeFrom,
    grade_to: gradeTo,
    starts_at: startsAt,
    place: clip(raw.place, 200) || null,
    details: clip(raw.details, 4000),
    open: Boolean(raw.open),
    thanks_subject: clip(raw.thanks_subject, 200) || null,
    thanks_body: clip(raw.thanks_body, 4000) || null,
    reminder_subject: clip(raw.reminder_subject, 200) || null,
    reminder_body: clip(raw.reminder_body, 4000) || null,
  };
}

export function tableMissing(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  const msg = `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return /42p01|pgrst205|does not exist|schema cache|could not find the table/.test(msg);
}
