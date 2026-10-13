"use server";
// Messages to families from Finances (0133): email, and Slack DMs from the
// Treasurer's own Slack or from the club's Slack bot, with what each family
// owes filled in ({balance}, {due_date}, {family}, {player}). The Payments
// permission. Families and their money are read with the service role for
// this season; a copy of each message is kept on the players' pages.

import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { getPreview } from "../activity/preview";
import { latestBoard, loadFinanceSettings } from "./club-data";
import { boardPlayers, loadFamilyMoney } from "./family-money";
import { cleanReminder, fillMoney, type FamilyMoney, type ReminderSettings } from "./reminders";
import { ALL_RECIPIENTS, fillMessage, groupByFamily, messageHtml, playerTarget, type Recipient } from "../teams/family-mail";
import { sendFamilyEmails } from "../notifications/registration-message";
import { getSlackConnection, hasDmScopes, slackDmConfigured } from "../slack-dm/connection";
import { DM_MAX, MAX_DMS, dmPeople, fillDm, slackText, type DmPerson } from "../slack-dm/recipients";
import { SlackTokenError, findSlackUser, inBatches, sendDm } from "../slack-dm/slack-user-api";
import type { SlackCheck, SlackDmStatus } from "../slack-dm/actions";

type Admin = ReturnType<typeof createAdminClient>;
export type SlackFrom = "me" | "bot";

const PREVIEW = "Messages are off during Preview as: they'd come from the member you're previewing.";
const RECONNECT = "Your Slack connection has stopped working. Connect Slack again.";
const BOT_SCOPE =
  "The club's Slack bot can't send direct messages yet. In the Slack app's settings, add the im:write bot scope (OAuth & Permissions) and reinstall the app, then try again.";

interface Ctx {
  db: Admin;
  boardId: string;
  userId: string;
}

async function gate(): Promise<Ctx | { error: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  if (await getPreview()) return { error: PREVIEW };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  return { db, boardId: board.id, userId: g.userId };
}

const pickRoles = (recipients: unknown): Recipient[] => ALL_RECIPIENTS.filter((r) => Array.isArray(recipients) && recipients.includes(r));
const wanted = (ids: unknown): string[] => (Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))].slice(0, 1000) : []);

// Copies on each player's page (olb_player_messages).
async function keepCopies(db: Admin, userId: string, rows: { players: string[]; subject: string; body: string; to: string[]; via: "email" | "slack" }[]) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await db.from("olb_player_messages").insert(
    rows.flatMap((r) => r.players.map((player_id) => ({ player_id, subject: r.subject, body: r.body, sent_to: r.to, sent_by: userId, sent_at: now, via: r.via })))
  );
  if (error) console.warn(`[finances] keeping a copy of a message failed: ${error.message}`);
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/payments");
}

// ─── Email ──────────────────────────────────────────────────────────────────

// One email per family (by the parents' emails, like the Directory), with
// {balance}, {due_date}, {family} and {player} filled in for each.
export async function sendFinanceEmail(ids: string[], subject: string, body: string, recipients: Recipient[]): Promise<{ sent?: number; skipped?: string[]; error?: string }> {
  const c = await gate();
  if ("error" in c) return c;
  const title = subject?.trim();
  const text = body?.trim();
  if (!title || title.length > 200) return { error: "Add a subject (up to 200 characters)." };
  if (!text || text.length > 4000) return { error: "Add a message (up to 4,000 characters)." };
  const roles = pickRoles(recipients);
  if (roles.length === 0) return { error: "Pick at least one person to send it to." };
  const want = wanted(ids);
  if (want.length === 0) return { error: "Pick who to send it to." };
  const [players, book] = await Promise.all([boardPlayers(c.db, c.boardId, want), loadFamilyMoney(c.db, c.boardId)]);
  if (players.length === 0) return { error: "Those players aren't on this season's roster any more. Refresh the page." };
  const { groups, noEmail } = groupByFamily(players.map(playerTarget), (t) => t.contacts, roles);
  const emails = groups.map((g) => {
    const money = book.moneyOf(g.players.map((p) => p.id));
    const s = fillMessage(fillMoney(title, money), g.players);
    const t = fillMessage(fillMoney(text, money), g.players);
    return { to: g.emails, subject: s, text: t, html: messageHtml(t) };
  });
  const { sent, error } = emails.length ? await sendFamilyEmails(emails) : { sent: 0, error: undefined };
  await keepCopies(
    c.db,
    c.userId,
    groups.slice(0, sent).map((g, i) => ({ players: g.players.map((p) => p.id), subject: emails[i].subject, body: emails[i].text, to: g.emails, via: "email" as const }))
  );
  return { sent, skipped: noEmail.map((t) => t.name), ...(error ? { error } : {}) };
}

// ─── Slack ──────────────────────────────────────────────────────────────────

type Sender = { token: string; selfId: string | null; name: string };

