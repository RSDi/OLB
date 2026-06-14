// The host seam. ReelNotes is a portable product: it knows how to record,
// transcribe (AssemblyAI), extract (an AI gateway), persist (Supabase), and
// store audio (Supabase Storage). Everything host-specific is injected through
// this adapter, so dropping ReelNotes into another app means implementing one
// object — nothing in src/ imports app code.
//
// The two `members` and `tasks` hooks are OPTIONAL. Omit them and ReelNotes
// still records → transcribes → extracts → summarizes; it just won't match
// spoken names to a directory or mirror notes onto a host work-item.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignableMember, ReelNotesSummarySection } from "./types";

export interface ReelNotesConfig {
  // AI extraction (Vercel AI Gateway model string, e.g. "anthropic/claude-haiku-4-5").
  aiModel: string;
  // Public base URL of the host, used to build the AssemblyAI webhook callback.
  baseUrl: string;
  // Supabase Storage bucket holding the private audio.
  audioBucket: string;
  // Max accepted upload size in bytes.
  audioMaxBytes: number;
  // AssemblyAI REST key. Read from the host env; passed in so src/ never reads
  // process.env directly.
  assemblyAiKey: string | undefined;
  // Shared secret AssemblyAI echoes back on the webhook (optional but advised).
  webhookSecret: string | undefined;
  // Optional completion email. Omit to skip emailing.
  email?: { resendKey: string; from: string };
}

// Context handed to onRecordingReady once a recording finishes processing.
export interface ReadyRecordingContext {
  recordingId: string;
  userId: string;
  title: string;
  transcript: string;
  actions: { text: string; priority: string }[];
  summary: ReelNotesSummarySection[] | null;
  // Generic parent link copied from the recording row, so the host can mirror
  // the result onto its work-item without a second query. Both null if the
  // note isn't attached to anything.
  linkedEntityType: string | null;
  linkedEntityId: string | null;
}

export interface ReelNotesAdapter {
  config: ReelNotesConfig;

  // Supabase clients. server = cookie/RLS-scoped (loaders, ownership checks);
  // admin = service-role (pipeline + webhook run with no user session).
  getServerClient(): Promise<SupabaseClient>;
  getAdminClient(): SupabaseClient;

  // The signed-in user, or null. Used for ownership + the upload author.
  getCurrentUser(): Promise<{ id: string; email: string | null } | null>;

  // OPTIONAL — directory integration for name → member matching.
  members?: {
    listAssignable(): Promise<AssignableMember[]>;
  };

  // OPTIONAL — mirror a finished recording onto a host work-item (e.g. post the
  // summary as a comment on a linked task). Best-effort; throwing is swallowed.
  onRecordingReady?(ctx: ReadyRecordingContext): Promise<void>;
}
