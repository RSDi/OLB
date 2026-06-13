// Server-only entry ("reelnotes/server"). Kept separate from the main barrel so
// server dependencies (the AI gateway, Resend) never get pulled into a client
// bundle that only needs types from "reelnotes".

export { processTranscriptionCompleted } from "./pipeline";
