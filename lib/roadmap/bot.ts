// Auth and input for the Product Manager bot's roadmap routes
// (/api/roadmap/items and /api/roadmap/items/[id]). POST may only insert, and
// only as `proposed`. PATCH may move one column forward and set preview_url.
// Token check is constant-time so a wrong Bearer header doesn't leak length.

import { createHash, timingSafeEqual } from "node:crypto";
import {
  cleanPreviewUrl,
  cleanRoadmapItem,
  isStatus,
  todayIso,
  type CleanRoadmapItem,
  type Status,
} from "./model.ts"; // explicit extension so node --test can load this file

export const ROADMAP_BOT_TOKEN_ENV = "OLB_ROADMAP_BOT_TOKEN";

const BEARER = "Bearer ";
const PATCH_KEYS = new Set(["status", "preview_url"]);

// One step forward only. Anything else (same column, a skip, or backwards)
// is a 400.
export const BOT_STATUS_FORWARD = {
  proposed: "planned",
  planned: "progress",
  progress: "preview",
  preview: "released",
} as const satisfies Partial<Record<Status, Status>>;

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
  status: Status;
  preview_url?: string;
}

// Only `status` and `preview_url`. Any other field is a 400.
export function cleanBotStatusPatch(body: unknown): { error: string } | BotStatusPatch {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object with status." };
  }
  const input = body as Record<string, unknown>;
  const extra = Object.keys(input).filter((k) => !PATCH_KEYS.has(k));
  if (extra.length) return { error: "The bot can only set status and preview_url." };
  if (!("status" in input)) return { error: "Send a status." };
  if (typeof input.status !== "string" || !isStatus(input.status)) return { error: "Pick a column." };
  if (!("preview_url" in input)) return { status: input.status };
  if (typeof input.preview_url !== "string") return { error: "The preview link has to be an http or https address." };
  return { status: input.status, preview_url: input.preview_url };
}

export function botStatusStep(from: Status, to: Status): { error: string } | { status: Status } {
  const next = BOT_STATUS_FORWARD[from as keyof typeof BOT_STATUS_FORWARD];
  if (next === to) return { status: to };
  if (from === to) return { error: "That item is already in that column." };
  return { error: "The bot can only move an item one column forward: proposed → planned → progress → preview → released." };
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

// The columns PATCH may write. preview_url is required on progress → preview.
// released_on is filled in on preview → released so the live-date check holds.
export function botPatchFields(
  current: BotCurrentItem,
  patch: BotStatusPatch,
  now: Date = new Date(),
): { error: string } | BotPatchFields {
  const step = botStatusStep(current.status, patch.status);
  if ("error" in step) return step;
  const needUrl = current.status === "progress" && patch.status === "preview";
  let preview_url = current.preview_url;
  if (patch.preview_url !== undefined) {
    const url = cleanPreviewUrl(patch.preview_url, needUrl);
    if ("error" in url) return url;
    preview_url = url.preview_url;
  } else if (needUrl) {
    return { error: "Add the preview link." };
  }
  return {
    status: patch.status,
    preview_url,
    released_on: patch.status === "released" ? (current.released_on ?? todayIso(now)) : null,
    updated_at: now.toISOString(),
  };
}
