// Shared types + server-side loaders for /portal/daves-idea.
//
// Visibility: every loader here is owner-only. RLS on the underlying tables
// filters to user_id = auth.uid(); loadDavesIdeaViewer() additionally redirects
// non-staff to /portal before any row is fetched.
//
// The webhook + pipeline functions in /api/daves-idea/* bypass RLS via the
// service-role Supabase client, since they run without an authenticated user.

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { getViewer } from "../auth/viewer";

export type RecordingStatus =
  | "uploading"
  | "transcribing"
  | "extracting"
  | "ready"
  | "failed";

export type RecordingSource = "pwa" | "native" | "watch";

// AssemblyAI utterance shape — what we persist into recordings.utterances.
export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface DavesIdeaActionItem {
  id: string;
  recording_id: string;
  text: string;
  routed_to: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DavesIdeaRecording {
  id: string;
  user_id: string;
  title: string | null;
  audio_blob_url: string;
  duration_sec: number;
  source: RecordingSource;
  status: RecordingStatus;
  assemblyai_id: string | null;
  transcript: string | null;
  utterances: Utterance[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  action_items: DavesIdeaActionItem[];
}

// Access guard. Redirects non-staff to /portal. Returns the viewer so callers
// have role/id available without a second fetch.
export async function loadDavesIdeaViewer() {
  const viewer = await getViewer();
  if (!viewer?.isStaff) redirect("/portal");
  return viewer;
}

export async function loadDavesIdeaRecordings(): Promise<DavesIdeaRecording[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daves_idea_recordings")
    .select(
      `id, user_id, title, audio_blob_url, duration_sec, source, status,
       assemblyai_id, transcript, utterances, error, created_at, updated_at,
       action_items:daves_idea_action_items(
         id, recording_id, text, routed_to, done, sort_order, created_at, updated_at
       )`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadDavesIdeaRecordings failed", error);
    return [];
  }
  // Postgrest returns the nested rows; coerce + sort action items by sort_order.
  return ((data ?? []) as unknown as DavesIdeaRecording[]).map(r => ({
    ...r,
    action_items: (r.action_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));
}
