// Pure Slack-draft helpers. Keep this free of the admin client.

import { SLACK_DRAFT_RETAIN_DAYS } from "./types.ts";

export const SLACK_DRAFT_RETAIN_MS = SLACK_DRAFT_RETAIN_DAYS * 24 * 60 * 60 * 1000;

export function discardedDraftPurgeAt(discardedAt: string): Date {
  return new Date(new Date(discardedAt).getTime() + SLACK_DRAFT_RETAIN_MS);
}

export function isDiscardedDraftRecoverable(discardedAt: string | null | undefined, now = Date.now()): boolean {
  if (!discardedAt) return false;
  return now < discardedDraftPurgeAt(discardedAt).getTime();
}
