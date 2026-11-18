// Settings → Film team list: status per team, age-group sections, and the
// All / Live / Needs setup filter plus name search.

export type FilmTeamStatus = "live" | "off" | "no-code";
export type FilmTeamFilter = "all" | "live" | "setup";

type ListTeam = { label: string; ageGroup: string | null; enabled: boolean; hasCode: boolean };

export function filmTeamStatus(t: { enabled: boolean; hasCode: boolean }): FilmTeamStatus {
  if (!t.hasCode) return "no-code";
  return t.enabled ? "live" : "off";
}

export function ageGroupHeading(ageGroup: string | null): string {
  const g = ageGroup?.trim() || "";
  if (!g) return "Other teams";
  if (g.toUpperCase() === "HS") return "High school";
  return g;
}

export function filterFilmTeams<T extends ListTeam>(teams: T[], filter: FilmTeamFilter, query: string): T[] {
  const q = query.trim().toLowerCase();
  return teams.filter((t) => {
    const status = filmTeamStatus(t);
    if (filter === "live" && status !== "live") return false;
    if (filter === "setup" && status === "live") return false;
    return !q || t.label.toLowerCase().includes(q);
  });
}

// Sections in the order teams already come in (Directory sort order).
export function groupFilmTeams<T extends ListTeam>(teams: T[]): { heading: string; teams: T[] }[] {
  const out: { heading: string; teams: T[] }[] = [];
  for (const t of teams) {
    const heading = ageGroupHeading(t.ageGroup);
    const section = out.find((s) => s.heading === heading);
    if (section) section.teams.push(t);
    else out.push({ heading, teams: [t] });
  }
  return out;
}
