// B4 anchor resolution: quote -> utterance.start (ms). Pure, dependency-free
// so it's unit-testable in isolation (the pipeline module pulls in the AI SDK
// + Resend, which the bare test runner can't load). Mirrors the threshold
// helpers extracted in A10.
//
// The LLM emits a verbatim anchor quote; this turns that quote into a real
// utterance boundary in deterministic code. No number ever comes from the
// model. Three tiers, conservative throughout — null is the safe failure
// (the UI just shows no jump button); a wrong seek is more jarring than none.

const ANCHOR_STOPWORDS = new Set([
  "the", "a", "an", "and", "to", "of", "we", "i", "it", "that", "this", "is",
  "in", "on", "for", "so", "uh", "um",
]);

// Shared normalizer — MUST be identical for quote and utterance text or the
// exact-substring pass silently falls through to the fuzzy tiers. AssemblyAI
// emits smart punctuation, so fold curly quotes/dashes to ASCII.
export function normalizeAnchorText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'") // curly/prime apostrophes -> '
    .replace(/[“”″]/g, '"') // curly quotes -> "
    .replace(/[‒–—―]/g, "-") // en/em/fig dashes -> -
    .replace(/[^\p{L}\p{N}\s']/gu, " ") // strip punctuation except apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(normalized: string): string[] {
  return normalized.split(" ").filter(t => t.length > 0 && !ANCHOR_STOPWORDS.has(t));
}

export interface AnchorUtterance {
  text: string;
  start: number;
}

// Returns the resolved start ms for `quote`, or null if no tier clears its bar.
export function resolveAnchorMs(
  quote: string | null,
  utterances: AnchorUtterance[],
): number | null {
  if (!quote || utterances.length === 0) return null;
  const q = normalizeAnchorText(quote);
  if (!q) return null;

  // Precompute per-utterance normalized text + a concatenated transcript with a
  // per-character map back to the owning utterance index.
  const normUtts = utterances.map(u => normalizeAnchorText(u.text));
  let concat = "";
  const charToUtt: number[] = [];
  for (let i = 0; i < normUtts.length; i++) {
    if (i > 0) {
      concat += " ";
      charToUtt.push(i); // the joiner space belongs to the upcoming utterance
    }
    for (let c = 0; c < normUtts[i].length; c++) charToUtt.push(i);
    concat += normUtts[i];
  }

  // TIER 1 — exact substring across the whole transcript (handles quotes that
  // span a speaker boundary). Earliest occurrence wins.
  const at = concat.indexOf(q);
  if (at >= 0) return utterances[charToUtt[at]].start;

  // TIER 2 — reverse-contains: an utterance's normalized text is a substring of
  // the (too-long) quote. Earliest such utterance.
  for (let i = 0; i < normUtts.length; i++) {
    if (normUtts[i].length > 0 && q.includes(normUtts[i])) return utterances[i].start;
  }

  // TIER 3 — conservative token overlap (Jaccard) with an absolute floor.
  const qTokens = new Set(contentTokens(q));
  if (qTokens.size >= 3) {
    let best = -1;
    let bestScore = 0;
    let secondScore = 0;
    for (let i = 0; i < normUtts.length; i++) {
      const uTokens = new Set(contentTokens(normUtts[i]));
      if (uTokens.size === 0) continue;
      let inter = 0;
      for (const t of qTokens) if (uTokens.has(t)) inter++;
      const score = inter / (qTokens.size + uTokens.size - inter); // Jaccard
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = i;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
    // Epsilon guards IEEE-754 rounding: an exact 0.6 score or 0.2 gap formed
    // from fractions (e.g. 3/5 − 2/5) lands a hair under its literal, which
    // would otherwise reject a legitimately-confident match.
    const EPS = 1e-9;
    if (best >= 0 && bestScore >= 0.6 - EPS && bestScore - secondScore >= 0.2 - EPS) {
      return utterances[best].start;
    }
  }

  return null; // safe failure -> no jump button
}
