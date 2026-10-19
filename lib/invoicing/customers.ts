// Host programs for a hosted weekend, as opaque invoicing customers.

import { createAdminClient } from "../supabase/admin";
import type { EventCustomer } from "invoicing";

export async function hostedEventCustomers(weekendId: string): Promise<EventCustomer[]> {
  const db = createAdminClient();
  const [{ data: opps }, { data: teams }, { data: divisions }] = await Promise.all([
    db.from("hs_opponents").select("id, contact_id, name, status").eq("weekend_id", weekendId),
    db.from("hs_hosted_teams").select("id, opponent_id, ours, name, division_id").eq("weekend_id", weekendId),
    db.from("hs_hosted_divisions").select("id, name, code").eq("weekend_id", weekendId),
  ]);
  const opponents = (opps as { id: string; contact_id: string | null; name: string; status: string }[] | null) ?? [];
  const hosted = (teams as { id: string; opponent_id: string | null; ours: boolean; name: string; division_id: string | null }[] | null) ?? [];
  const divs = new Map(((divisions as { id: string; name: string; code: string | null }[] | null) ?? []).map((d) => [d.id, d.code || d.name]));

  const contactIds = [...new Set(opponents.map((o) => o.contact_id).filter((x): x is string => !!x))];
  const emailsOf = new Map<string, string[]>();
  const nameOf = new Map<string, string>();
  if (contactIds.length) {
    const [{ data: cs }, { data: people }] = await Promise.all([
      db.from("contacts").select("id, name, email, alt_email").in("id", contactIds),
      db.from("contacts").select("parent_contact_id, email").eq("kind", "person").in("parent_contact_id", contactIds).is("deleted_at", null),
    ]);
    for (const c of (cs as { id: string; name: string; email: string | null; alt_email: string | null }[] | null) ?? []) {
      nameOf.set(c.id, c.name);
      emailsOf.set(c.id, [c.email, c.alt_email].filter((e): e is string => !!e?.trim()));
    }
    for (const p of (people as { parent_contact_id: string; email: string | null }[] | null) ?? []) {
      if (p.email?.trim()) emailsOf.set(p.parent_contact_id, [...(emailsOf.get(p.parent_contact_id) ?? []), p.email]);
    }
  }

  const byKey = new Map<string, EventCustomer & { opponentIds: string[] }>();
  for (const o of opponents) {
    if (o.status === "declined") continue;
    const key = o.contact_id ?? `name:${o.name.trim().toLowerCase()}`;
    const have = byKey.get(key);
    if (have) {
      have.opponentIds.push(o.id);
      continue;
    }
    const emails = o.contact_id ? [...new Set((emailsOf.get(o.contact_id) ?? []).map((e) => e.trim().toLowerCase()))] : [];
    byKey.set(key, {
      id: key,
      name: (o.contact_id && nameOf.get(o.contact_id)) || o.name,
      emails,
      teamCount: 0,
      opponentIds: [o.id],
    });
  }

  for (const t of hosted) {
    if (t.ours) continue;
    const owner = t.opponent_id ? [...byKey.values()].find((c) => c.opponentIds.includes(t.opponent_id!)) : null;
    if (owner) {
      owner.teamCount += 1;
      const d = t.division_id ? divs.get(t.division_id) : null;
      if (d) owner.divisions = owner.divisions ? `${owner.divisions}, ${d}` : d;
    }
  }

  return [...byKey.values()]
    .map(({ opponentIds: _o, ...c }) => c)
    .sort((a, b) => a.name.localeCompare(b.name));
}
