// How the public Directory splits a team's jobs into coaches and volunteers.
// Plain data, no database: the loader in public-directory.ts fills it, and
// the page groups it. Coaching roles stay in the open list. Every other
// role — Scorekeeper, Clock, Photographer, and any role added later in
// Settings → Volunteer Roles — is a volunteer spot. An empty one is an
// "Open Spot". The registration form does not read this.

export const OPEN_SPOT_LABEL = "Open Spot";

export interface PublicRole {
  id: string;
  name: string;
  spots: number;
  // Leadership, or a role whose name says coach: shown open, above volunteers.
  coach: boolean;
}

export interface PublicAssignment {
  id: string;
  team_id: string;
  role_id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

// One seat on a team. `name` is null when nobody has it yet.
export interface PublicSpot {
  key: string;
  roleId: string;
  role: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

// Head coach and Assistant coach are leadership. A future role counts as a
// coach when it's marked Leadership, or when its name says coach, so it stays
// in the open list instead of the collapsed Volunteers section.
export function isDirectoryCoach(role: { name: string; is_leadership?: boolean }): boolean {
  return !!role.is_leadership || /coach/i.test(role.name);
}

// Seats for one team, in role order. Coaches list only people who are in the
// job. Volunteers list every seat, with Open Spot for the ones still empty.
// Extra people beyond the seat count still show; they don't add open seats.
export function spotsForTeam(
  roles: PublicRole[],
  assignments: PublicAssignment[],
  teamId: string,
  kind: "coach" | "volunteer"
): PublicSpot[] {
  const wantCoach = kind === "coach";
  const out: PublicSpot[] = [];
  for (const role of roles) {
    if (role.coach !== wantCoach) continue;
    const filled = assignments
      .filter((a) => a.team_id === teamId && a.role_id === role.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const a of filled) {
      out.push({
        key: a.id,
        roleId: role.id,
        role: role.name,
        name: a.name,
        phone: a.phone,
        email: a.email,
      });
    }
    if (!wantCoach) {
      const open = Math.max(0, role.spots - filled.length);
      for (let i = 0; i < open; i++) {
        out.push({
          key: `${role.id}:open:${i}`,
          roleId: role.id,
          role: role.name,
          name: null,
          phone: null,
          email: null,
        });
      }
    }
  }
  return out;
}

export function assignedCount(spots: PublicSpot[]): number {
  return spots.filter((s) => s.name).length;
}

// The line on the collapsed Volunteers control: who has a seat, then how
// many are still open. A long list keeps the first two names.
export function volunteerSummary(spots: PublicSpot[]): string {
  const names = spots.flatMap((s) => (s.name ? [s.name] : []));
  const open = spots.length - names.length;
  if (spots.length === 0) return "";
  const openText = open === 0 ? null : open === 1 ? "1 open" : `${open} open`;
  if (names.length === 0) return open === 1 ? "1 open spot" : `${open} open spots`;
  const shown = names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return openText ? `${shown} · ${openText}` : shown;
}

export function staffCountLabel(coaches: number, volunteers: number): string {
  const c = `${coaches} ${coaches === 1 ? "coach" : "coaches"}`;
  const v = `${volunteers} ${volunteers === 1 ? "volunteer" : "volunteers"}`;
  return `${c} · ${v}`;
}

// Any of the words, or at least 3 digits of a phone number. `q` is already
// trimmed; matching is case-insensitive.
export function directorySearch(
  q: string,
  words: (string | null | undefined)[],
  phones: (string | null | undefined)[]
): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  if (words.filter(Boolean).join(" ").toLowerCase().includes(query)) return true;
  const digits = query.replace(/\D/g, "");
  return digits.length >= 3 && phones.some((ph) => ph?.replace(/\D/g, "").includes(digits));
}

export function spotMatches(q: string, spot: PublicSpot): boolean {
  return directorySearch(q, [spot.role, spot.name, spot.email], [spot.phone]);
}
