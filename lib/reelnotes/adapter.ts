// OLB's implementation of the ReelNotes host seam. This is the ONLY place that
// ties the portable reelnotes package to this app: Supabase clients, the
// signed-in viewer, runtime config from env, the directory (member matching),
// and the task-mirror hook (post a finished recording's summary onto its
// linked task). Another site would write its own adapter and reuse the package
// unchanged.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import {
  AUDIO_BUCKET,
  type ReelNotesAdapter,
  type ReadyRecordingContext,
  type AssignableMember,
} from "reelnotes";

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function olbReelNotesAdapter(): ReelNotesAdapter {
  return {
    config: {
      aiModel: "anthropic/claude-haiku-4-5",
      baseUrl: baseUrl(),
      audioBucket: AUDIO_BUCKET,
      audioMaxBytes: 30 * 1024 * 1024,
      assemblyAiKey: process.env.ASSEMBLYAI_API_KEY,
      webhookSecret: process.env.ASSEMBLYAI_WEBHOOK_SECRET,
      email: process.env.RESEND_API_KEY
        ? { resendKey: process.env.RESEND_API_KEY, from: "ReelNotes <onboarding@resend.dev>" }
        : undefined,
    },

    async getServerClient() {
      return createClient();
    },
    getAdminClient() {
      return createAdminClient();
    },
    async getCurrentUser() {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user ? { id: user.id, email: user.email ?? null } : null;
    },

    members: {
      async listAssignable(): Promise<AssignableMember[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("members")
          .select("id, full_name, nickname")
          .eq("status", "approved")
          .is("deleted_at", null)
          .order("full_name", { ascending: true });
        if (error) {
          console.error("listAssignable failed", error);
          return [];
        }
        return (data ?? []) as AssignableMember[];
      },
    },

    // B3: mirror the finished recording's summary onto its linked task's
    // comment thread, so the notes land where the work is. The generic link
    // arrives on the context; OLB only mirrors notes attached to a task.
    async onRecordingReady(ctx: ReadyRecordingContext) {
      if (ctx.linkedEntityType !== "task" || !ctx.linkedEntityId) return;
      const linkedTicketId = ctx.linkedEntityId;
      const admin = createAdminClient();

      const { data: authorRow } = await admin
        .from("members")
        .select("id")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const authorId = (authorRow as { id: string } | null)?.id;
      if (!authorId) return;

      // Readable fallback body — what Slack and non-staff viewers see. In-app,
      // the thread renders interactive action items from the linked recording
      // (via recording_id) instead of this text.
      const summaryText =
        ctx.actions.length > 0
          ? `Action items:\n${ctx.actions.map(a => `• ${a.text}`).join("\n")}`
          : ctx.transcript
            ? `Transcript (start):\n${ctx.transcript.slice(0, 280)}${ctx.transcript.length > 280 ? "…" : ""}`
            : "No speech detected in the recording.";
      const body = [
        `🎙️ ReelNotes — "${ctx.title}"`,
        "",
        summaryText,
        "",
        `Listen & route items: ${baseUrl()}/portal/reelnotes?r=${ctx.recordingId}`,
      ].join("\n");
      // Idempotent: re-processing a recording (retry-transcription, re-extract,
      // or a re-fired transcription webhook) must refresh the one recorded-note
      // comment, not post another. Migration 0075 also enforces one live comment
      // per recording at the DB level.
      const { data: existingComment } = await admin
        .from("ticket_comments")
        .select("id")
        .eq("recording_id", ctx.recordingId)
        .is("deleted_at", null)
        .maybeSingle();
      const { error: commentErr } = existingComment
        ? await admin.from("ticket_comments").update({ body }).eq("id", existingComment.id)
        : await admin
            .from("ticket_comments")
            .insert({ ticket_id: linkedTicketId, author_id: authorId, body, recording_id: ctx.recordingId });
      if (commentErr) console.error("ReelNotes comment upsert failed", commentErr);
    },
  };
}
