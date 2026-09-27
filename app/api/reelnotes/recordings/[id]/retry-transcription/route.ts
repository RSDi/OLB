// POST /api/reelnotes/recordings/[id]/retry-transcription
//
// Re-submits a recording's stored audio to AssemblyAI for a fresh transcript.
// AssemblyAI errors are often transient, so a failed recording can usually be
// recovered with one click — no re-recording needed. Re-uploads the same bytes
// from the private bucket and starts a new job; the webhook takes it from there.
//
// Auth: staff-only AND the recording must belong to the calling user.

import { NextResponse } from "next/server";
import { createClient } from "../../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { retryTranscription, RECORDING_SELECT } from "reelnotes/server";
import { olbReelNotesAdapter } from "../../../../../../lib/reelnotes/adapter";

export const runtime = "nodejs";
// Re-upload to AssemblyAI + job submit are two sequential POSTs; 60s is ample.
export const maxDuration = 60;

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

  // Cleaner 404/403 up front than letting the admin client run on a missing row.
  const { data: rec } = await supabase
    .from("reel_notes_recordings")
    .select("id, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rec.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await retryTranscription(olbReelNotesAdapter(), id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Retry failed" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: refreshed } = await admin
    .from("reel_notes_recordings")
    .select(RECORDING_SELECT)
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ recording: refreshed });
}
