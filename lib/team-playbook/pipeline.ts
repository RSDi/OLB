// Server-only: moves an uploaded play video along
//   transcribing → reading → draft (or failed)
// AssemblyAI writes down what the coach says; Claude then reads the stills the
// browser took from the video, with the transcript, and draws the play.
//
// advancePlay() is safe to call any number of times: the page calls it while
// someone is watching a play being read, and the AssemblyAI webhook
// (/api/team-playbook/transcribed) calls it when the transcript is ready.
// Each move to the next status is a conditional update, so two callers never
// read the same video twice.

import { generateObject } from "ai";
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";
import { COURT_SPOTS, normalizeDiagram } from "./diagram.ts";
import { linesForPrompt, wordsToLines, type AaiWord } from "./transcript.ts";
import { CATEGORIES, PLAYBOOK_BUCKET, type PlayStatus, type TranscriptLine } from "./types.ts";

const MODEL = "anthropic/claude-sonnet-5.5";
export const WEBHOOK_SECRET_HEADER = "x-olb-webhook-secret";

// A read that hasn't finished in this long died with its function; try again.
const STUCK_READING_MS = 6 * 60 * 1000;

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

interface PlayRow {
  id: string;
  status: PlayStatus;
  name: string;
  call_name: string;
  category: string;
  video_path: string | null;
  frame_paths: { path: string; sec: number }[] | null;
  duration_sec: number | null;
  assemblyai_id: string | null;
  transcript: TranscriptLine[] | null;
  updated_at: string;
}

const ROW_COLS =
  "id, status, name, call_name, category, video_path, frame_paths, duration_sec, assemblyai_id, transcript, updated_at";

async function setStatus(id: string, from: PlayStatus, patch: Record<string, unknown>): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_plays")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  return !!data?.length;
}

async function fail(id: string, from: PlayStatus, message: string) {
  await setStatus(id, from, { status: "failed", error: message.slice(0, 500) });
}

// Hands the uploaded video to AssemblyAI (it reads the file straight from a
// signed link; the bytes never pass through the app). Without an AssemblyAI
// key the play goes straight to reading, from the stills alone.
export async function startTranscription(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("team_plays").select(ROW_COLS).eq("id", id).maybeSingle();
  const row = data as PlayRow | null;
  if (!row || row.status !== "transcribing") return;
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key || !row.video_path) {
    if (await setStatus(id, "transcribing", { status: "reading" })) await readPlay(id);
    return;
  }
  try {
    const { data: signed, error } = await admin.storage
      .from(PLAYBOOK_BUCKET)
      .createSignedUrl(row.video_path, 24 * 60 * 60);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Couldn't make a link to the video.");
    const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
    const res = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        speech_models: ["universal-3-pro"],
        webhook_url: `${baseUrl()}/api/team-playbook/transcribed`,
        ...(secret ? { webhook_auth_header_name: WEBHOOK_SECRET_HEADER, webhook_auth_header_value: secret } : {}),
      }),
    });
    const body = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !body.id) throw new Error(body.error || `AssemblyAI HTTP ${res.status}`);
    await admin.from("team_plays").update({ assemblyai_id: body.id }).eq("id", id);
  } catch (err) {
    await fail(id, "transcribing", `Couldn't start writing down the coach's words: ${err instanceof Error ? err.message : err}`);
  }
}

export async function advancePlay(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("team_plays").select(ROW_COLS).eq("id", id).maybeSingle();
  const row = data as PlayRow | null;
  if (!row) return;

  if (row.status === "transcribing") {
    const key = process.env.ASSEMBLYAI_API_KEY;
    if (!row.assemblyai_id || !key) {
      if (!row.assemblyai_id && Date.now() - Date.parse(row.updated_at) > 60_000) await startTranscription(id);
      return;
    }
    const res = await fetch(`https://api.assemblyai.com/v2/transcript/${row.assemblyai_id}`, {
      headers: { authorization: key },
    });
    if (!res.ok) return; // try again next time
    const t = (await res.json()) as { status: string; error?: string; words?: AaiWord[] };
    if (t.status === "error") {
      // No words isn't fatal: the stills still show the play.
      if (await setStatus(id, "transcribing", { status: "reading", transcript: [], error: null })) await readPlay(id);
      return;
    }
    if (t.status !== "completed") return;
    const lines = wordsToLines(t.words ?? []);
    if (await setStatus(id, "transcribing", { status: "reading", transcript: lines })) await readPlay(id);
    return;
  }

  if (row.status === "reading" && Date.now() - Date.parse(row.updated_at) > STUCK_READING_MS) {
    if (await setStatus(id, "reading", { status: "reading" })) await readPlay(id);
  }
}

