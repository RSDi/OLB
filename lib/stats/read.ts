// Server-only: Claude reads a photo of our page of the scorebook.
// It writes down what it sees; lib/stats/marks.ts does the adding up and the
// checking, so a misread shows up as a flag instead of a wrong total.

import { generateObject } from "ai";
import { z } from "zod";

// Handwriting is the hard part: the strongest model reads, falling back to
// the next one if it's unavailable (same pair as Team Playbook).
const READ_MODEL = "anthropic/claude-opus-5.5";
const FALLBACK_MODEL = "anthropic/claude-sonnet-5.5";

const Box = z.string().describe('Every mark in this quarter box, in order, separated by spaces: "2 3 1 1". Empty string if the box is blank or only dashes.');

export const BookReadSchema = z.object({
  date: z.string().describe('The DATE box exactly as written, e.g. "14 Nov 26". Empty if blank.'),
  team: z.string().describe("The TEAM box as written."),
  scores: z
    .object({
      q1: z.number().nullable().describe("1ST Q SCORE box"),
      half: z.number().nullable().describe("1ST HALF SCORE box"),
      q3: z.number().nullable().describe("3RD Q SCORE box"),
      final: z.number().nullable().describe("FINAL SCORE box"),
    })
    .describe("The running-score boxes at the top right, as written. Null when blank or unreadable."),
  team_ft: z.string().describe('A circled or written team free-throw total, like "13/19". Empty if none.'),
  players: z
    .array(
      z.object({
        number: z.string().describe("The NO. column."),
        name: z.string().describe("The PLAYER column as written."),
        q1: Box,
        q2: Box,
        q3: Box,
        q4: Box,
        ot: Box.describe("The marks on the left of the OVERTIME box (not the player's total written at its right end)."),
        rebounds: z.number().describe("How many R marks are written under this player's quarter boxes, all quarters and overtime together."),
        fouls: z.number().describe("How many of P1–P5 are crossed out or slashed."),
        total: z.number().nullable().describe("The player's total points as written: in the TP column, or the number at the far right end of the OVERTIME box. Null if not written."),
        ft: z.string().describe('FTM/FTA as written in the FTA/FTM columns, like "3/6". Empty if none.'),
        unsure: z.string().describe("Any mark in this row you couldn't read for sure, and what it might be. Empty if none."),
      }),
    )
    .describe("Every row with a player name or number written in, top to bottom, even rows with no marks."),
});

export type BookRead = z.infer<typeof BookReadSchema>;

const PROMPT = `This is a photo of one page of a basketball scorebook, our team's page for one game. Write down exactly what is on it. Don't add anything up or correct anything: the app checks your reading against the book's own totals, so a faithful reading matters more than a tidy one.

How this book is laid out:
- Top left: TEAM, COACH, DATE, SCORER boxes.
- Top right: the RUNNING SCORE grid (numbers crossed off as points are scored), then boxes for the 1ST Q SCORE, 1ST HALF SCORE, 3RD Q SCORE and FINAL SCORE, written in by hand. These are running totals.
- One row per player: POS, QUARTERS PLAYED, PLAYER (often a first name only), NO. (jersey number), PERSONAL FOULS (P1–P5, then T1 T2 technicals; a foul is a P that's crossed out or slashed), then four quarter boxes (1ST QTR, 2ND QTR, 3RD QTR, 4TH QTR), an OVERTIME box, and the SCORING SUMMARY columns (2'S, 3'S, FTA, FTM, TP).
- Inside a quarter box the scorer writes every score in order, as single digits: 2 = a two-point basket, 3 = a three, 1 = a made free throw, 0 = a missed free throw. "2 0 1" is a basket, then a missed and a made free throw. Digits are often written close together ("2311"); read each digit as its own mark. The printed dashes ("_ _ _ _") are empty spaces, not marks.
- Under the marks, on the row's second line, R marks count rebounds (R, RR, RRR…). Count every R in the row.
- The player's total points are often written at the far right of the OVERTIME box, or in TP. Free throws are often written as "made/tries" in the FTA or FTM column.
- A circled fraction near the bottom of the FTA column is the team's free throws.

Read every quarter box of every player row that has a name or number. Some of the page may be in shadow; read what you can and say in "unsure" what you couldn't.`;

export async function readScorebook(image: Uint8Array): Promise<BookRead> {
  const run = async (model: string) =>
    (
      await generateObject({
        model,
        schema: BookReadSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image, mediaType: "image/jpeg" },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      })
    ).object;
  try {
    return await run(READ_MODEL);
  } catch (err) {
    console.warn("stats: read model failed, trying the fallback", err);
    return run(FALLBACK_MODEL);
  }
}
