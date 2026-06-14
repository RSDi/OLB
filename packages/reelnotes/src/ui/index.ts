// ReelNotes UI entry — the <ReelNotes /> client component (recorder, transcript,
// summary, action items). Mount it with initial data + host wiring (a browser
// Supabase URL/key, a soft-delete handler, and an optional create-project hook).

export { ReelNotes, ActionRow } from "./ReelNotes";
export type {
  CreateProjectInput,
  CreateProjectHandler,
  SoftDeleteHandler,
  ReelNoteSourceLink,
} from "./ReelNotes";
