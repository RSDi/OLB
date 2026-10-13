// Server-only. The weekly balance reminder (0133), run every day by
// /api/cron/balance-reminders: on the weekday Settings → Fees picks, each
// family that owes and has reached their start (as soon as they owe, or some
// days from their due date) gets the reminder, until they've paid. One per
// family per week, kept in olb_balance_reminders; families the Treasurer
// paused are skipped.

import { createAdminClient } from "../supabase/admin";
import { centralDay, weekOf } from "../onboarding/dates";
import { loadFinanceSettings } from "./club-data";
import { boardPlayers, loadFamilyMoney } from "./family-money";
import { familyKey, fillMoney, reminderDue } from "./reminders";
import { fillMessage, groupByFamily, messageHtml, playerTarget } from "../teams/family-mail";
import { sendFamilyEmails } from "../notifications/registration-message";

export interface ReminderRun {
  boards: number;
  sent: number;
  failed: number;
  already: number;
  skipped: string[];
}

export async function runBalanceReminders(now: Date = new Date()): Promise<ReminderRun> {
  const db = createAdminClient();
  const today = centralDay(now);
  const week = weekOf(today);
  const out: ReminderRun = { boards: 0, sent: 0, failed: 0, already: 0, skipped: [] };
  const { data: boards, error } = await db.from("olb_finance_settings").select("board_id").eq("enabled", true).eq("reminder_enabled", true);
  if (error) {
    out.skipped.push(`settings: ${error.message}`);
    return out;
  }
  for (const { board_id } of (boards as { board_id: string }[] | null) ?? []) {
    const settings = await loadFinanceSettings(db, board_id);
    const r = settings.reminder;
    if (!r.reminder_subject || !r.reminder_body) continue;
    out.boards++;
    const [players, book] = await Promise.all([boardPlayers(db, board_id), loadFamilyMoney(db, board_id)]);
    const { groups } = groupByFamily(players.map(playerTarget), (t) => t.contacts, r.reminder_roles);
    for (const g of groups) {
      const ids = g.players.map((p) => p.id);
      const money = book.moneyOf(ids);
      if (!reminderDue(r, today, { balanceCents: money.balanceCents, dueOn: money.dueOn, paused: ids.some((id) => book.paused.has(id)) })) continue;
      const subject = fillMessage(fillMoney(r.reminder_subject, money), g.players);
      const text = fillMessage(fillMoney(r.reminder_body, money), g.players);
      // Claim the week first: a second run the same week finds it taken.
      const { data: row, error: claim } = await db
        .from("olb_balance_reminders")
        .insert({ board_id, family_key: familyKey(ids), week, player_ids: ids, to_emails: g.emails, balance_cents: money.balanceCents, status: "sending" })
        .select("id")
        .single();
      if (claim) {
        if (claim.code === "23505") out.already++;
        else out.skipped.push(`${money.family}: ${claim.message}`);
        continue;
      }
      const res = await sendFamilyEmails([{ to: g.emails, subject, text, html: messageHtml(text) }]);
      const ok = res.sent > 0 && !res.error;
      await db
        .from("olb_balance_reminders")
        .update({ status: ok ? "sent" : "failed", error: ok ? null : (res.error ?? "not sent").slice(0, 500) })
        .eq("id", (row as { id: string }).id);
      if (ok) {
        out.sent++;
        // A copy on each player's page, like any message from Finances.
        await db.from("olb_player_messages").insert(
          ids.map((player_id) => ({ player_id, subject, body: text, sent_to: g.emails, sent_by: null, sent_at: new Date().toISOString(), via: "email" }))
        );
      } else out.failed++;
    }
  }
  return out;
}
