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
  // LLM-inferred urgency from transcript cues; mirrors maintenance priority keys.
  priority: "low" | "medium" | "high" | "emergency";
  // Assignment (label-only metadata on the recorder's own task).
  owner_member_id: string | null;
  supporter_member_ids: string[];
  // LLM-suggested owner + the member it matched (if any), for the confirm UI.
  suggested_assignee_name: string | null;
  suggested_member_id: string | null;
  created_at: string;
  updated_at: string;
}

// A directory member that can be named on an action item. Loaded for the
// assignee picker; nickname is included for matching/display ("Dave").
export interface AssignableMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
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
         id, recording_id, text, routed_to, done, sort_order, priority,
         owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
         created_at, updated_at
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
    action_items: (r.action_items ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      // Defensive: a row with no array (older data) reads as [] for the UI.
      .map(a => ({ ...a, supporter_member_ids: a.supporter_member_ids ?? [] })),
  }));
}

// Approved, non-deleted directory members available to assign to an action
// item. Not restricted to staff — committee members aren't necessarily admins.
// Mirrors the loader in app/portal/settings/AssignmentsTab.tsx, plus nickname.
export async function loadAssignableMembers(): Promise<AssignableMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, full_name, nickname")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("loadAssignableMembers failed", error);
    return [];
  }
  return (data ?? []) as AssignableMember[];
}
