// Shared types for the Omaha Lightning Basketball module.
// NOTE: this is a plain module — NOT "use server". Exporting types from a
// "use server" file crashes this Next.js build, so all OLB types live here.

export type OlbTeam = {
  id: string;
  board_id: string;
  name: string;
  age_group: string | null;
  color: string | null;
  grade_label: string | null;
  division: string | null;
  practice_times: string[];
  practice_location?: string | null;
  target_size: number | null;
  min_size: number | null;
  max_size: number | null;
  sort_order: number;
};

export type OlbPlayer = {
  id: string;
  board_id: string;
  team_id: string | null; // null = Unassigned pool
  full_name: string;
  dob: string | null; // ISO date (YYYY-MM-DD)
  grade: string | null;
  sort_order: number;
  import_flag: string | null;
  age_group: string | null; // from the registration spreadsheet (10U, 12U, …)
  jersey_number: string | null;
};

export type OlbCoach = {
  id: string;
  board_id: string;
  team_id: string | null;
  name: string;
  role: string | null;
  sort_order: number;
};

export type OlbVolunteerRole = {
  id: string;
  name: string;
  description: string | null;
  spots_per_team: number;
  is_leadership: boolean;
  show_in_directory: boolean;
  registration_interest: string | null;
  sort_order: number;
};

// A member in a role on a team, with the member's contact details.
export type OlbTeamVolunteer = {
  id: string;
  team_id: string;
  role_id: string;
  member: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
};

export type OlbBoardData = {
  board: { id: string; season: string; name: string };
  teams: OlbTeam[];
  players: OlbPlayer[];
  coaches: OlbCoach[];
};

// ── Parser output (from lib/teams/parse-roster.ts) ──────────────────────
export type ParsedPlayer = {
  full_name: string;
  dob: string | null;
  grade: string | null;
  sheet_age: number | null;
  flag: string | null; // 'dob_check' when DOB is missing/implausible
};

export type ParsedTeam = {
  name: string;
  age_group: string | null;
  color: string | null;
  grade_label: string | null;
  division: string | null;
  practice_times: string[];
  coaches: string[];
  players: ParsedPlayer[];
  raw_header: string;
  needs_name: boolean; // true for the unlabeled right-column team
};

export type ParseResult = {
  teams: ParsedTeam[];
  totalPlayers: number;
  flags: string[]; // human-readable warnings to surface in the preview
};

// ── Settings → Teams / Volunteer Roles inputs (lib/teams/volunteer-actions.ts) ──
export type TeamSettingsInput = {
  name: string;
  age_group: string | null;
  color: string | null;
  division: string | null;
  practice_times: string[];
  practice_location: string | null;
};

export type VolunteerRoleInput = {
  name: string;
  description: string | null;
  spots_per_team: number;
  is_leadership: boolean;
  show_in_directory: boolean;
  registration_interest: string | null;
};

export type VolunteerActionResult = { error?: string };
