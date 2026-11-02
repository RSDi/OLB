// A play can be from more than one coach (Cory and Mike draw the high school
// plays together). They're kept in team_plays.coach_name as the words shown
// on the play: "Cory Eikmeier", "Cory Eikmeier and Mike Jones",
// "A, B and C". Plain module, tested in tests/unit/team-playbook.test.ts.

export function splitCoaches(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinCoaches(names: string[]): string {
  const list = names.map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
