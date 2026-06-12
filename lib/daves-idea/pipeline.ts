// End-to-end processing once AssemblyAI signals a transcript is complete:
//
//   1. Fetch full transcript + speaker utterances from AssemblyAI.
//   2. Persist transcript / utterances on the recording row.
//   3. Ask Claude (via Vercel AI Gateway) for a short title + action items.
//   4. Insert action_items rows.
//   5. Send a completion email via Resend.
//   6. Mark the recording as ready (or failed if any step blew up).
//
// All Supabase access here uses the service-role client because the webhook
// runs without an authenticated session.

import { generateObject } from "ai";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";

interface AssemblyAIUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface AssemblyAITranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  utterances: AssemblyAIUtterance[] | null;
  error: string | null;
}

const ExtractionSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(80)
    .describe("A short 3-8 word title summarizing the recording."),
  action_items: z
    .array(
      z.object({
        text: z.string().describe("Single concrete action item (an imperative phrase)."),
        suggested_assignee: z
          .string()
          .nullish()
          .describe(
            'If the transcript makes someone responsible for THIS item (e.g. "Dave will pay the deposit", "ask Jeff to call the vendor"), their name as spoken — a first name or nickname. Null if no one is clearly named.'
          ),
        priority: z
          .enum(["low", "medium", "high", "emergency"])
          .nullish()
          .describe(
            'Urgency for THIS item based on how it was discussed. "emergency" for critical/ASAP/right-away language; "high" for urgent/important/"we should get on this"; "low" for no-rush/someday/eventually; otherwise "medium". Default "medium" if no urgency cues.'
          ),
        suggested_supporters: z
          .array(z.string())
          .nullish()
          .describe(
            'Names (as spoken) of people the transcript EXPLICITLY says will help/assist/work-with the responsible person on THIS item (e.g. "Jeff bring the cigars, and Dave help him" → ["Dave"] on the cigars item). Empty unless help is explicitly stated — do NOT include the owner, and do NOT add everyone who was in the conversation.'
          ),
      })
    )
    .max(15)
    .describe("Action items extracted from the transcript. Empty if none."),
});

type ActionPriority = "low" | "medium" | "high" | "emergency";

