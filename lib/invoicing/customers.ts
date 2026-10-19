// Host programs for a hosted weekend, as opaque invoicing customers.

import { createAdminClient } from "../supabase/admin";
import type { EventCustomer } from "invoicing";
import { groupHostedCustomers } from "./group-customers";

export { groupHostedCustomers } from "./group-customers";

/** Programs to bill: name, contact emails, team count. Admin client is used
 *  only for these columns — not the rest of the hosted page (N1). */
export async function hostedEventCustomers(weekendId: string): Promise<EventCustomer[]> {
  const db = createAdminClient();
  const [{ data: opps }, { data: teams }, { data: divisions }] = await Promise.all([
    db.from("hs_opponents").select("id, contact_id, name, status").eq("weekend_id", weekendId),
    db.from("hs_hosted_teams").select("id, opponent_id, ours, name, division_id").eq("weekend_id", weekendId),
    db.from("hs_hosted_divisions").select("id, name, code").eq("weekend_id", weekendId),
  ]);
  const opponents = (opps as { id: string; contact_id: string | null; name: string; status: string }[] | null) ?? [];
  const hosted = (teams as { id: string; opponent_id: string | null; ours: boolean; name: string; division_id: string | null }[] | null) ?? [];
  const divRows = (divisions as { id: string; name: string; code: string | null }[] | null) ?? [];

  const contactIds = [...new Set(opponents.map((o) => o.contact_id).filter((x): x is string => !!x))];
  let contacts: { id: string; name: string; email: string | null; alt_email: string | null }[] = [];
  let people: { parent_contact_id: string; email: string | null }[] = [];
  if (contactIds.length) {
    const [{ data: cs }, { data: peeps }] = await Promise.all([
      db.from("contacts").select("id, name, email, alt_email").in("id", contactIds),
      db.from("contacts").select("parent_contact_id, email").eq("kind", "person").in("parent_contact_id", contactIds).is("deleted_at", null),
    ]);
    contacts = (cs as typeof contacts | null) ?? [];
    people = (peeps as typeof people | null) ?? [];
  }

  return groupHostedCustomers({ opponents, teams: hosted, divisions: divRows, contacts, people });
}
