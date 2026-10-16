// Auth and input for the Product Manager bot's roadmap route
// (/api/roadmap/items). The bot may only insert, and only as `proposed`.
// Token check is constant-time so a wrong Bearer header doesn't leak length.

import { createHash, timingSafeEqual } from "node:crypto";
import { cleanRoadmapItem, type CleanRoadmapItem } from "./model.ts"; // explicit extension so node --test can load this file

export const ROADMAP_BOT_TOKEN_ENV = "OLB_ROADMAP_BOT_TOKEN";

const BEARER = "Bearer ";

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
// `proposed` with no date, so the bot cannot place or date an item.
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
  });
}

// The only columns the bot may write. Status is hardcoded so a future
// change to cleanBotRoadmapItem still cannot place or date an item.
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
