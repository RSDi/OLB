// ReelNotes shared types — the portable shape of a recording, its action items,
// and the AI-generated summary. Pure (no runtime deps) so any host can import
// them. Names keep the ReelNotes* prefix so existing call sites stay stable.

export type RecordingStatus =
  | "uploading"
  | "transcribing"
  | "extracting"
  | "ready"
  | "failed";

// "typed" is a note written by hand rather than captured: no audio, no
// transcription, no AI extraction — the text the user typed IS the content.
export type RecordingSource = "pwa" | "native" | "watch" | "typed";

// AssemblyAI utterance shape — what we persist into recordings.utterances.
export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface ReelNotesActionItem {
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
  // LLM-suggested supporter names (explicit-only); matched to members in the UI.
  suggested_supporter_names: string[];
  // B4: resolved start offset (ms) of the utterance where this item was
  // raised, or null when no confident transcript anchor exists.
  transcript_ms: number | null;
  created_at: string;
  updated_at: string;
}

// A directory member that can be named on an action item. Supplied by the host
// via the adapter's `members` hook (e.g. a church directory); nickname helps
// matching/display ("Dave"). Optional integration — omit it and ReelNotes still
// records, transcribes, and extracts; it just won't match names to people.
export interface AssignableMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
}

// Granola-style readable summary — content-driven sections, each with short
// bullets. Generated alongside action items at extraction time. Each bullet
// carries an optional `detail`: a grounding note that quotes the transcript,
// surfaced in a "Transcript Summary" popover (the + affordance).
export interface ReelNotesSummaryBullet {
  text: string;
  detail: string | null;
}

export interface ReelNotesSummarySection {
  heading: string;
  bullets: ReelNotesSummaryBullet[];
}

export interface ReelNotesRecording {
  id: string;
  user_id: string;
  title: string | null;
  // Null for typed notes (no audio) and until a recording's audio is stored.
  audio_blob_url: string | null;
  duration_sec: number;
  source: RecordingSource;
  status: RecordingStatus;
  assemblyai_id: string | null;
  transcript: string | null;
  utterances: Utterance[] | null;
  summary: ReelNotesSummarySection[] | null;
  error: string | null;
  // Generic, portable parent link. The package stores and returns these but
  // never interprets them — the host decides what an entity "type" means
  // (MCC uses 'task'). Both null for an unattached note.
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
  updated_at: string;
  action_items: ReelNotesActionItem[];
}
