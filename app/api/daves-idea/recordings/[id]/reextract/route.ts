// POST /api/daves-idea/recordings/[id]/reextract
//
// Re-runs the post-transcription pipeline for an existing recording. The
// transcript is re-fetched from AssemblyAI (still cached on their side, so
// this is cheap) and the LLM extraction + email steps run again. Use this
// after fixing an LLM-side issue (e.g. an AI Gateway billing gap) so prior
// recordings can pick up real action items without re-uploading audio.
//
// Auth: staff-only AND the recording must belong to the calling user.

import { NextResponse } from "next/server";
import { createClient } from "../../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { processTranscriptionCompleted } from "../../../../../../lib/daves-idea/pipeline";

export const runtime = "nodejs";
// LLM call + email is typically <10s; cap generously.
export const maxDuration = 60;

const RECORDING_SELECT = `id, user_id, title, audio_blob_url, duration_sec, source, status,
  assemblyai_id, transcript, utterances, error, created_at, updated_at,
  action_items:daves_idea_action_items(
    id, recording_id, text, routed_to, done, sort_order,
    owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
    created_at, updated_at
  )`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getViewer();
  if (!viewer?.isStaff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS would also enforce this, but doing the check up front returns a
  // cleaner 404/403 than letting the admin client run on a missing row.
  const { data: rec } = await supabase
    .from("daves_idea_recordings")
    .select("id, user_id, assemblyai_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rec.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!rec.assemblyai_id) {
    return NextResponse.json(
      { error: "Recording has no AssemblyAI transcript to re-extract from" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  // Optimistic state flip so polling clients see the work in progress.
  await admin
    .from("daves_idea_recordings")
    .update({ status: "extracting", error: null })
    .eq("id", id);

  // Run the pipeline inline. With AI Gateway latency this is ~5s, fine to
  // await — the user clicked a button and the UI shows a loading state.
  await processTranscriptionCompleted(id, { force: true });

  const { data: refreshed } = await admin
    .from("daves_idea_recordings")
    .select(RECORDING_SELECT)
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ recording: refreshed });
}
