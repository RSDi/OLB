"use server";
// Portal → Film Slack drafts. Approve is the only path that posts. Pending
// status + Teams & volunteers (or Game film manage) are checked here.

import { revalidatePath } from "next/cache";
import { requireFilmSlackApprove } from "../auth/guards.ts";
import { postSlackPlainMessage, slackBotConfigured } from "../notifications/slack.ts";
import {
  claimFilmSlackDraft,
  discardFilmSlackDraft,
  getFilmSlackDraft,
  markFilmSlackDraftPosted,
  resolveFilmSlackDraftChannel,
  restoreFilmSlackDraft,
  revertFilmSlackDraftClaim,
  updateFilmSlackDraftBody,
} from "./slack-drafts.ts";

function refresh() {
  revalidatePath("/portal/film");
  revalidatePath("/portal/film/status");
}

export async function editFilmSlackDraft(
  id: string,
  body: unknown
): Promise<{ error?: string; ok?: true; body?: string }> {
  const gate = await requireFilmSlackApprove();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That draft isn't there any more." };
  if (typeof body !== "string") return { error: "Write the Slack post first." };
  const text = body.trim();
  if (!text) return { error: "Write the Slack post first." };
  if (text.length > 4000) return { error: "Keep the Slack post under 4000 characters." };
  const row = await getFilmSlackDraft(id);
  if (!row) return { error: "That draft isn't there any more." };
  if (row.status === "posted") return { error: "That post already went out." };
  if (row.status === "discarded") return { error: "That draft was discarded. Restore it first." };
  if (row.status !== "pending") return { error: "That draft isn't waiting for approval." };
  const saved = await updateFilmSlackDraftBody(id, text);
  if (!saved) return { error: "That draft isn't waiting for approval." };
  refresh();
  return { ok: true, body: saved.body };
}

export async function discardPendingFilmSlackDraft(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmSlackApprove();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That draft isn't there any more." };
  const row = await getFilmSlackDraft(id);
  if (!row) return { error: "That draft isn't there any more." };
  if (row.status === "posted") return { error: "That post already went out." };
  if (row.status === "discarded") return { ok: true };
  const saved = await discardFilmSlackDraft(id);
  if (!saved) return { error: "That draft isn't waiting for approval." };
  refresh();
  return { ok: true };
}

export async function restoreDiscardedFilmSlackDraft(
  id: string
): Promise<{ error?: string; ok?: true }> {
  const gate = await requireFilmSlackApprove();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That draft isn't there any more." };
  const saved = await restoreFilmSlackDraft(id);
  if (!saved) return { error: "That draft can't be restored. Discarded posts are kept for 30 days." };
  refresh();
  return { ok: true };
}

export async function approveFilmSlackDraft(
  id: string
): Promise<{ error?: string; ok?: true; alreadyPosted?: true }> {
  const gate = await requireFilmSlackApprove();
  if ("error" in gate) return { error: gate.error };
  if (!id || typeof id !== "string") return { error: "That draft isn't there any more." };
  const row = await getFilmSlackDraft(id);
  if (!row) return { error: "That draft isn't there any more." };
  if (row.status === "posted") return { ok: true, alreadyPosted: true };
  if (row.status === "discarded") return { error: "That draft was discarded. Restore it first." };
  const channel = (await resolveFilmSlackDraftChannel(row)) || "";
  if (!channel) {
    return { error: "Set this team's Slack channel ID in Settings → Film first." };
  }
  if (!slackBotConfigured()) {
    return { error: "Sparky isn't connected (no Slack bot token), so this can't post yet." };
  }

  const claimed = await claimFilmSlackDraft(id, gate.userId);
  if (!claimed) {
    const again = await getFilmSlackDraft(id);
    if (again?.status === "posted") return { ok: true, alreadyPosted: true };
    return { error: "That draft isn't waiting for approval." };
  }

  const posted = await postSlackPlainMessage(channel, claimed.body, `film-slack ${id}`);
  if (!posted) {
    await revertFilmSlackDraftClaim(id);
    return {
      error: "Slack didn't accept that post. Check the channel ID and that Sparky is in the channel.",
    };
  }
  const saved = await markFilmSlackDraftPosted(id, posted);
  if (!saved) {
    // Posted once; don't retry. Treat as success so Approve stays idempotent.
    refresh();
    return { ok: true };
  }
  refresh();
  return { ok: true };
}