interface ExtractedAction {
  text: string;
  suggested_assignee: string | null;
  priority: ActionPriority;
  suggested_supporters: string[];
}

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function fetchAssemblyAITranscript(transcriptId: string): Promise<AssemblyAITranscript> {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY not set");
  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: { authorization: key },
  });
  if (!res.ok) {
    throw new Error(`AssemblyAI fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AssemblyAITranscript;
}

async function extractTitleAndActions(transcript: string): Promise<{ title: string; actions: ExtractedAction[] }> {
  // Vercel AI Gateway: provider/model string, auto-routed. On Vercel the
  // gateway authenticates via OIDC; locally we need AI_GATEWAY_API_KEY.
  const { object } = await generateObject({
    model: "anthropic/claude-haiku-4-5",
    schema: ExtractionSchema,
    prompt: `You are an assistant that processes meeting/conversation transcripts.

Given the transcript below, return:
1. A short 3-8 word title that captures what was discussed.
2. A list of concrete action items. Only include things that someone needs to DO — not observations or musings. If the speaker said "I should X" or "we need to Y" or "make sure to Z", that's an action. Skip anything vague. Phrase each action item as an imperative sentence (e.g. "Pay bus deposit by 6/15", not "the bus deposit needs to be paid").
3. For each action item, if the transcript clearly names who is responsible for it (e.g. "Dave will pay the deposit", "ask Jeff to call the vendor"), set suggested_assignee to that person's name as spoken — a first name or nickname. If no one is clearly named for that item, leave it null. Do not guess.
4. For each action item, set priority from how it was discussed: "emergency" for critical/ASAP/right-away language, "high" for urgent/important/"we should get on this", "low" for no-rush/someday, otherwise "medium". Don't inflate — only raise priority when the urgency is actually expressed.
5. For each action item, set suggested_supporters ONLY when the transcript explicitly says someone will help/assist/work-with the responsible person on THAT item. Leave it empty otherwise — do NOT add everyone who was in the conversation, and do NOT include the responsible person themselves.

If there are no clear action items, return an empty list. Do not pad.

Transcript:
"""
${transcript}
"""`,
  });
  return {
    title: object.title,
    actions: object.action_items.map(a => ({
      text: a.text,
      suggested_assignee: a.suggested_assignee ?? null,
      priority: a.priority ?? "medium",
      suggested_supporters: (a.suggested_supporters ?? []).map(s => s.trim()).filter(Boolean),
    })),
  };
}

async function lookupUserEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

async function sendCompletionEmail(opts: {
  toEmail: string;
  recordingId: string;
  title: string;
  transcriptPreview: string;
  actionCount: number;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return;
  }
  const resend = new Resend(key);
  const link = `${siteUrl()}/portal/daves-idea`;
  await resend.emails.send({
    from: "Dave's Idea <onboarding@resend.dev>",
    to: opts.toEmail,
    subject: `Recording ready: ${opts.title}`,
    text: [
      `Your recording is ready.`,
      ``,
      `Title: ${opts.title}`,
      `Action items extracted: ${opts.actionCount}`,
      ``,
      `Preview:`,
      opts.transcriptPreview,
      ``,
      `View transcript & action items: ${link}`,
    ].join("\n"),
  });
}

export async function processTranscriptionCompleted(
  recordingId: string,
  opts?: { force?: boolean }
): Promise<void> {
  const admin = createAdminClient();

  // 1. Load the row.
  const { data: rec, error: loadErr } = await admin
    .from("daves_idea_recordings")
    .select("id, user_id, assemblyai_id, status")
    .eq("id", recordingId)
    .maybeSingle();
  if (loadErr || !rec) {
    console.error("Pipeline: recording not found", recordingId, loadErr);
    return;
  }
  const recording = rec as { id: string; user_id: string; assemblyai_id: string | null; status: string };

  // B3: linked task, fetched separately + tolerantly so a pre-0052 schema
  // (no linked_ticket_id column) errors into "not linked" instead of
  // breaking the whole pipeline.
  let linkedTicketId: string | null = null;
  {
    const { data: linkRow } = await admin
      .from("daves_idea_recordings")
      .select("linked_ticket_id")
      .eq("id", recordingId)
      .maybeSingle();
    linkedTicketId = (linkRow as { linked_ticket_id?: string | null } | null)?.linked_ticket_id ?? null;
  }
  if (!recording.assemblyai_id) {
    console.error("Pipeline: recording has no assemblyai_id", recordingId);
    return;
  }
  if (recording.status === "ready" && !opts?.force) {
    // Already processed (webhook can fire twice). Skip unless forced.
    return;
  }
  if (opts?.force) {
    // Re-extracting from scratch: nuke prior action items so the fresh run
    // produces a clean list rather than appending to old ones.
    await admin.from("daves_idea_action_items").delete().eq("recording_id", recordingId);
  }

  try {
    // 2. Pull the transcript.
    const t = await fetchAssemblyAITranscript(recording.assemblyai_id);
    if (t.status === "error") {
      await admin
        .from("daves_idea_recordings")
        .update({ status: "failed", error: t.error || "AssemblyAI returned error" })
        .eq("id", recordingId);
      return;
    }
    if (t.status !== "completed") {
      // Webhook fired before the transcript was ready — bail; AssemblyAI will
      // fire again. (Shouldn't happen, but defensive.)
      console.warn("Pipeline: transcript not yet completed", recording.assemblyai_id, t.status);
      return;
    }

    const transcriptText = (t.text || "").trim();
    const utterances = (t.utterances || []).map(u => ({
      speaker: u.speaker,
      text: u.text,
      start: u.start,
      end: u.end,
    }));

    await admin
      .from("daves_idea_recordings")
      .update({
        transcript: transcriptText,
        utterances: utterances.length > 0 ? utterances : null,
        status: "extracting",
      })
      .eq("id", recordingId);

    // 3. LLM extraction. If the transcript is empty (silent recording), skip.
    let title = "Untitled recording";
    let actions: ExtractedAction[] = [];
    let extractionError: string | null = null;
    if (transcriptText.length > 0) {
      try {
        const out = await extractTitleAndActions(transcriptText);
        title = out.title;
        actions = out.actions;
      } catch (err) {
        console.error("LLM extraction failed", err);
        // Surface the failure on the row instead of silently producing an
        // empty action list — otherwise the user sees a "ready" recording
        // with no items and no explanation.
        const msg = err instanceof Error ? err.message : "Extraction failed";
        extractionError = msg.length > 280 ? msg.slice(0, 280) + "…" : msg;
      }
    }

    // 4. Insert action items with the LLM's suggested assignee name. Matching
    // that name to a member happens live in the UI, so it stays current with
    // the directory and applies to older recordings too.
    if (actions.length > 0) {
      const rows = actions.map((a, idx) => ({
        recording_id: recordingId,
        text: a.text,
        sort_order: idx,
        suggested_assignee_name: a.suggested_assignee?.trim() || null,
        priority: a.priority,
        suggested_supporter_names: a.suggested_supporters,
      }));
      const { error: insertErr } = await admin.from("daves_idea_action_items").insert(rows);
      if (insertErr) console.error("Action item insert failed", insertErr);
    }

    // 5. Mark ready with the LLM title. `error` is cleared on success,
    // populated when extraction failed — the UI already surfaces it in red.
    await admin
      .from("daves_idea_recordings")
      .update({ title, status: "ready", error: extractionError })
      .eq("id", recordingId);

    // 5.5 (B3): recorded on a task — drop the summary into its comment
    // thread so the notes land where the work is.
    if (linkedTicketId) {
      try {
        const { data: authorRow } = await admin
          .from("members")
          .select("id")
          .eq("user_id", recording.user_id)
          .maybeSingle();
        const authorId = (authorRow as { id: string } | null)?.id;
        if (authorId) {
          const summary =
            actions.length > 0
              ? `Action items:\n${actions.map(a => `• ${a.text}`).join("\n")}`
              : transcriptText
                ? `Transcript (start):\n${transcriptText.slice(0, 280)}${transcriptText.length > 280 ? "…" : ""}`
                : "No speech detected in the recording.";
          const body = [
            `🎙️ ReelNotes — "${title}"`,
            "",
            summary,
            "",
            `Listen & route items: ${siteUrl()}/portal/daves-idea?r=${recordingId}`,
          ].join("\n");
          const { error: commentErr } = await admin
            .from("ticket_comments")
            .insert({ ticket_id: linkedTicketId, author_id: authorId, body });
          if (commentErr) console.error("ReelNotes comment insert failed", commentErr);
        }
      } catch (err) {
        console.error("ReelNotes comment post failed", err);
      }
    }

    // 6. Email the user.
    const userEmail = await lookupUserEmail(recording.user_id);
    if (userEmail) {
      try {
        await sendCompletionEmail({
          toEmail: userEmail,
          recordingId,
          title,
          transcriptPreview: transcriptText.slice(0, 480) + (transcriptText.length > 480 ? "…" : ""),
          actionCount: actions.length,
        });
      } catch (err) {
        console.error("Resend email failed", err);
      }
    }
  } catch (err) {
    console.error("Pipeline failed", err);
    await admin
      .from("daves_idea_recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "Pipeline error",
      })
      .eq("id", recordingId);
  }
}
