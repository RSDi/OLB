"use server";

// Slack channels for new families (0175), from the portal: the settings card
// in Settings → Registration Automations, and "Add to Slack channels" on the
// Onboarding tab. The Registrations permission, checked first; the writes
// run with the service role.

import { revalidatePath } from "next/cache";
import { requireRegistrations } from "../auth/guards";
import { getViewer } from "../auth/viewer";
import { parseFilmSlackChannelId } from "../film/slack-drafts";
import { createAdminClient } from "../supabase/admin";
import { loadFamilies } from "./family-data";
import { loadSettings, seasonBoardId } from "./server";
import { addFamiliesToChannels, channelName, loadChannelSettings, loadTeamChannels, lookupSlackUsers } from "./slack-channels";
import type { SlackChannel } from "./slack-channels-logic";

type Result = { error?: string; notice?: string };

export interface SlackChannelsCard {
  preview: boolean;
  slackConnected: boolean;
  auto: boolean;
  everyone: SlackChannel[];
  teams: { id: string; name: string; channel: string; filmChannel: string | null }[];
}

async function board(): Promise<{ db: ReturnType<typeof createAdminClient>; boardId: string } | { error: string }> {
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  return { db, boardId };
}

export async function loadSlackChannelsCard(): Promise<SlackChannelsCard | { error: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const viewer = await getViewer();
  const b = await board();
  if ("error" in b) return { error: b.error };
  const [settings, teams] = await Promise.all([loadChannelSettings(b.db, b.boardId), loadTeamChannels(b.db, b.boardId)]);
  return {
    preview: !!viewer?.seesFullUi,
    slackConnected: !!process.env.SLACK_BOT_TOKEN,
    auto: settings.auto,
    everyone: settings.everyone,
    teams: teams.map((t) => ({ id: t.id, name: t.name, channel: t.slack_channel_id ?? "", filmChannel: t.film_slack_channel_id })),
  };
}

export async function saveSlackChannels(input: { auto: boolean; everyone: string[]; teams: { id: string; channel: string }[] }): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return { error: b.error };

  const everyone: SlackChannel[] = [];
  for (const raw of input.everyone.slice(0, 20)) {
    if (!raw.trim()) continue;
    const p = parseFilmSlackChannelId(raw);
    if (!p.ok) return { error: p.error };
    if (p.id && !everyone.some((c) => c.id === p.id)) everyone.push({ id: p.id, name: await channelName(p.id) });
  }
  const teams: { id: string; channel: string | null }[] = [];
  for (const t of input.teams) {
    const p = parseFilmSlackChannelId(t.channel);
    if (!p.ok) return { error: p.error };
    teams.push({ id: t.id, channel: p.id });
  }

  const { error } = await b.db
    .from("olb_onboarding_settings")
    .upsert({ board_id: b.boardId, slack_auto_channels: input.auto === true, slack_channels: everyone, updated_by: gate.userId, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  const known = new Set((await loadTeamChannels(b.db, b.boardId)).map((t) => t.id));
  for (const t of teams) {
    if (!known.has(t.id)) continue;
    const { error: e } = await b.db.from("olb_teams").update({ slack_channel_id: t.channel }).eq("id", t.id);
    if (e) return { error: e.message };
  }
  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory", "layout");
  return { notice: "Saved." };
}

// "Add to Slack channels": one family, or every approved family when no id
// is given. Checks Slack again for parents not known to be on it yet.
export async function addToSlackChannels(familyId?: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return { error: b.error };
  const settings = await loadSettings(b.db, b.boardId);
  const families = (await loadFamilies(b.db, settings)).filter(
    (f) => (familyId ? f.id === familyId : true) && f.registrations.some((r) => r.status === "approved")
  );
  if (families.length === 0) return { error: familyId ? "That family isn't approved yet." : "No approved families yet." };
  await lookupSlackUsers(b.db, [...new Set(families.flatMap((f) => f.emails))]);
  const res = await addFamiliesToChannels(b.db, b.boardId, families);
  revalidatePath("/portal/directory", "layout");
  if (res.problem && res.added === 0) return { error: res.problem };
  const notice =
    res.added === 0
      ? "Nobody new to add. Parents not on Slack yet are added once they join."
      : `Added to ${res.added} channel${res.added === 1 ? "" : "s"}.${res.problem ? ` ${res.problem}` : ""}`;
  return { notice };
}
