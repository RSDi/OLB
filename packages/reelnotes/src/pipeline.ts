// End-to-end processing once AssemblyAI signals a transcript is complete:
//
//   1. Fetch full transcript + speaker utterances from AssemblyAI.
//   2. Persist transcript / utterances on the recording row.
//   3. Ask an AI model (via the configured gateway) for a title + action items
//      + a readable summary.
//   4. Insert action_items rows (with resolved transcript anchors).
//   5. Mark the recording ready, hand the result to the host (onRecordingReady),
//      and email the owner.
//
// All Supabase access here uses the service-role (admin) client, because the
// webhook runs without an authenticated session. Everything host-specific —
// clients, keys, model, the optional task mirror — arrives via the adapter.

import { generateObject } from "ai";
import { Resend } from "resend";
import { z } from "zod";
import { resolveAnchorMs } from "./anchor";
import type { ReelNotesAdapter } from "./adapter";

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
  // Per-word timings (returned by default) — used to anchor an action item to
  // the exact moment it was discussed, not just the (possibly long) utterance.
  words: { text: string; start: number; end: number }[] | null;
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
        anchor_quote: z
          .string()
          .nullish()
          .describe(
            'A SHORT verbatim span (4-15 words) COPIED WORD-FOR-WORD from the transcript — the exact words spoken when THIS item came up. Copy it character-for-character: do not paraphrase, fix grammar, add punctuation, or merge sentences. Used to jump the audio to that moment, so it MUST appear verbatim in the transcript. Set null if the item is synthesized from several places or no single spoken span clearly corresponds to it.'
          ),
      })
    )
    .max(15)
    .describe("Action items extracted from the transcript. Empty if none."),
  summary: z
    .array(
      z.object({
        heading: z.string().describe("A short section heading (1-4 words)."),
        bullets: z
          .array(
            z.object({
              text: z.string().describe("A short, skimmable bullet point."),
              detail: z
                .string()
                .nullish()
                .describe(
                  'A 1-3 sentence "transcript summary" that grounds THIS bullet in the conversation — explain what was said and weave in SHORT verbatim quotes from the transcript (in double quotes) showing where it came from, like a footnote. Null if you cannot tie it to specific spoken words.'
                ),
            })
          )
          .describe("2-6 bullet points under this heading."),
      })
    )
    .max(6)
    .nullish()
    .describe(
      'A readable summary of the recording as a few sections — choose headings that fit the content (e.g. "Situation", "Plan", "Timeline", "Next Steps"). Each section has short bullets. This is the human-readable recap, distinct from the action items. Empty/null if the recording is too thin to summarize.'
    ),
});

type ActionPriority = "low" | "medium" | "high" | "emergency";

interface ExtractedAction {
  text: string;
  suggested_assignee: string | null;
  priority: ActionPriority;
  suggested_supporters: string[];
  anchor_quote: string | null;
}

interface ExtractedSummaryBullet {
  text: string;
  detail: string | null;
}

interface ExtractedSummarySection {
  heading: string;
  bullets: ExtractedSummaryBullet[];
}

