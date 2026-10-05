"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requireSlackDm } from "../auth/guards";
import { getPreview } from "../activity/preview";
import { ALL_RECIPIENTS, playerTarget, type Recipient } from "../teams/family-mail";
import { readPlayers, wantedIds } from "../teams/read-players";
import { getSlackConnection, hasDmScopes, removeSlackConnection, slackDmConfigured, type SlackConnection } from "./connection";
import { DM_MAX, MAX_DMS, dmPeople, fillDm, slackText, type DmPerson } from "./recipients";
import { SlackTokenError, findSlackUser, inBatches, sendDm } from "./slack-user-api";

// Slack DMs to families from the Directory (0118). The sheet asks for the
// sender's connection, then who of the people picked is on Slack, then sends
// a few people at a time so it can show how far it's got.

export type SlackDmStatus =
  | { ready: true; name: string | null }
  | { ready: false; reason: "not-set-up" | "not-connected" | "reconnect" | "preview"; error?: string };

const PREVIEW = "Slack DMs are off during Preview as: they'd come from the member you're previewing.";
const RECONNECT = "Your Slack connection has stopped working. Connect Slack again.";

type Ready = { userId: string; connection: SlackConnection };
type NotReady = Extract<SlackDmStatus, { ready: false }>;

// The grant, not previewing, and a connection that can send.
async function ready(): Promise<Ready | { status: NotReady } | { error: string }> {
  const gate = await requireSlackDm();
  if ("error" in gate) return { error: gate.error };
  if (await getPreview()) return { status: { ready: false, reason: "preview", error: PREVIEW } };
  if (!slackDmConfigured()) return { status: { ready: false, reason: "not-set-up" } };
  const connection = await getSlackConnection(gate.userId);
  if (!connection) return { status: { ready: false, reason: "not-connected" } };
  if (!hasDmScopes(connection)) return { status: { ready: false, reason: "reconnect", error: RECONNECT } };
  return { userId: gate.userId, connection };
}

export async function getSlackDmStatus(): Promise<SlackDmStatus | { error: string }> {
  const r = await ready();
  if ("error" in r) return { error: r.error };
  if ("status" in r) return r.status;
  return { ready: true, name: r.connection.slackName };
}

export async function disconnectSlack(): Promise<{ error?: string }> {
  const gate = await requireSlackDm();
  if ("error" in gate) return { error: gate.error };
  if (await getPreview()) return { error: PREVIEW };
  return removeSlackConnection(gate.userId);
}

function pickRoles(recipients: unknown): Recipient[] {
  return ALL_RECIPIENTS.filter((r) => Array.isArray(recipients) && recipients.includes(r));
}

// The people picked among the players asked for, read under the caller's
// own access.
async function peopleFor(ids: unknown, recipients: unknown): Promise<{ people: DmPerson[]; noContact: string[] } | { error: string }> {
  const wanted = wantedIds(ids);
  if (wanted.length === 0) return { error: "Pick who to send it to." };
  const roles = pickRoles(recipients);
  if (roles.length === 0) return { error: "Pick at least one person to send it to." };
  const db = await createClient();
  const players = await readPlayers(db, wanted);
  if (players.length === 0) return { error: "Those players aren't in the Directory any more. Refresh the page." };
  const { people, noContact } = dmPeople(players.map(playerTarget), roles);
  return { people, noContact: noContact.map((t) => t.name) };
}

export interface SlackCheck {
  email: string;
  name: string;
  roles: Recipient[];
  players: string[];
  // Their name in Slack; null when nobody in the workspace has that email.
  slack: string | null;
  // The sender themselves: no DM to yourself.
  self: boolean;
}

export type SlackCheckResult = { people: SlackCheck[]; noContact: string[] } | { error: string; status?: SlackDmStatus };

