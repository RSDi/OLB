// Server-only. The Directory players a message is about, with their parents,
// read under the caller's own access so they only reach players they may
// see. Emailing families (0116) and Slack DMs (0118) both start here.

import type { createClient } from "../supabase/server";
import type { PlayerWithParents } from "./family-mail";

// A whole season's roster, read 100 at a time so the request stays short.
export const MAX_PLAYERS = 1000;
const CHUNK = 100;

// The ids asked for, once each, in order. Empty when there are none or too
// many.
export function wantedIds(ids: unknown): string[] {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string"))] : [];
  return list.length > MAX_PLAYERS ? [] : list;
}

export async function readPlayers(db: Awaited<ReturnType<typeof createClient>>, wanted: string[]): Promise<PlayerWithParents[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < wanted.length; i += CHUNK) chunks.push(wanted.slice(i, i + CHUNK));
  const reads = await Promise.all(
    chunks.map((c) =>
      db
        .from("olb_players")
        .select("id, full_name, email, parents:olb_player_parents(relationship, member:members(full_name, email))")
        .in("id", c)
    )
  );
  const found = new Map(reads.flatMap((r) => (r.data as unknown as PlayerWithParents[] | null) ?? []).map((p) => [p.id, p]));
  return wanted.map((id) => found.get(id)).filter((p): p is PlayerWithParents => !!p);
}