async function fetchAssemblyAITranscript(transcriptId: string, key: string): Promise<AssemblyAITranscript> {
  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: { authorization: key },
  });
  if (!res.ok) {
    throw new Error(`AssemblyAI fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AssemblyAITranscript;
}

async function extractTitleAndActions(
  transcript: string,
  model: string,
): Promise<{ title: string; actions: ExtractedAction[]; summary: ExtractedSummarySection[] | null }> {
  // AI Gateway: provider/model string, auto-routed. On Vercel the gateway
  // authenticates via OIDC; locally it needs AI_GATEWAY_API_KEY.
  const { object } = await generateObject({
    model,
    schema: ExtractionSchema,
    prompt: `You are an assistant that processes meeting/conversation transcripts.

Given the transcript below, return:
1. A short 3-8 word title that captures what was discussed.
2. A list of concrete action items. Only include things that someone needs to DO — not observations or musings. If the speaker said "I should X" or "we need to Y" or "make sure to Z", that's an action. Skip anything vague. Phrase each action item as an imperative sentence (e.g. "Pay bus deposit by 6/15", not "the bus deposit needs to be paid").
3. For each action item, if the transcript clearly names who is responsible for it (e.g. "Dave will pay the deposit", "ask Jeff to call the vendor"), set suggested_assignee to that person's name as spoken — a first name or nickname. If no one is clearly named for that item, leave it null. Do not guess.
4. For each action item, set priority from how it was discussed: "emergency" for critical/ASAP/right-away language, "high" for urgent/important/"we should get on this", "low" for no-rush/someday, otherwise "medium". Don't inflate — only raise priority when the urgency is actually expressed.
5. For each action item, set suggested_supporters ONLY when the transcript explicitly says someone will help/assist/work-with the responsible person on THAT item. Leave it empty otherwise — do NOT add everyone who was in the conversation, and do NOT include the responsible person themselves.
6. For each action item, set anchor_quote to a short verbatim span copied EXACTLY from the transcript where this item was raised — the literal spoken words, not your rephrasing. This is used to jump the audio to that moment, so it must appear verbatim in the transcript below. If you cannot point to one clear span, set it null. Never invent or normalize the quote.
7. Produce a readable "summary" — a few sections that recap the recording for someone who wasn't there. Choose 2-5 section headings that fit the content (for a work/maintenance discussion that might be "Situation", "Plan", "Timeline", "Next Steps"; for other content, pick what fits). Each section has 2-6 short, skimmable bullets. This is the human-readable recap and is separate from the action items above — it's fine for it to restate things. If the transcript is too thin to summarize, return an empty list. For each bullet, also set "detail" to a 1-3 sentence note that grounds the bullet in the conversation, weaving in short verbatim quotes from the transcript (in double quotes) to show where it came from — set it null if you cannot point to specific spoken words.

If there are no clear action items, return an empty list. Do not pad.

Transcript:
"""
${transcript}
"""`,
  });
  // Keep only well-formed summary sections (a heading + at least one bullet);
  // collapse to null when nothing usable remains so the UI hides the tab.
  const summary = (object.summary ?? [])
    .map(sec => ({
      heading: (sec.heading ?? "").trim(),
      bullets: (sec.bullets ?? [])
        .map(b => ({ text: (b.text ?? "").trim(), detail: b.detail?.trim() || null }))
        .filter(b => b.text),
    }))
    .filter(sec => sec.heading && sec.bullets.length > 0);
  return {
    title: object.title,
    actions: object.action_items.map(a => ({
      text: a.text,
      suggested_assignee: a.suggested_assignee ?? null,
      priority: a.priority ?? "medium",
      suggested_supporters: (a.suggested_supporters ?? []).map(s => s.trim()).filter(Boolean),
      anchor_quote: a.anchor_quote?.trim() || null,
    })),
    summary: summary.length > 0 ? summary : null,
  };
}

async function lookupUserEmail(adapter: ReelNotesAdapter, userId: string): Promise<string | null> {
  const admin = adapter.getAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

async function sendCompletionEmail(
  adapter: ReelNotesAdapter,
  opts: { toEmail: string; title: string; transcriptPreview: string; actionCount: number },
) {
  const email = adapter.config.email;
  if (!email) return; // host opted out of completion emails
  const resend = new Resend(email.resendKey);
  const link = `${adapter.config.baseUrl}/portal/reelnotes`;
  await resend.emails.send({
    from: email.from,
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
  adapter: ReelNotesAdapter,
  opts?: { force?: boolean }
): Promise<void> {
  const admin = adapter.getAdminClient();

  // 1. Load the row.
  const { data: rec, error: loadErr } = await admin
    .from("reel_notes_recordings")
    .select("id, user_id, assemblyai_id, status, linked_entity_type, linked_entity_id")
    .eq("id", recordingId)
    .maybeSingle();
  if (loadErr || !rec) {
    console.error("Pipeline: recording not found", recordingId, loadErr);
    return;
  }
  const recording = rec as {
    id: string;
    user_id: string;
    assemblyai_id: string | null;
    status: string;
    linked_entity_type: string | null;
    linked_entity_id: string | null;
  };

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
    await admin.from("reel_notes_action_items").delete().eq("recording_id", recordingId);
  }

  const aaiKey = adapter.config.assemblyAiKey;
  if (!aaiKey) {
    console.error("Pipeline: assemblyAiKey not configured");
    return;
  }

  try {
    // 2. Pull the transcript.
    const t = await fetchAssemblyAITranscript(recording.assemblyai_id, aaiKey);
    if (t.status === "error") {
      await admin
        .from("reel_notes_recordings")
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
    // Word-level segments for precise anchoring (a whole recording can come back
    // as one utterance, which would collapse every item to the same moment).
    const words = (t.words || []).map(w => ({ text: w.text, start: w.start }));

    await admin
      .from("reel_notes_recordings")
      .update({
        transcript: transcriptText,
        utterances: utterances.length > 0 ? utterances : null,
        status: "extracting",
      })
      .eq("id", recordingId);

    // 3. LLM extraction. If the transcript is empty (silent recording), skip.
    let title = "Untitled recording";
    let actions: ExtractedAction[] = [];
    let summary: ExtractedSummarySection[] | null = null;
    let extractionError: string | null = null;
    if (transcriptText.length > 0) {
      try {
        const out = await extractTitleAndActions(transcriptText, adapter.config.aiModel);
        title = out.title;
        actions = out.actions;
        summary = out.summary;
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
      const rows = actions.map((a, idx) => {
        // Resolve the LLM's verbatim anchor quote to a real ms offset (B4).
        // Ground to the WORD where the quote starts so the jump lands on the
        // moment the item was discussed; fall back to utterance-level (then
        // null). Wrapped so a matcher bug can never fail the recording.
        let transcriptMs: number | null = null;
        try {
          transcriptMs =
            resolveAnchorMs(a.anchor_quote, words) ?? resolveAnchorMs(a.anchor_quote, utterances);
        } catch (err) {
          console.error("anchor resolution failed (non-fatal)", err);
        }
        return {
          recording_id: recordingId,
          text: a.text,
          sort_order: idx,
          suggested_assignee_name: a.suggested_assignee?.trim() || null,
          priority: a.priority,
          suggested_supporter_names: a.suggested_supporters,
          anchor_quote: a.anchor_quote,
          transcript_ms: transcriptMs,
        };
      });
      const { error: insertErr } = await admin.from("reel_notes_action_items").insert(rows);
      if (insertErr) console.error("Action item insert failed", insertErr);
    }

    // 5. Mark ready with the LLM title. `error` is cleared on success,
    // populated when extraction failed — the UI already surfaces it in red.
    await admin
      .from("reel_notes_recordings")
      .update({ title, status: "ready", error: extractionError })
      .eq("id", recordingId);

    // The readable summary is a nice-to-have — write it separately so a
    // summary-write failure can never knock the recording out of "ready".
    {
      const { error: summaryErr } = await admin
        .from("reel_notes_recordings")
        .update({ summary })
        .eq("id", recordingId);
      if (summaryErr) console.error("Summary write failed (non-fatal)", summaryErr.message);
    }

    // 5.5 Hand the finished recording to the host (optional). OLB uses this to
    // mirror the summary onto a linked task's comment thread. Best-effort.
    if (adapter.onRecordingReady) {
      try {
        await adapter.onRecordingReady({
          recordingId,
          userId: recording.user_id,
          title,
          transcript: transcriptText,
          actions: actions.map(a => ({ text: a.text, priority: a.priority })),
          summary,
          linkedEntityType: recording.linked_entity_type,
          linkedEntityId: recording.linked_entity_id,
        });
      } catch (err) {
        console.error("onRecordingReady hook failed (non-fatal)", err);
      }
    }

    // 6. Email the user.
    const userEmail = await lookupUserEmail(adapter, recording.user_id);
    if (userEmail) {
      try {
        await sendCompletionEmail(adapter, {
          toEmail: userEmail,
          title,
          transcriptPreview: transcriptText.slice(0, 480) + (transcriptText.length > 480 ? "…" : ""),
          actionCount: actions.length,
        });
      } catch (err) {
        console.error("Completion email failed", err);
      }
    }
  } catch (err) {
    console.error("Pipeline failed", err);
    await admin
      .from("reel_notes_recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "Pipeline error",
      })
      .eq("id", recordingId);
  }
}
