// Pure grouping of hosted opponents into opaque invoicing customers.
// Safe to import from node:test (no Supabase).

import type { BillLine, EventCustomer } from "invoicing";
import { teamFee, teamGames, type FeePlan } from "../hosted/logic.ts";

export function groupHostedCustomers(input: {
  opponents: { id: string; contact_id: string | null; name: string; status: string }[];
  teams: { id: string; opponent_id: string | null; ours: boolean; name: string; division_id: string | null; fee_cents?: number | null; games?: number | null }[];
  divisions: { id: string; name: string; code: string | null }[];
  contacts: { id: string; name: string; email: string | null; alt_email: string | null }[];
  people: { parent_contact_id: string; email: string | null }[];
  // With a plan, each program gets one invoice line per team, priced by the
  // game (a team with its own flat fee gets one line at that fee).
  plan?: FeePlan | null;
}): EventCustomer[] {
  const divs = new Map(input.divisions.map((d) => [d.id, d.code || d.name]));
  const emailsOf = new Map<string, string[]>();
  const nameOf = new Map<string, string>();
  for (const c of input.contacts) {
    nameOf.set(c.id, c.name);
    emailsOf.set(c.id, [c.email, c.alt_email].filter((e): e is string => !!e?.trim()));
  }
  for (const p of input.people) {
    if (p.email?.trim()) emailsOf.set(p.parent_contact_id, [...(emailsOf.get(p.parent_contact_id) ?? []), p.email]);
  }

  const byKey = new Map<string, EventCustomer & { opponentIds: string[]; billLines: BillLine[]; games: number }>();
  for (const o of input.opponents) {
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
      billLines: [],
      games: 0,
    });
  }

  for (const t of input.teams) {
    if (t.ours) continue;
    const owner = t.opponent_id ? [...byKey.values()].find((c) => c.opponentIds.includes(t.opponent_id!)) : null;
    if (owner) {
      owner.teamCount += 1;
      const d = t.division_id ? divs.get(t.division_id) : null;
      if (d) owner.divisions = owner.divisions ? `${owner.divisions}, ${d}` : d;
      const plan = input.plan;
      if (plan && plan.game_fee_cents != null) {
        const team = { fee_cents: t.fee_cents ?? null, games: t.games ?? null, ours: false };
        const n = teamGames(team, plan);
        if (team.fee_cents != null) {
          owner.billLines.push({ description: `${t.name} team fee`, qty: 1, unitCents: teamFee(team, plan) });
        } else {
          owner.games += n;
          owner.billLines.push({ description: `${t.name} games`, qty: n, unitCents: plan.game_fee_cents });
        }
      }
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      emails: row.emails,
      teamCount: row.teamCount,
      divisions: row.divisions,
      ...(input.plan && input.plan.game_fee_cents != null ? { lines: row.billLines, unitCount: row.games } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