async function sender(c: Ctx, from: SlackFrom): Promise<Sender | { status: Extract<SlackDmStatus, { ready: false }> }> {
  if (from === "bot") {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return { status: { ready: false, reason: "not-set-up", error: "The club's Slack bot isn't set up on this site (SLACK_BOT_TOKEN)." } };
    return { token, selfId: null, name: "the club's Slack bot" };
  }
  if (!slackDmConfigured()) return { status: { ready: false, reason: "not-set-up" } };
  const connection = await getSlackConnection(c.userId);
  if (!connection) return { status: { ready: false, reason: "not-connected" } };
  if (!hasDmScopes(connection)) return { status: { ready: false, reason: "reconnect", error: RECONNECT } };
  return { token: connection.token, selfId: connection.slackUserId, name: connection.slackName ?? "you" };
}

const tokenTrouble = (from: SlackFrom): { error: string; status?: SlackDmStatus } =>
  from === "bot" ? { error: BOT_SCOPE } : { error: RECONNECT, status: { ready: false, reason: "reconnect", error: RECONNECT } };

export async function financeSlackStatus(from: SlackFrom): Promise<SlackDmStatus | { error: string }> {
  const c = await gate();
  if ("error" in c) return c;
  const s = await sender(c, from);
  if ("status" in s) return s.status;
  return { ready: true, name: from === "bot" ? s.name : s.name === "you" ? null : s.name };
}

async function people(c: Ctx, ids: unknown, recipients: unknown): Promise<{ people: DmPerson[]; noContact: string[]; book: Awaited<ReturnType<typeof loadFamilyMoney>> } | { error: string }> {
  const want = wanted(ids);
  if (want.length === 0) return { error: "Pick who to send it to." };
  const roles = pickRoles(recipients);
  if (roles.length === 0) return { error: "Pick at least one person to send it to." };
  const [players, book] = await Promise.all([boardPlayers(c.db, c.boardId, want), loadFamilyMoney(c.db, c.boardId)]);
  if (players.length === 0) return { error: "Those players aren't on this season's roster any more. Refresh the page." };
  const found = dmPeople(players.map(playerTarget), roles);
  return { people: found.people, noContact: found.noContact.map((t) => t.name), book };
}

export type FinanceSlackCheck = SlackCheck & { money: FamilyMoney };

export async function checkFinanceSlack(ids: string[], recipients: Recipient[], from: SlackFrom): Promise<{ people: FinanceSlackCheck[]; noContact: string[] } | { error: string; status?: SlackDmStatus }> {
  const c = await gate();
  if ("error" in c) return c;
  const s = await sender(c, from);
  if ("status" in s) return { error: s.status.error ?? "Connect Slack first.", status: s.status };
  const found = await people(c, ids, recipients);
  if ("error" in found) return found;
  if (found.people.length > MAX_DMS) return { error: `That's ${found.people.length} people. Slack DMs go to ${MAX_DMS} at most at a time: narrow the list, or email them instead.` };
  try {
    const list = await inBatches(found.people, 5, async (p): Promise<FinanceSlackCheck> => {
      const user = await findSlackUser(s.token, p.email);
      return {
        email: p.email,
        name: p.name,
        roles: p.roles,
        players: p.players.map((t) => t.first_name),
        slack: user?.name || (user ? p.name : null),
        self: !!user && user.id === s.selfId,
        money: found.book.moneyOf(p.players.map((t) => t.id)),
      };
    });
    return { people: list, noContact: found.noContact };
  } catch (err) {
    if (err instanceof SlackTokenError) return tokenTrouble(from);
    throw err;
  }
}

export async function sendFinanceSlack(
  ids: string[],
  recipients: Recipient[],
  body: string,
  emails: string[],
  from: SlackFrom
): Promise<{ sent: string[]; missed: { email: string; reason: string }[]; error?: string; status?: SlackDmStatus }> {
  const c = await gate();
  if ("error" in c) return { sent: [], missed: [], error: c.error };
  const s = await sender(c, from);
  if ("status" in s) return { sent: [], missed: [], error: s.status.error ?? "Connect Slack first.", status: s.status };
  const text = body?.trim();
  if (!text || text.length > DM_MAX) return { sent: [], missed: [], error: `Add a message (up to ${DM_MAX.toLocaleString()} characters).` };
  const only = new Set(Array.isArray(emails) ? emails.filter((e) => typeof e === "string") : []);
  if (only.size === 0 || only.size > 25) return { sent: [], missed: [], error: "Pick who to send it to." };
  const found = await people(c, ids, recipients);
  if ("error" in found) return { sent: [], missed: [], error: found.error };
  let results: { person: DmPerson; text: string; reason?: string }[];
  try {
    results = await inBatches(
      found.people.filter((p) => only.has(p.email)),
      3,
      async (person) => {
        const filled = fillDm(fillMoney(text, found.book.moneyOf(person.players.map((t) => t.id))), person);
        const user = await findSlackUser(s.token, person.email);
        if (!user) return { person, text: filled, reason: "not on Slack" };
        if (user.id === s.selfId) return { person, text: filled, reason: "that's you" };
        const res = await sendDm(s.token, user.id, slackText(filled));
        return res.ok ? { person, text: filled } : { person, text: filled, reason: `Slack said ${res.error}` };
      }
    );
  } catch (err) {
    if (err instanceof SlackTokenError) return { sent: [], missed: [], ...tokenTrouble(from) };
    throw err;
  }
  const sent = results.filter((x) => !x.reason);
  await keepCopies(
    c.db,
    c.userId,
    sent.map((x) => ({ players: x.person.players.map((t) => t.id), subject: from === "bot" ? "Slack DM (club bot)" : "Slack DM", body: x.text, to: [x.person.email], via: "slack" as const }))
  );
  return { sent: sent.map((x) => x.person.email), missed: results.filter((x) => x.reason).map((x) => ({ email: x.person.email, reason: x.reason! })) };
}

