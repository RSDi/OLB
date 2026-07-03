"use server";

// Server actions for managing the Slack archive's channel registry.
// Super-admin only (both here and via RLS on slack_archive_channels —
// migration 0077). Mirrors the shape of lib/contacts/category-actions.ts,
// but uses getViewer() rather than requireSuperAdmin() since it already
// resolves memberId alongside the super-admin check in one query.

import { revalidatePath } from "next/cache";
import { getViewer } from "../auth/viewer";
import { createClient } from "../supabase/server";

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