// Who of the people picked has a Slack account with the email on file.
export async function checkSlackRecipients(ids: string[], recipients: Recipient[]): Promise<SlackCheckResult> {
  const r = await ready();
  if ("error" in r) return { error: r.error };
  if ("status" in r) return { error: r.status.error ?? "Connect Slack first.", status: r.status };
  const found = await peopleFor(ids, recipients);
  if ("error" in found) return found;
  if (found.people.length > MAX_DMS) {
    return { error: `That's ${found.people.length} people. Slack DMs go to ${MAX_DMS} at most at a time: narrow the list, or email them instead.` };
  }
  try {
    const people = await inBatches(found.people, 5, async (p): Promise<SlackCheck> => {
      const user = await findSlackUser(r.connection.token, p.email);
      return {
        email: p.email,
        name: p.name,
        roles: p.roles,
        players: p.players.map((t) => t.first_name),
        slack: user?.name || (user ? p.name : null),
        self: user?.id === r.connection.slackUserId,
      };
    });
    return { people, noContact: found.noContact };
  } catch (err) {
    if (err instanceof SlackTokenError) return { error: RECONNECT, status: { ready: false, reason: "reconnect", error: RECONNECT } };
    throw err;
  }
}

export interface SlackSendResult {
  sent: string[];
  // Emails that didn't get one, and why.
  missed: { email: string; reason: string }[];
  error?: string;
  status?: SlackDmStatus;
}

// Sends the DMs to the people with these emails (a few of those picked, so
// the sheet can show progress), each from the sender's own Slack, with
// {name} and {player} filled in for them. A copy is kept on each player's
// page.
export async function sendSlackDms(ids: string[], recipients: Recipient[], body: string, emails: string[]): Promise<SlackSendResult> {
  const r = await ready();
  if ("error" in r) return { sent: [], missed: [], error: r.error };
  if ("status" in r) return { sent: [], missed: [], error: r.status.error ?? "Connect Slack first.", status: r.status };
  const text = body?.trim();
  if (!text || text.length > DM_MAX) return { sent: [], missed: [], error: `Add a message (up to ${DM_MAX.toLocaleString()} characters).` };
  const only = new Set(Array.isArray(emails) ? emails.filter((e) => typeof e === "string") : []);
  if (only.size === 0 || only.size > 25) return { sent: [], missed: [], error: "Pick who to send it to." };
  const found = await peopleFor(ids, recipients);
  if ("error" in found) return { sent: [], missed: [], error: found.error };
  const people = found.people.filter((p) => only.has(p.email));

  const token = r.connection.token;
  let results: { person: DmPerson; text: string; reason?: string }[];
  try {
    results = await inBatches(people, 3, async (person) => {
      const filled = fillDm(text, person);
      const user = await findSlackUser(token, person.email);
      if (!user) return { person, text: filled, reason: "not on Slack" };
      if (user.id === r.connection.slackUserId) return { person, text: filled, reason: "that's you" };
      const res = await sendDm(token, user.id, slackText(filled));
      return res.ok ? { person, text: filled } : { person, text: filled, reason: `Slack said ${res.error}` };
    });
  } catch (err) {
    if (err instanceof SlackTokenError) return { sent: [], missed: [], error: RECONNECT, status: { ready: false, reason: "reconnect", error: RECONNECT } };
    throw err;
  }

  const sent = results.filter((x) => !x.reason);
  if (sent.length) {
    const db = await createClient();
    const now = new Date().toISOString();
    const rows = sent.flatMap((x) =>
      x.person.players.map((t) => ({
        player_id: t.id,
        subject: "Slack DM",
        body: x.text,
        sent_to: [x.person.email],
        sent_by: r.userId,
        sent_at: now,
        via: "slack",
      }))
    );
    const { error: logError } = await db.from("olb_player_messages").insert(rows);
    if (logError) console.warn(`[slack-dm] keeping a copy of a DM failed: ${logError.message}`);
    revalidatePath("/portal/directory", "layout");
  }
  return {
    sent: sent.map((x) => x.person.email),
    missed: results.filter((x) => x.reason).map((x) => ({ email: x.person.email, reason: x.reason! })),
  };
}
