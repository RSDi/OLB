// Player requirements (migration 0098): the shapes shared by Settings →
// Requirements, the Directory and the server actions. A plain module on
// purpose — exporting types from a "use server" file breaks the build.

export type RequirementKind = "task" | "fee";

export interface Requirement {
  id: string;
  name: string;
  description: string | null;
  kind: RequirementKind;
  amount_cents: number | null;
  allow_file: boolean;
  due_on: string | null;
  team_ids: string[] | null;
  active: boolean;
  sort_order: number;
}

export type PlayerRequirementStatus = "done" | "waived";

// One player's record for one requirement. No row = still missing.
export interface PlayerRequirement {
  player_id: string;
  requirement_id: string;
  status: PlayerRequirementStatus;
  completed_on: string;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  marked_by: string | null;
  updated_at: string;
  // Filled in by the Directory loader from members.user_id = marked_by.
  marked_by_name?: string | null;
}

export const REQUIREMENT_COLUMNS =
  "id, name, description, kind, amount_cents, allow_file, due_on, team_ids, active, sort_order";

export const PLAYER_REQUIREMENT_COLUMNS =
  "player_id, requirement_id, status, completed_on, note, file_path, file_name, marked_by, updated_at";

export const REQUIREMENT_FILES_BUCKET = "player-requirement-files";

export const REQUIREMENT_NAME_MAX = 60;
