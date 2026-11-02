// Turns AssemblyAI's word timings into caption lines, and lines into the text
// the video reader is given. Plain module, tested in
// tests/unit/team-playbook-diagram.test.ts.

import type { TranscriptLine } from "./types.ts";

export interface AaiWord {
  text: string;
  start: number; // milliseconds
  end: number;
}

// A line ends at a sentence end, a long pause, or about 14 words.
export function wordsToLines(words: AaiWord[], maxWords = 14, pauseMs = 900): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let cur: AaiWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({
      text: cur.map((w) => w.text).join(" "),
      start: Math.round(cur[0].start / 100) / 10,
      end: Math.round(cur[cur.length - 1].end / 100) / 10,
    });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && w.start - prev.end > pauseMs) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= maxWords) flush();
  });
  flush();
  return lines;
}

export function linesForPrompt(lines: TranscriptLine[]): string {
  return lines.map((l) => `[${l.start.toFixed(1)}–${l.end.toFixed(1)}s] ${l.text}`).join("\n");
}
