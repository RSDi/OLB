// Shared constants for teams and their volunteers. Plain module (no
// "use server"), safe for client and server.

// The volunteer options on the public registration form. A parent's answers
// are saved to members.volunteer_interests joined with ", ". A volunteer role
// can point at one of these (registration_interest) so the people who picked
// it are suggested first when filling that role.
export const VOLUNTEER_OPTIONS = [
  "Coach/ Assistant Coach",
  "Team Parent (1 per Team)",
  "Team Scorekeeper/ Clock (1 or 2 per team)",
  "Game Videography (1 per team)",
  "Game Photography/ End of Season Slideshow (1 per team)",
  "Social Media Manager",
  "Fundraising",
  "Admissions/ Concessions",
  "Board Member",
];

export const AGE_GROUPS = ["10U", "12U", "14U", "16U", "18U"];

// Team colors as stored on olb_teams.color (the roster sheet's names).
export const TEAM_COLORS: { key: string; label: string; hex: string }[] = [
  { key: "GOLD", label: "Gold", hex: "#FFD100" },
  { key: "BLACK", label: "Black", hex: "#121214" },
  { key: "RED", label: "Red", hex: "#D64545" },
  { key: "BLUE", label: "Blue", hex: "#2F6FD6" },
  { key: "WHITE", label: "White", hex: "#FFFFFF" },
  { key: "GREY", label: "Grey", hex: "#9A9A95" },
];

export function teamColorHex(color: string | null | undefined): string {
  const c = TEAM_COLORS.find((t) => t.key === color?.toUpperCase());
  return c?.hex ?? "#D9D9D4";
}

// "12U Gold". Imported team names sometimes carry the age already.
export function teamLabel(t: { name: string; age_group: string | null }): string {
  if (!t.age_group || t.name.toUpperCase().includes(t.age_group.toUpperCase())) return t.name;
  return `${t.age_group} ${t.name}`;
}

// Whether a member's registration answers cover this role.
export function wantsRole(
  interests: string | null | undefined,
  role: { name: string; registration_interest: string | null }
): boolean {
  if (!interests) return false;
  const hay = interests.toLowerCase();
  if (role.registration_interest && hay.includes(role.registration_interest.toLowerCase())) return true;
  return hay.includes(role.name.toLowerCase());
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

// Each role's spots on a team, in role order: the people in it, then an open
// spot for each one still unfilled.
export function roleSpots<
  R extends { id: string; spots_per_team: number },
  V extends { role_id: string }
>(roles: R[], volunteers: V[]): { role: R; volunteer: V | null }[] {
  return roles.flatMap((role) => {
    const filled = volunteers.filter((v) => v.role_id === role.id);
    const open = Math.max(0, role.spots_per_team - filled.length);
    return [
      ...filled.map((v) => ({ role, volunteer: v })),
      ...Array.from({ length: open }, () => ({ role, volunteer: null })),
    ];
  });
}
