-- 0054_reel_notes_anchor.sql
--
-- B4: ReelNotes timestamp-anchoring. Each action item can carry the moment in
-- the recording where it was raised, so the UI shows a "Jump to M:SS" button
-- that seeks the audio player.
--
--   daves_idea_action_items.anchor_quote
--     — the VERBATIM transcript span the LLM copied as the source of this
--       item. Stored for traceability/debugging; the LLM never emits a number.
--
--   daves_idea_action_items.transcript_ms
--     — the resolved start offset (milliseconds, matching AssemblyAI utterance
--       units) of the utterance that contains anchor_quote. Computed in the
--       pipeline by deterministic substring/token matching against the
--       persisted recordings.utterances. NULL whenever no confident match
--       exists (no quote, no utterances, or low-confidence) — the UI then
--       simply shows no jump button. Nullable, no default, so existing rows
--       are unaffected until re-extracted.
--
-- Idempotent; safe to re-run.

begin;

alter table public.daves_idea_action_items
  add column if not exists anchor_quote text,
  add column if not exists transcript_ms bigint;

commit;
