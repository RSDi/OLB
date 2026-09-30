// Server-action gate for Planning: board access, plus the staged rollout
// (see ./access.ts). RLS limits every planning table to the board; this also
// keeps the rest of the board out until Planning is released.

import { requireStaff } from "../auth/guards";
import { getAuthUser } from "../auth/viewer";
import { seesFullUi } from "../auth/feature-preview";

export async function requirePlanner(): Promise<{ error: string } | { userId: string }> {
  const gate = await requireStaff();
  if ("error" in gate) return gate;
  const user = await getAuthUser();
  if (!seesFullUi(user?.email)) return { error: "Planning isn't available on your account yet." };
  return gate;
}
