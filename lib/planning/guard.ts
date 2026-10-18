// Server-action gate for Planning: the board. RLS limits every planning
// table to the board as well.

import { requireStaff } from "../auth/guards";

export async function requirePlanner(): Promise<{ error: string } | { userId: string }> {
  return requireStaff();
}
