// Line-by-line "what changed" between two versions of a meeting's agenda or
// minutes, for the meeting's History page. A plain longest-common-subsequence
// diff: minutes are short, so there's no need for anything cleverer. Pure;
// tested in tests/unit/planning-merge.test.ts.

export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

const MAX_LINES = 1500;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    // Too long to line up: show it as replaced.
    return [...a.map((text) => ({ kind: "removed" as const, text })), ...b.map((text) => ({ kind: "added" as const, text }))];
  }
  // lcs[i][j] = length of the common run of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i++] });
    } else {
      out.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}

// Only the changed lines and a line of context around each, so a long set of
// minutes shows just what moved. `null` marks lines left out.
export function diffContext(lines: DiffLine[], context = 1): (DiffLine | null)[] {
  const keep = lines.map((l) => l.kind !== "same");
  const show = lines.map((_, i) => {
    for (let d = -context; d <= context; d++) if (keep[i + d]) return true;
    return false;
  });
  const out: (DiffLine | null)[] = [];
  lines.forEach((l, i) => {
    if (show[i]) out.push(l);
    else if (out[out.length - 1] !== null) out.push(null);
  });
  if (out[0] === null) out.shift();
  if (out[out.length - 1] === null) out.pop();
  return out;
}
