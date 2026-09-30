// Server-action gate for the HS Schedule: a coach or the board (RLS allows
// the same people, 0108), plus the staged rollout (see ./access.ts).

import { getAuthUser } from "../auth/viewer";
import { seesFullUi } from "../auth/feature-preview";
import { createClient } from "../supabase/server";

export async function requireHsPlanner(): Promise<{ error: string } | { userId: string }> {
  const user = await getAuthUser();
  if (!user) return { error: "You must be signed in." };
  if (!seesFullUi(user.email)) return { error: "The HS Schedule isn't available on your account yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_plan_hs_schedule");
  if (error) return { error: "The HS Schedule isn't set up in the database yet (migration 0108)." };
  if (data !== true) return { error: "Only coaches and the board can change the HS Schedule." };
  return { userId: user.id };
}
