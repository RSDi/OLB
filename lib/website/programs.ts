// How each program shows on the public Programs page: the name without
// "(Waitlisted)", a status pill, and whether the row is muted. Status is
// decided from the name so a leftover Website title still matches Rachel's
// mockup without editing site_content.

export type ProgramTone = "open" | "closed";

export type ProgramPresentation = {
  title: string;
  pill?: { label: string; tone: ProgramTone };
  muted?: boolean;
};

export function programPresentation(title: string): ProgramPresentation {
  const name = title.replace(/\s*\(\s*Waitlisted\s*\)\s*/gi, "").replace(/\s+/g, " ").trim();
  if (/^14U\b/i.test(name)) {
    return { title: name, pill: { label: "Assessments open · 2 spots", tone: "open" } };
  }
  if (/^(8U|16U)\b/i.test(name)) {
    return { title: name, pill: { label: "Closed for 2026-27", tone: "closed" }, muted: true };
  }
  return { title: name };
}

// Title + body as Settings → Website stores them. The Programs accordion
// and the assessment "Practice times and payment info" pop-up both read
// this so they cannot drift.
export type ProgramCopy = {
  title: string;
  body: string;
};

export function programCopyFromList(
  items: { text: (field: string) => string }[],
  match: RegExp = /^14U\b/i,
): ProgramCopy | null {
  for (const item of items) {
    const shown = programPresentation(item.text("title"));
    if (match.test(shown.title)) {
      return { title: shown.title, body: item.text("body") };
    }
  }
  return null;
}
