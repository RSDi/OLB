"use server";

// Server actions for managing the Slack archive's channel registry.
// Super-admin only (both here and via RLS on slack_archive_channels —
// migration 0077). Mirrors the shape of lib/contacts/category-actions.ts,
// but uses getViewer() rather than requireSuperAdmin() since it already
// resolves memberId alongside the super-admin check in one query.

import { revalidatePath } from "next/cache";
import { getViewer } from "../auth/viewer";
import { createClient } from "../supabase/server";
import { refreshAllChannelAccess, syncOneChannel, type ChannelSyncSummary } from "./sync";

// Leaves headroom under the channel page's `maxDuration = 60` (Server
// Actions inherit their page's maxDuration — see that file) so a mid-walk
// stop (see sync.ts) has time to return cleanly instead of being hard-
// killed by the platform, same margin as the nightly cron route.
const SYNC_DEADLINE_MS = 50_000;

export interface ArchiveChannelActionResult {
  success?: boolean;
  error?: string;
}

export async function addArchiveChannel(
  slackChannelId: string,
  label: string,
): Promise<ArchiveChannelActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };

  const channelId = slackChannelId.trim();
  const trimmedLabel = label.trim();
  if (!channelId) return { error: "Channel ID is required." };
  if (!trimmedLabel) return { error: "Label is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("slack_archive_channels").insert({
    slack_channel_id: channelId,
    label: trimmedLabel,
    added_by: viewer.memberId,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { error: "That channel is already registered." };
    }
    return { error: error.message };
  }

  revalidatePath("/portal/slack-archive");
  return { success: true };
}

export async function setArchiveChannelActive(
  id: string,
  active: boolean,
): Promise<ArchiveChannelActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };

  const supabase = await createClient();
  const { error } = await supabase.from("slack_archive_channels").update({ active }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/slack-archive");
  return { success: true };
}

export interface SyncChannelActionResult {
  summary?: ChannelSyncSummary;
  error?: string;
}

// Syncs exactly one channel on demand — for a channel that's fallen behind
// (e.g. the bot was only just re-invited after being locked out for a
// while, or the nightly cron's rolling window missed it for some reason),
// this catches it up without needing to wait a turn in the nightly cron's
// shared time budget across every registered channel. Forces a full-history
// re-walk (ignoring the stored watermark) rather than trusting it, so this
// button is always a reliable "re-fetch and overwrite everything for this
// channel" escape hatch — every message gets a fresh upsert regardless of
// whether it was already synced (by this button or by the cron). A single
// call may not finish a large backlog (see syncOneChannel's deadline) — the
// caller checks `summary.done` and can just click again.
export async function syncChannelNow(slackChannelId: string): Promise<SyncChannelActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY not set; cannot sync (RLS blocks unauthenticated writes)." };
  }

  const summary = await syncOneChannel(slackChannelId, { deadlineMs: SYNC_DEADLINE_MS, force: true });
  if (summary.errors.length > 0) return { error: summary.errors.join("; "), summary };

  revalidatePath(`/portal/slack-archive/${encodeURIComponent(slackChannelId)}`);
  revalidatePath("/portal/slack-archive");
  return { summary };
}

export interface RefreshAccessActionResult {
  message?: string;
  error?: string;
}

// Re-checks every channel's Slack privacy + membership right now, instead of
// waiting for the nightly sync — e.g. right after someone is added to or
// removed from #building-committee in Slack. Super-admin only. Access for any
// channel that fails keeps its last confirmed state (see refreshChannelAccess).
export async function refreshArchiveAccessNow(): Promise<RefreshAccessActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY not set; cannot update channel access." };
  }

  const results = await refreshAllChannelAccess({ deadlineMs: SYNC_DEADLINE_MS });
  revalidatePath("/portal/slack-archive", "layout");

  const failed = results.filter((r) => r.error);
  if (failed.length === 0) return { message: `Access refreshed for all ${results.length} channels.` };
  const scopeHint = failed.some((r) => r.error?.includes("missing_scope"))
    ? " \"missing_scope\" means the Slack bot needs the channels:read and groups:read scopes (then reinstall the app)."
    : "";
  return {
    error:
      `Access refreshed for ${results.length - failed.length} of ${results.length} channels; ` +
      `${failed.length} failed and keep their last known access (see each channel below).${scopeHint}`,
  };
}
