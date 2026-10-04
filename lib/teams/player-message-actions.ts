"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requireFamilyEmail } from "../auth/guards";
import { sendFamilyEmails } from "../notifications/registration-message";
import {
  ALL_RECIPIENTS,
  fillMessage,
  groupByFamily,
  messageHtml,
  playerTarget,
  type PlayerWithParents,
  type Recipient,
} from "./family-mail";

// A whole season's roster, read 100 at a time so the request stays short.
const MAX_PLAYERS = 1000;
const CHUNK = 100;

// Emails the families of Directory players (0116): the players in view, or
// one player from their page. Sent the same way as the waitlist's messages:
// from the club's address, one email per family, to the parents and players
// picked, with {player} filled in. A copy is kept on each player's page.
export async function sendPlayerMessage(
  ids: string[],
  subject: string,
  body: string,
  recipients: Recipient[] = ALL_RECIPIENTS
): Promise<{ sent?: number; skipped?: string[]; error?: string }> {
  const gate = await requireFamilyEmail();
  if ("error" in gate) return { error: gate.error };
  const title = subject?.trim();
  const text = body?.trim();
  if (!title || title.length > 200) return { error: "Add a subject (up to 200 characters)." };
  if (!text || text.length > 4000) return { error: "Add a message (up to 4,000 characters)." };
  const wanted = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string"))] : [];
  if (wanted.length === 0 || wanted.length > MAX_PLAYERS) return { error: "Pick who to send it to." };
  const roles = ALL_RECIPIENTS.filter((r) => Array.isArray(recipients) && recipients.includes(r));
  if (roles.length === 0) return { error: "Pick at least one person to send it to." };

  // Read under the caller's own access: only players they may see.
  const db = await createClient();
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
  const players = wanted.map((id) => found.get(id)).filter((p): p is PlayerWithParents => !!p);
  if (players.length === 0) return { error: "Those players aren't in the Directory any more. Refresh the page." };

  const { groups, noEmail } = groupByFamily(players.map(playerTarget), (t) => t.contacts, roles);
  const emails = groups.map((g) => {
    const filled = fillMessage(text, g.players);
    return { to: g.emails, subject: fillMessage(title, g.players), text: filled, html: messageHtml(filled) };
  });
  const { sent, error } = emails.length ? await sendFamilyEmails(emails) : { sent: 0, error: undefined };

  // Keep a copy on each player that was emailed.
  const done = groups.slice(0, sent);
  if (done.length) {
    const now = new Date().toISOString();
    const rows = done.flatMap((g, i) =>
      g.players.map((t) => ({
        player_id: t.id,
        subject: emails[i].subject,
        body: emails[i].text,
        sent_to: g.emails,
        sent_by: gate.userId,
        sent_at: now,
      }))
    );
    const { error: logError } = await db.from("olb_player_messages").insert(rows);
    if (logError) console.warn(`[directory] keeping a copy of a message failed: ${logError.message}`);
    revalidatePath("/portal/directory", "layout");
  }
  return { sent, skipped: noEmail.map((t) => t.name), ...(error ? { error } : {}) };
}