// ─── The weekly reminder ────────────────────────────────────────────────────

export interface ReminderSetup {
  settings: ReminderSettings;
  // Recent weeks: when it went, and to how many families.
  recent: { week: string; sent: number; failed: number }[];
}

export async function loadReminderSetup(): Promise<ReminderSetup | { error: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const settings = await loadFinanceSettings(db, board.id);
  const { data } = await db.from("olb_balance_reminders").select("week, status").eq("board_id", board.id).order("week", { ascending: false }).limit(500);
  const weeks = new Map<string, { sent: number; failed: number }>();
  for (const r of (data as { week: string; status: string }[] | null) ?? []) {
    const w = weeks.get(r.week) ?? { sent: 0, failed: 0 };
    if (r.status === "sent") w.sent++;
    else if (r.status === "failed") w.failed++;
    weeks.set(r.week, w);
  }
  return { settings: settings.reminder, recent: [...weeks].slice(0, 6).map(([week, n]) => ({ week, ...n })) };
}

export async function saveReminder(input: Partial<ReminderSettings>): Promise<{ error?: string; notice?: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  const clean = cleanReminder(input);
  if ("error" in clean) return clean;
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const { error } = await db.from("olb_finance_settings").upsert({ board_id: board.id, ...clean }, { onConflict: "board_id" });
  if (error) return { error: /reminder_/.test(error.message) ? "Run migration 0133 first." : error.message };
  revalidatePath("/portal/settings");
  return { notice: clean.reminder_enabled ? "Saved. The weekly reminder is on." : "Saved. The weekly reminder is off." };
}

// The reminder as it would read for one family that owes, sent to the
// Treasurer's own email, so they can see it before turning it on.
export async function sendReminderTest(input: Partial<ReminderSettings>): Promise<{ error?: string; notice?: string }> {
  const c = await gate();
  if ("error" in c) return c;
  const clean = cleanReminder({ ...input, reminder_enabled: true });
  if ("error" in clean) return clean;
  const { data: me } = await c.db.from("members").select("email").eq("user_id", c.userId).maybeSingle();
  const to = (me as { email: string | null } | null)?.email;
  if (!to) return { error: "Your account has no email to send the test to." };
  const [players, book] = await Promise.all([boardPlayers(c.db, c.boardId), loadFamilyMoney(c.db, c.boardId)]);
  const { groups } = groupByFamily(players.map(playerTarget), (t) => t.contacts, clean.reminder_roles);
  const sample = groups.map((g) => ({ g, money: book.moneyOf(g.players.map((p) => p.id)) })).find((x) => x.money.balanceCents > 0);
  if (!sample) return { error: "No family owes anything right now, so there's nothing to show in a test." };
  const subject = `[Test] ${fillMessage(fillMoney(clean.reminder_subject!, sample.money), sample.g.players)}`;
  const text = fillMessage(fillMoney(clean.reminder_body!, sample.money), sample.g.players);
  const res = await sendFamilyEmails([{ to: [to], subject, text, html: messageHtml(text) }]);
  if (res.error || !res.sent) return { error: res.error ?? "The test didn't send." };
  return { notice: `Sent you a test to ${to}, as the ${sample.money.family} family would get it.` };
}

// Takes a family off the weekly reminder (a payment plan, say), or puts
// them back on.
export async function pauseReminders(playerIds: string[], paused: boolean): Promise<{ error?: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  const ids = wanted(playerIds);
  if (ids.length === 0) return { error: "Pick the family." };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  const { error } = paused
    ? await db.from("olb_reminder_pauses").upsert(ids.map((player_id) => ({ player_id, board_id: board.id, paused_by: g.userId })), { onConflict: "player_id" })
    : await db.from("olb_reminder_pauses").delete().in("player_id", ids);
  if (error) return { error: error.message };
  revalidatePath("/portal/payments");
  return {};
}

