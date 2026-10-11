// The family checklist (0130): what's done and what's left for one family,
// from their registrations, their Payments balance, Slack and the season's
// dates. The family's page, the weekly open-items email and the board's
// Onboarding tab all read it. Plain module, pure, safe for client and
// server.

import { formatDollars } from "../finances/logic.ts"; // explicit extension so node --test can load this file
import { longDay } from "./dates.ts";

export type RegStatus = "pending" | "waitlisted" | "approved" | "rejected";

export interface ChecklistPlayer {
  first: string;
  status: RegStatus;
  team: string | null;
  handbookSigned: boolean;
  // Sizes still needed and sizes picked, over every item they get.
  sizesNeeded: number;
  sizesIn: number;
}

export interface ChecklistInput {
  registeredOn: string | null; // YYYY-MM-DD
  players: ChecklistPlayer[];
  // What they still owe on Payments; null before any fee is on the account.
  balanceCents: number | null;
  // The fees the form showed, for before the fee is on the account.
  expectedCents: number;
  // Joined Slack, from the nightly check; null when not checked yet.
  slackJoined: boolean | null;
  slackUrl: string | null;
  handbookUrl: string | null;
  parentMeeting: string | null;
  parentMeetingOn: string | null;
  firstPracticeOn: string | null;
  tryOn: string | null;
  venmo: string;
}

export type ItemKey = "registered" | "approved" | "handbook" | "fee" | "slack" | "sizes" | "meeting" | "team";

export interface ChecklistItem {
  key: ItemKey;
  label: string;
  detail: string;
  done: boolean;
  // Something the family does (counts as open until done), vs news.
  todo: boolean;
  link?: { label: string; href: string };
}

export function buildChecklist(c: ChecklistInput): ChecklistItem[] {
  const live = c.players.filter((p) => p.status !== "rejected");
  const approved = live.length > 0 && live.every((p) => p.status === "approved");
  const items: ChecklistItem[] = [];

  items.push({ key: "registered", label: "Registered", detail: c.registeredOn ? longDay(c.registeredOn) : "", done: true, todo: false });
  items.push({
    key: "approved",
    label: approved ? "Spot confirmed" : "Spot being confirmed",
    detail: approved ? "You're on this season's list." : "We're looking over your registration. You'll hear from us soon.",
    done: approved,
    todo: false,
  });

  const unsigned = live.filter((p) => !p.handbookSigned);
  items.push({
    key: "handbook",
    label: "Handbook signed",
    detail: unsigned.length === 0 ? "Signed by your player and a parent." : `Still needed for ${names(unsigned)}. Read it together and sign the last page.`,
    done: unsigned.length === 0,
    todo: true,
    ...(unsigned.length && c.handbookUrl ? { link: { label: "Open the handbook", href: c.handbookUrl } } : {}),
  });

  const owed = c.balanceCents ?? c.expectedCents;
  const paid = c.balanceCents !== null && c.balanceCents <= 0;
  items.push({
    key: "fee",
    label: paid ? "Fees paid" : `Pay ${formatDollars(owed)}`,
    detail: paid
      ? "Thank you!"
      : `Venmo ${c.venmo} with your player's name in the note, or mail a check. It shows here once the Treasurer records it.`,
    done: paid,
    todo: approved && owed > 0,
    ...(!paid ? { link: { label: "Pay on Venmo", href: `https://venmo.com/u/${c.venmo.replace(/^@/, "")}` } } : {}),
  });

  items.push({
    key: "slack",
    label: "Join Slack",
    detail: c.slackJoined ? "You're in. All season news goes there." : "Where all season news, schedules and team updates go.",
    done: c.slackJoined === true,
    todo: approved,
    ...(!c.slackJoined && c.slackUrl ? { link: { label: "Join Slack", href: c.slackUrl } } : {}),
  });

  const needed = live.reduce((n, p) => n + p.sizesNeeded, 0);
  if (needed > 0) {
    const missing = live.filter((p) => p.sizesIn < p.sizesNeeded);
    items.push({
      key: "sizes",
      label: "Uniform sizes",
      detail: missing.length
        ? `Still needed for ${names(missing)}. Email us your best guess and we'll add it.`
        : `All in.${c.tryOn ? ` Try-on: ${c.tryOn}.` : ""}`,
      done: missing.length === 0,
      todo: true,
    });
  }

  if (c.parentMeeting || c.parentMeetingOn) {
    items.push({
      key: "meeting",
      label: "Parent meeting",
      detail: [c.parentMeetingOn && longDay(c.parentMeetingOn), c.parentMeeting].filter(Boolean).join(" · "),
      done: false,
      todo: false,
    });
  }

  const placed = live.filter((p) => p.team);
  items.push({
    key: "team",
    label: "Team",
    detail:
      placed.length && placed.length === live.length
        ? live.map((p) => `${p.first}: ${p.team}`).join(" · ")
        : c.firstPracticeOn
          ? `Coaches set teams after the first week of practice (starts ${longDay(c.firstPracticeOn)}).`
          : "Coaches set teams after the first week of practice.",
    done: placed.length > 0 && placed.length === live.length,
    todo: false,
  });
  return items;
}

// What the family still has to do: the open items for emails and the
// board's view.
export function openItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.todo && !i.done);
}

// "• Pay $375\n• Join Slack", for an email.
export function itemsText(items: ChecklistItem[]): string {
  return items.map((i) => `• ${i.label}`).join("\n");
}

function names(players: { first: string }[]): string {
  const n = players.map((p) => p.first);
  return n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

// The board's four letters: fee paid, handbook, Slack, uniform sizes.
export interface StatusDots {
  fee: boolean;
  handbook: boolean;
  slack: boolean;
  sizes: boolean | null; // null: nothing to size
}

export function statusDots(items: ChecklistItem[]): StatusDots {
  const done = (k: ItemKey) => items.find((i) => i.key === k)?.done ?? false;
  return { fee: done("fee"), handbook: done("handbook"), slack: done("slack"), sizes: items.some((i) => i.key === "sizes") ? done("sizes") : null };
}
