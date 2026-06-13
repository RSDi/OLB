// MCC's implementation of the ReelNotes host seam. This is the ONLY place that
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

export function mccReelNotesAdapter(): ReelNotesAdapter {
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
    // comment thread, so the notes land where the work is. No link → no-op.
    async onRecordingReady(ctx: ReadyRecordingContext) {
      const admin = createAdminClient();
      const { data: linkRow } = await admin
        .from("reel_notes_recordings")
        .select("linked_ticket_id")
        .eq("id", ctx.recordingId)
        .maybeSingle();
      const linkedTicketId = (linkRow as { linked_ticket_id?: string | null } | null)?.linked_ticket_id ?? null;
      if (!linkedTicketId) return;

      const { data: authorRow } = await admin
        .from("members")
        .select("id")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const authorId = (authorRow as { id: string } | null)?.id;
      if (!authorId) return;

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
      const { error: commentErr } = await admin
        .from("ticket_comments")
        .insert({ ticket_id: linkedTicketId, author_id: authorId, body });
      if (commentErr) console.error("ReelNotes comment insert failed", commentErr);
    },
  };
}
