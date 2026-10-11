// Server-only. The registration workflow's view for the Registrations page
// (0130): the Onboarding tab's columns, the emails held for Send, and what
// each waitlist card shows (the family's answers, their offer, coach notes).
// Service role; the page checks the Registrations permission first.

import { createAdminClient } from "../supabase/admin";
import { openItems, statusDots, type StatusDots } from "./checklist";
import { loadFamilies } from "./family-data";
import { expiryWords } from "./offers";
import { loadSettings, seasonBoardId } from "./server";
import { daysBetween, centralDay } from "./dates";
import type { Intake } from "./waitlist-form";

export type OfferStatus = "open" | "used" | "expired" | "withdrawn";

export interface WaitlistInfo {
  fromForm: boolean;
  intake: Intake | null;
  offer: { id: string; status: OfferStatus; expires: string; sentTo: string[] } | null;
  clinicSeenOn: string | null;
  coachOk: boolean;
}

export interface HeldEmail {
  id: string;
  kind: string;
  status: "waiting" | "failed";
  to: string[];
  subject: string;
  body: string;
  createdAt: string;
  error: string | null;
}

export interface BoardCard {
  id: string;
  title: string;
  meta: string;
  dots?: StatusDots;
  quiet?: boolean;
  href?: string;
}

export interface OnboardingBoard {
  enabled: boolean;
  paused: boolean;
  held: HeldEmail[];
  columns: { key: string; label: string; cards: BoardCard[] }[];
  quiet: BoardCard[];
  firstPractice: string | null;
}

const QUIET_DAYS = 14;

// Whether the workflow is on for this season. Its pages show to the preview
// accounts always, and to everyone they're for while it's on.
export async function workflowEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const boardId = await seasonBoardId(db);
    return boardId ? (await loadSettings(db, boardId)).enabled : false;
  } catch {
    return false;
  }
}

// The waitlist cards' extra details, by registration. Null with the
// workflow off.
export async function loadWaitlistInfo(regIds: string[]): Promise<Record<string, WaitlistInfo> | null> {
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return null;
  const settings = await loadSettings(db, boardId);
  if (!settings.enabled || regIds.length === 0) return settings.enabled ? {} : null;
  const [{ data: regs }, { data: offers }, { data: marks }] = await Promise.all([
    db.from("olb_registrations").select("id, extra").in("id", regIds),
    db.from("olb_onboarding_offers").select("id, registration_id, status, expires_at, sent_to, sent_at").in("registration_id", regIds).order("sent_at", { ascending: false }),
    db.from("olb_onboarding_waitlist").select("registration_id, clinic_seen_on, coach_ok_at").in("registration_id", regIds),
  ]);
  const out: Record<string, WaitlistInfo> = {};
  for (const r of (regs as { id: string; extra: { source?: string; intake?: Intake } | null }[] | null) ?? []) {
    const o = ((offers as { id: string; registration_id: string; status: OfferStatus; expires_at: string; sent_to: string[] }[] | null) ?? []).find(
      (x) => x.registration_id === r.id
    );
    const m = ((marks as { registration_id: string; clinic_seen_on: string | null; coach_ok_at: string | null }[] | null) ?? []).find((x) => x.registration_id === r.id);
    out[r.id] = {
      fromForm: r.extra?.source === "waitlist_form",
      intake: r.extra?.intake ?? null,
      offer: o ? { id: o.id, status: o.status, expires: expiryWords(o.expires_at), sentTo: o.sent_to } : null,
      clinicSeenOn: m?.clinic_seen_on ?? null,
      coachOk: !!m?.coach_ok_at,
    };
  }
  return out;
}

