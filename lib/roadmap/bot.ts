// Auth and input for the Product Manager bot's roadmap routes
// (/api/roadmap/items and /api/roadmap/items/[id]). POST may only insert, and
// only as `proposed`. PATCH may move to any board column (including Parked
// and backwards) and set preview_url and/or a note. Token check is
// constant-time so a wrong Bearer header doesn't leak length.

import { createHash, timingSafeEqual } from "node:crypto";
import {
  cleanPreviewUrl,
  cleanRoadmapItem,
  isStatus,
  NOTE_MAX,
  todayIso,
  type CleanRoadmapItem,
  type Status,
} from "./model.ts"; // explicit extension so node --test can load this file

export const ROADMAP_BOT_TOKEN_ENV = "OLB_ROADMAP_BOT_TOKEN";
export const BOT_ACTOR = "bot";

const BEARER = "Bearer ";
const PATCH_KEYS = new Set(["status", "preview_url", "note"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// True only when the header is `Bearer <token>` and the token matches. An
// unset secret (or any other scheme) is a miss, same as a wrong token.
export function roadmapBotAuthorized(
  authorization: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const got = authorization?.startsWith(BEARER) ? authorization.slice(BEARER.length) : "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Title, description and area go through the same checks as the board form.
// Status and released_on from the body are ignored: the row is always
// `proposed` with no date, so POST cannot place or date an item.
export function cleanBotRoadmapItem(body: unknown): { error: string } | CleanRoadmapItem {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object with title, description, and area." };
  }
  const input = body as Record<string, unknown>;
  return cleanRoadmapItem({
    title: asString(input.title),
    description: asString(input.description),
    area: asString(input.area),
    status: "proposed",
    releasedOn: "",
    previewUrl: "",
  });
}

// The only columns POST may write. Status is hardcoded so a future change
// to cleanBotRoadmapItem still cannot place or date an item.
export function botInsertFields(row: CleanRoadmapItem): {
  title: string;
  description: string;
  area: CleanRoadmapItem["area"];
  status: "proposed";
  released_on: null;
} {
  return {
    title: row.title,
    description: row.description,
    area: row.area,
    status: "proposed",
    released_on: null,
  };
}

export interface BotStatusPatch {
  status?: Status;
  preview_url?: string;
  note?: string;
}

export function cleanBotNote(raw: unknown): { error: string } | { note?: string } {
  if (raw === undefined) return {};
  if (typeof raw !== "string") return { error: "The note has to be text." };
  const note = raw.trim();
  if (!note) return {};
  if (note.length > NOTE_MAX) {
    return { error: `Keep the note to ${NOTE_MAX} characters or fewer.` };
  }
  return { note };
}

// Only `status`, `preview_url`, and `note`. Any other field is a 400.
// Status or a non-empty note is required; preview_url is optional beside them.
export function cleanBotStatusPatch(body: unknown): { error: string } | BotStatusPatch {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object with status or a note." };
  }
  const input = body as Record<string, unknown>;
  const extra = Object.keys(input).filter((k) => !PATCH_KEYS.has(k));
  if (extra.length) return { error: "The bot can only set status, preview_url, and note." };
  const patch: BotStatusPatch = {};
  if ("status" in input) {
    if (typeof input.status !== "string" || !isStatus(input.status)) return { error: "Pick a column." };
    patch.status = input.status;
  }
  if ("preview_url" in input) {
    if (typeof input.preview_url !== "string") {
      return { error: "The preview link has to be an http or https address." };
    }
    patch.preview_url = input.preview_url;
  }
  const note = cleanBotNote(input.note);
  if ("error" in note) return note;
  if (note.note) patch.note = note.note;
  if (!patch.status && !patch.note) return { error: "Send a status or a note." };
  return patch;
}

// Any board column is allowed, including Parked, the same column, a skip,
// and backwards. Invalid names are rejected before this (Pick a column).
export function botStatusStep(_from: Status, to: Status): { error: string } | { status: Status } {
  if (!isStatus(to)) return { error: "Pick a column." };
  return { status: to };
}

export interface BotCurrentItem {
  status: Status;
  preview_url: string | null;
  released_on: string | null;
}

export interface BotPatchFields {
  status: Status;
  preview_url: string | null;
  released_on: string | null;
  updated_at: string;
}

export interface BotPatchEvent {
  actor: typeof BOT_ACTOR;
  from_status: Status;
  to_status: Status;
  note: string | null;
  created_at: string;
}

// The columns PATCH may write. preview_url is required when the destination
// is Preview and the card doesn't already have a link. released_on is filled
// in when landing on Released so the live-date check holds, and cleared
// when leaving it. Extra item columns are never returned, so they cannot
// be written.
export function botPatchFields(
  current: BotCurrentItem,
  patch: BotStatusPatch,
  now: Date = new Date(),
): { error: string } | BotPatchFields {
  const dest = patch.status ?? current.status;
  const step = botStatusStep(current.status, dest);
  if ("error" in step) return step;
  let preview_url = current.preview_url;
  if (patch.preview_url !== undefined) {
    const url = cleanPreviewUrl(patch.preview_url, dest === "preview");
    if ("error" in url) return url;
    preview_url = url.preview_url;
  }
  if (dest === "preview" && !preview_url) {
    return { error: "Add the preview link." };
  }
  return {
    status: dest,
    preview_url,
    released_on: dest === "released" ? (current.released_on ?? todayIso(now)) : null,
    updated_at: now.toISOString(),
  };
}

export function botPatchEvent(
  from: Status,
  to: Status,
  note: string | null | undefined,
  now: Date = new Date(),
): BotPatchEvent {
  return {
    actor: BOT_ACTOR,
    from_status: from,
    to_status: to,
    note: note ?? null,
    created_at: now.toISOString(),
  };
}

// GET /api/roadmap/items?status=planned — a miss or blank is "every column".
export function botListStatusFilter(raw: string | null): { error: string } | { status: Status | null } {
  if (raw == null || raw === "") return { status: null };
  if (!isStatus(raw)) return { error: "Pick a column." };
  return { status: raw };
}

export interface BotListItem {
  id: string;
  title: string;
  area: string;
  status: string;
  approved_by_name: string | null;
  approved_at: string | null;
}

export function botListItem(row: {
  id: string;
  title: string;
  area: string;
  status: string;
  approved_at?: string | null;
  approver?: { full_name: string | null } | { full_name: string | null }[] | null;
}): BotListItem {
  const approver = Array.isArray(row.approver) ? row.approver[0] : row.approver;
  const name = approver?.full_name?.trim() || null;
  return {
    id: row.id,
    title: row.title,
    area: row.area,
    status: row.status,
    approved_by_name: name,
    approved_at: row.approved_at ?? null,
  };
}

// PATCH must not return 200 when PostgREST updated 0 rows (RLS, a delete in
// between, or a filter miss). 409 so the bot retries instead of treating it
// as done. 404 is for "never found the item" before the write.
export function botPatchUpdated<T>(rows: T[] | T | null):
  | { ok: false; status: 409; error: string }
  | { ok: true; status: 200; item: T } {
  const list = rows == null ? [] : Array.isArray(rows) ? rows : [rows];
  if (!list.length) {
    return { ok: false, status: 409, error: "That item could not be updated." };
  }
  return { ok: true, status: 200, item: list[0] };
}
