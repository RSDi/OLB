// Player requirements: who a requirement applies to, where each player
// stands, and the clean-up the Settings form and the server actions share.
// Pure and safe to import from client components.

import {
  REQUIREMENT_NAME_MAX,
  type PlayerRequirement,
  type Requirement,
  type RequirementKind,
} from "./types.ts"; // explicit extension so node --test can load this file

export type RequirementState = "done" | "waived" | "missing" | "n/a";

// A requirement with no teams picked covers every player; otherwise only the
// players on those teams (a player with no team isn't covered).
export function appliesTo(req: Pick<Requirement, "team_ids">, player: { team_id: string | null }): boolean {
  if (!req.team_ids || req.team_ids.length === 0) return true;
  return player.team_id != null && req.team_ids.includes(player.team_id);
}

// Rows keyed "<player>:<requirement>" for quick lookups.
export function rowKey(playerId: string, requirementId: string): string {
  return `${playerId}:${requirementId}`;
}

export function indexRows(rows: PlayerRequirement[]): Map<string, PlayerRequirement> {
  return new Map(rows.map((r) => [rowKey(r.player_id, r.requirement_id), r]));
}

export function stateFor(
  player: { id: string; team_id: string | null },
  req: Pick<Requirement, "id" | "team_ids">,
  rows: Map<string, PlayerRequirement>
): RequirementState {
  if (!appliesTo(req, player)) return "n/a";
  return rows.get(rowKey(player.id, req.id))?.status ?? "missing";
}

// "$25", "25.5", "1,200" → cents. Null when it isn't an amount.
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function formatAmount(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// What a player chip says: "Handbook signature" or "Tournament fee $25.00".
export function requirementLabel(req: Pick<Requirement, "name" | "kind" | "amount_cents">): string {
  return req.kind === "fee" && req.amount_cents != null ? `${req.name} ${formatAmount(req.amount_cents)}` : req.name;
}

// "Done" for a task, "Paid" for a fee.
export function doneWord(kind: RequirementKind): string {
  return kind === "fee" ? "Paid" : "Done";
}

export interface RequirementInput {
  name: string;
  description: string;
  kind: RequirementKind;
  amount: string;
  allowFile: boolean;
  dueOn: string;
  teamIds: string[] | null;
  active: boolean;
}

export interface CleanRequirement {
  name: string;
  description: string | null;
  kind: RequirementKind;
  amount_cents: number | null;
  allow_file: boolean;
  due_on: string | null;
  team_ids: string[] | null;
  active: boolean;
}

export function cleanRequirementInput(input: RequirementInput): { error: string } | CleanRequirement {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  if (name.length > REQUIREMENT_NAME_MAX) {
    return { error: `Keep the name to ${REQUIREMENT_NAME_MAX} characters or fewer.` };
  }
  if (input.kind !== "task" && input.kind !== "fee") return { error: "Pick a type." };

  let amount: number | null = null;
  if (input.kind === "fee") {
    amount = parseAmount(input.amount);
    if (amount == null) return { error: "Enter the fee amount, like 25 or $25.00." };
  }

  const dueOn = input.dueOn.trim();
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { error: "Enter a valid due date." };

  const teamIds = input.teamIds && input.teamIds.length > 0 ? [...new Set(input.teamIds)] : null;
  if (input.teamIds && input.teamIds.length === 0) {
    return { error: "Pick at least one team, or choose All players." };
  }

  return {
    name,
    description: input.description.trim() || null,
    kind: input.kind,
    amount_cents: amount,
    allow_file: input.allowFile,
    due_on: dueOn || null,
    team_ids: teamIds,
    active: input.active,
  };
}