export async function loadOnboardingBoard(): Promise<OnboardingBoard | null> {
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return null;
  const settings = await loadSettings(db, boardId);
  const today = centralDay();
  const empty = { enabled: settings.enabled, paused: settings.paused, held: [], columns: [], quiet: [], firstPractice: settings.first_practice_on };
  if (!settings.enabled) return empty;

  const [{ data: held }, { data: waitlist }, { data: offers }, { data: marks }, families] = await Promise.all([
    db.from("olb_onboarding_emails").select("id, kind, status, to_emails, subject, body, created_at, error").eq("board_id", boardId).in("status", ["waiting", "failed"]).order("created_at"),
    db.from("olb_registrations").select("id, first_name, last_name, dob, created_at, contacted_at, extra").eq("board_id", boardId).eq("status", "waitlisted").order("created_at"),
    db.from("olb_onboarding_offers").select("id, registration_id, status, expires_at").eq("board_id", boardId).eq("status", "open"),
    db.from("olb_onboarding_waitlist").select("registration_id, clinic_seen_on, coach_ok_at"),
    loadFamilies(db, settings),
  ]);
  const waitRows = (waitlist as { id: string; first_name: string; last_name: string; dob: string | null; created_at: string; contacted_at: string | null; extra: { source?: string } | null }[] | null) ?? [];
  const openOffers = (offers as { id: string; registration_id: string; expires_at: string }[] | null) ?? [];
  const markBy = new Map(((marks as { registration_id: string; clinic_seen_on: string | null; coach_ok_at: string | null }[] | null) ?? []).map((m) => [m.registration_id, m]));
  const offered = new Set(openOffers.map((o) => o.registration_id));
  const regIds = waitRows.map((r) => r.id);
  const { data: lastMsg } = regIds.length
    ? await db.from("olb_registration_messages").select("registration_id, sent_at").in("registration_id", regIds).order("sent_at", { ascending: false })
    : { data: [] };
  const lastTouch = new Map<string, string>();
  for (const m of (lastMsg as { registration_id: string; sent_at: string }[] | null) ?? []) if (!lastTouch.has(m.registration_id)) lastTouch.set(m.registration_id, m.sent_at);

  const age = (iso: string) => daysBetween(iso.slice(0, 10), today);
  const quiet: BoardCard[] = [];
  const waitCards: BoardCard[] = [];
  const offerCards: BoardCard[] = [];
  for (const r of waitRows) {
    const name = `${r.first_name} ${r.last_name}`.trim();
    const m = markBy.get(r.id);
    const touched = lastTouch.get(r.id) ?? r.contacted_at ?? r.created_at;
    const isQuiet = age(touched) >= QUIET_DAYS;
    const o = openOffers.find((x) => x.registration_id === r.id);
    const card: BoardCard = {
      id: r.id,
      title: name,
      meta: o
        ? `Link good until ${expiryWords(o.expires_at)}`
        : [m?.clinic_seen_on && "Seen at a clinic", m?.coach_ok_at && "Coach 👍", (age(r.created_at) === 0 ? "Joined today" : `Waiting ${age(r.created_at)} ${age(r.created_at) === 1 ? "day" : "days"}`)].filter(Boolean).join(" · "),
      quiet: isQuiet && !offered.has(r.id),
      href: "/portal/directory/registrations?tab=waitlist",
    };
    if (o) offerCards.push(card);
    else waitCards.push(card);
    if (card.quiet) quiet.push({ ...card, meta: `Nothing sent in ${age(touched)} days` });
  }
  // Coach thumbs-up first, then the order they joined.
  waitCards.sort((a, b) => Number(!!markBy.get(b.id)?.coach_ok_at) - Number(!!markBy.get(a.id)?.coach_ok_at));

  const registered: BoardCard[] = [];
  const ready: BoardCard[] = [];
  const placed: BoardCard[] = [];
  for (const f of families) {
    const live = f.registrations.filter((r) => r.status === "approved" || r.status === "pending");
    if (live.length === 0) continue;
    const lastName = f.registrations[0]?.last_name ?? "";
    const open = openItems(f.items);
    const approved = live.every((r) => r.status === "approved");
    const allPlaced = approved && f.players.length >= live.length && f.players.every((p) => p.teamId);
    const card: BoardCard = {
      id: f.id,
      title: `${lastName} family · ${f.playerNames}`,
      meta: !approved ? "Waiting for review in New" : open.length ? open.map((i) => i.label).join(", ") : allPlaced ? [...new Set(f.players.map((p) => p.team))].join(", ") : "Paid, signed and on Slack",
      dots: statusDots(f.items),
      href: !approved ? "/portal/directory/registrations" : undefined,
    };
    if (allPlaced) placed.push(card);
    else if (approved && open.length === 0) ready.push(card);
    else registered.push(card);
    if (approved && open.length && age(f.createdAt) >= QUIET_DAYS && !f.lastSeenAt) quiet.push({ ...card, meta: `${open.length} open, checklist never opened` });
  }

  return {
    enabled: true,
    paused: settings.paused,
    held: ((held as { id: string; kind: string; status: "waiting" | "failed"; to_emails: string[]; subject: string; body: string; created_at: string; error: string | null }[] | null) ?? []).map((h) => ({
      id: h.id,
      kind: h.kind,
      status: h.status,
      to: h.to_emails,
      subject: h.subject,
      body: h.body,
      createdAt: h.created_at,
      error: h.error,
    })),
    columns: [
      { key: "waitlist", label: "Waitlist", cards: waitCards },
      { key: "offered", label: "Offered", cards: offerCards },
      { key: "registered", label: "Registered", cards: registered },
      { key: "ready", label: "Ready", cards: ready },
      { key: "placed", label: "On a team", cards: placed },
    ],
    quiet,
    firstPractice: settings.first_practice_on,
  };
}