const PointSchema = z.object({ x: z.number(), y: z.number() });
const ReadSchema = z.object({
  name: z.string().describe("The play's name as the coach says it, or a short descriptive name."),
  call: z.string().describe("What the coach calls out to run it, if they say one; otherwise empty."),
  category: z.enum(CATEGORIES),
  players: z
    .array(z.object({ id: z.string().describe('"1" to "5"'), x: z.number(), y: z.number() }))
    .describe("Where each offensive player starts."),
  ball: z.string().describe("Who has the ball at the start (the inbounder on an inbounds play)."),
  steps: z.array(
    z.object({
      title: z.string().describe("2–5 words."),
      note: z.string().describe("One or two plain sentences a 12-year-old would follow, in the coach's words where possible."),
      startSec: z.number().nullable().describe("When the coach starts explaining this step in the video, or null."),
      endSec: z.number().nullable(),
      actions: z.array(
        z.object({
          type: z.enum(["cut", "dribble", "screen", "pass"]),
          player: z.string().nullable().describe("Who moves (cut, dribble, screen)."),
          path: z
            .array(PointSchema)
            .nullable()
            .describe("Where they move to: one point for a straight move, or a bend point then the end point."),
          from: z.string().nullable().describe("Pass: who throws it."),
          to: z.string().nullable().describe("Pass: who catches it."),
          s: z.number().nullable().describe("0–1: when in the step this starts. Null for the start."),
          e: z.number().nullable().describe("0–1: when in the step this ends. Null for the end."),
        }),
      ),
    }),
  ),
});

function prompt(row: PlayRow, frames: { sec: number }[]): string {
  const spots = COURT_SPOTS.map((s) => `- ${s.name}: x ${s.x}, y ${s.y}`).join("\n");
  const transcript = row.transcript?.length ? linesForPrompt(row.transcript) : "(No words: the video has no talking, or it couldn't be written down.)";
  return `You are helping a youth basketball club turn a coach's video of a play into an animated diagram for its players.

The images are stills from the video, in order, at these times: ${frames.map((f) => `${f.sec.toFixed(1)}s`).join(", ")}. The video is usually a coach drawing on a whiteboard or clipboard while talking, sometimes players walking through it on a court.

Draw the play on this half court. Units are tenths of a foot. x runs 0 (left sideline) to 500 (right sideline) as you face the basket from half court. y runs 0 (the baseline under the basket) to 470 (half court); out of bounds under the basket is y -40 to 0. Landmarks:
${spots}

Rules:
- Use offensive players "1" to "5" and only the players in the play. Use the numbers the coach uses. If the drawing uses other marks (O's, letters), number them 1 (point guard) to 5 (center) by position.
- If the drawing has the basket at the bottom, or sideways, turn it so the basket is at the top.
- Break the play into the steps the coach explains, in order, 2 to 8 steps. Each step is what happens at about the same time.
- In each step, a player moves at most once. A move with a bend gets a bend point, then the end point.
- "screen": the screener moves to where they set the screen. The player using the screen gets a "cut" in the same step, with s around 0.4 so they wait for it.
- "pass": from the player with the ball to a teammate. Use s/e so a pass leaves after a cut is mostly done (for example s 0.6).
- startSec/endSec: the part of the transcript where the coach explains that step. Steps must be in order and not overlap. Use null for all of them if there are no words.
- Keep the coach's options (for example "if that's not open, swing it") as their own steps at the end.
- Don't add defense.
- If something is unclear, make the simplest reading and say so in that step's note ("Check this in the video: …").
${row.name ? `\nThe coach named it "${row.name}".` : ""}${row.call_name ? ` The call is "${row.call_name}".` : ""}
What the coach says, with times:
${transcript}`;
}

export async function readPlay(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("team_plays").select(ROW_COLS).eq("id", id).maybeSingle();
  const row = data as PlayRow | null;
  if (!row || row.status !== "reading") return;
  try {
    const frames = (row.frame_paths ?? []).slice(0, 12);
    const images: { type: "image"; image: Uint8Array; mediaType: string }[] = [];
    for (const f of frames) {
      const { data: blob } = await admin.storage.from(PLAYBOOK_BUCKET).download(f.path);
      if (blob) images.push({ type: "image", image: new Uint8Array(await blob.arrayBuffer()), mediaType: "image/jpeg" });
    }
    if (!images.length && !row.transcript?.length) {
      throw new Error("There were no stills or words to read the play from.");
    }
    const { object } = await generateObject({
      model: MODEL,
      schema: ReadSchema,
      messages: [{ role: "user", content: [...images, { type: "text", text: prompt(row, frames) }] }],
    });
    const diagram = normalizeDiagram({
      ...object,
      steps: object.steps.map((s) => ({
        ...s,
        actions: s.actions.map((a) => ({
          type: a.type,
          player: a.player,
          path: a.path ?? [],
          from: a.from,
          to: a.to,
          s: a.s,
          e: a.e,
        })),
      })),
    });
    if (!diagram) throw new Error("The video couldn't be turned into a play.");
    await setStatus(id, "reading", {
      status: "draft",
      error: null,
      diagram,
      name: row.name || object.name.slice(0, 80),
      call_name: row.call_name || object.call.slice(0, 40),
      category: row.category || object.category,
    });
  } catch (err) {
    await fail(id, "reading", `Couldn't read the play from the video: ${err instanceof Error ? err.message : err}`);
  }
}
