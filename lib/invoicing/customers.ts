// Host programs for a hosted weekend, as opaque invoicing customers.

import { createAdminClient } from "../supabase/admin";
import type { EventCustomer } from "invoicing";
import { groupHostedCustomers } from "./group-customers";
import { rowsOrThrow } from "./query";

export { groupHostedCustomers } from "./group-customers";

/** Programs to bill: name, contact emails, team count. Admin client is used
 *  only for these columns — not the rest of the hosted page (N1). */
export async function hostedEventCustomers(weekendId: string): Promise<EventCustomer[]> {
  const db = createAdminClient();
  const [opps, teams, divisions] = await Promise.all([
    db.from("hs_opponents").select("id, contact_id, name, status").eq("weekend_id", weekendId),
    db.from("hs_hosted_teams").select("id, opponent_id, ours, name, division_id").eq("weekend_id", weekendId),
    db.from("hs_hosted_divisions").select("id, name, code").eq("weekend_id", weekendId),
  ]);
  const opponents = rowsOrThrow(opps as { data: { id: string; contact_id: string | null; name: string; status: string }[] | null; error: { message?: string } | null });
  const hosted = rowsOrThrow(teams as { data: { id: string; opponent_id: string | null; ours: boolean; name: string; division_id: string | null }[] | null; error: { message?: string } | null });
  const divRows = rowsOrThrow(divisions as { data: { id: string; name: string; code: string | null }[] | null; error: { message?: string } | null });

  const contactIds = [...new Set(opponents.map((o) => o.contact_id).filter((x): x is string => !!x))];
  let contacts: { id: string; name: string; email: string | null; alt_email: string | null }[] = [];
  let people: { parent_contact_id: string; email: string | null }[] = [];
  if (contactIds.length) {
    const [cs, peeps] = await Promise.all([
      db.from("contacts").select("id, name, email, alt_email").in("id", contactIds),
      db.from("contacts").select("parent_contact_id, email").eq("kind", "person").in("parent_contact_id", contactIds).is("deleted_at", null),
    ]);
    contacts = rowsOrThrow(cs as { data: typeof contacts | null; error: { message?: string } | null });
    people = rowsOrThrow(peeps as { data: typeof people | null; error: { message?: string } | null });
  }

  return groupHostedCustomers({ opponents, teams: hosted, divisions: divRows, contacts, people });
}
