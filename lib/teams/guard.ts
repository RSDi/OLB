import { requireSuperAdmin } from "../auth/guards";

// Team manager is super-admin only. Unlike the portal's other actions these
// throw instead of returning { error }: the board applies each move
// optimistically and puts it back when the promise rejects.
export async function requireTeamManager(): Promise<string> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) throw new Error(gate.error);
  return gate.userId;
}
