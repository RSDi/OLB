// The automatic emails of the registration workflow (0130), the switch each
// one has, and the settings a season keeps. Nothing goes out unless the
// workflow is on, it isn't paused, and that email's switch is On (or Ask me
// first, which holds it for someone to press Send). Plain module, pure, safe
// for client and server.

export type AutomationKey =
  | "waitlist_reply"
  | "clinic_invite"
  | "offer_reminder"
  | "offer_closeout"
  | "welcome"
  | "open_items"
  | "countdown"
  | "team_announce";

export type Mode = "off" | "ask" | "on";

export const MODES: { key: Mode; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "ask", label: "Ask me first" },
  { key: "on", label: "On" },
];

export interface AutomationDef {
  key: AutomationKey;
  label: string;
  // When it goes out, in plain words.
  when: string;
}

export const AUTOMATIONS: AutomationDef[] = [
  { key: "waitlist_reply", label: "Waitlist reply", when: "Someone joins the waitlist on the website" },
  { key: "clinic_invite", label: "Clinic invite", when: "A family is on the waitlist and clinic details are set below" },
  { key: "offer_reminder", label: "Offer check-in", when: "Two days before an offer link runs out, if they haven't registered" },
  { key: "offer_closeout", label: "Offer close-out", when: "An offer link runs out without a registration" },
  { key: "welcome", label: "You're in", when: "A registration is approved" },
  { key: "open_items", label: "Weekly open items", when: "Mondays, only to approved families with something still to do" },
  { key: "countdown", label: "Practice countdown", when: "10 days and 1 day before the first practice" },
  { key: "team_announce", label: "Your team", when: "Someone presses Announce teams" },
];

export interface OnboardingSettings {
  board_id: string;
  enabled: boolean;
  paused: boolean;
  modes: Partial<Record<AutomationKey, Mode>>;
  auto_approve_offer: boolean;
  auto_approve_returning: boolean;
  handbook_url: string | null;
  slack_invite_url: string | null;
  slack_invite_expires_on: string | null;
  offer_days: number;
  clinic_info: string | null;
  parent_meeting: string | null;
  parent_meeting_on: string | null;
  first_practice_on: string | null;
}

export function defaultSettings(boardId: string): OnboardingSettings {
  return {
    board_id: boardId,
    enabled: false,
    paused: false,
    modes: {},
    auto_approve_offer: false,
    auto_approve_returning: false,
    handbook_url: null,
    slack_invite_url: null,
    slack_invite_expires_on: null,
    offer_days: 5,
    clinic_info: null,
    parent_meeting: null,
    parent_meeting_on: null,
    first_practice_on: null,
  };
}

// What an email does right now: off (nothing), ask (held for Send) or on.
export function modeOf(settings: OnboardingSettings | null, key: AutomationKey): Mode {
  if (!settings?.enabled || settings.paused) return "off";
  const m = settings.modes?.[key];
  return m === "ask" || m === "on" ? m : "off";
}

export function isMode(v: unknown): v is Mode {
  return v === "off" || v === "ask" || v === "on";
}

// The modes as saved: known keys and modes only.
export function cleanModes(raw: unknown): Partial<Record<AutomationKey, Mode>> {
  const out: Partial<Record<AutomationKey, Mode>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const a of AUTOMATIONS) {
    const v = (raw as Record<string, unknown>)[a.key];
    if (isMode(v) && v !== "off") out[a.key] = v;
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The settings form, checked before saving. Blank text and dates are null.
export function cleanSettings(input: Partial<OnboardingSettings>): Omit<OnboardingSettings, "board_id"> | { error: string } {
  const text = (v: unknown, max: number, what: string): string | null | { error: string } => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    return s.length > max ? { error: `${what} is too long (up to ${max} characters).` } : s;
  };
  const url = (v: unknown, what: string): string | null | { error: string } => {
    const s = text(v, 500, what);
    if (s === null || typeof s !== "string") return s;
    return /^https:\/\/\S+$/i.test(s) ? s : { error: `${what} needs to be a full link starting with https://` };
  };
  const date = (v: unknown, what: string): string | null | { error: string } => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    return DATE.test(s) ? s : { error: `${what} isn't a date.` };
  };
  const fields = {
    handbook_url: url(input.handbook_url, "The handbook link"),
    slack_invite_url: url(input.slack_invite_url, "The Slack invite link"),
    slack_invite_expires_on: date(input.slack_invite_expires_on, "The Slack link's expiry"),
    clinic_info: text(input.clinic_info, 1000, "The clinic details"),
    parent_meeting: text(input.parent_meeting, 300, "The parent meeting"),
    parent_meeting_on: date(input.parent_meeting_on, "The parent meeting date"),
    first_practice_on: date(input.first_practice_on, "The first practice date"),
  };
  for (const v of Object.values(fields)) if (v && typeof v === "object") return v;
  const days = Number(input.offer_days ?? 5);
  if (!Number.isInteger(days) || days < 2 || days > 30) return { error: "Offer links can last 2 to 30 days." };
  return {
    enabled: input.enabled === true,
    paused: input.paused === true,
    modes: cleanModes(input.modes),
    auto_approve_offer: input.auto_approve_offer === true,
    auto_approve_returning: input.auto_approve_returning === true,
    offer_days: days,
    ...(fields as Record<keyof typeof fields, string | null>),
  };
}
