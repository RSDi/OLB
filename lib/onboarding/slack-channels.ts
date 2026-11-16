// Server-only. Slack channels for new families (0175): once a parent of an
// approved family is on Slack, the club's bot (SLACK_BOT_TOKEN) adds them to
// their player's team channel and the channels every family gets. Each add
// is recorded in olb_onboarding_slack_channels so nobody is added twice.
// Service role; callers check the Registrations permission (or are the cron).
//
// Bot scopes (lib/slack/app-manifest.ts): channels:manage and groups:write
// for conversations.invite, channels:join so the bot can step into a public
// channel it isn't in yet. A private channel needs someone to add the app.

import { slackCall, SlackTokenError } from "../slack-dm/slack-user-api";
import type { FamilyView } from "./family-data";
import type { Db } from "./server";
import {
  channelsForFamily,
  cleanChannelList,
  inviteDone,
  inviteErrorWords,
  STOP_ERRORS,
  teamChannelId,
  type SlackChannel,
} from "./slack-channels-logic";

export interface ChannelSettings {
  auto: boolean;
  everyone: SlackChannel[];
}

export interface TeamChannelRow {
  id: string;
  name: string;
  slack_channel_id: string | null;
  film_slack_channel_id: string | null;
}

export async function loadChannelSettings(db: Db, boardId: string): Promise<ChannelSettings> {
  const { data } = await db.from("olb_onboarding_settings").select("slack_auto_channels, slack_channels").eq("board_id", boardId).maybeSingle();
  const row = data as { slack_auto_channels?: boolean; slack_channels?: unknown } | null;
  return { auto: row?.slack_auto_channels === true, everyone: cleanChannelList(row?.slack_channels) };
}

export async function loadTeamChannels(db: Db, boardId: string): Promise<TeamChannelRow[]> {
  const { data } = await db.from("olb_teams").select("id, name, slack_channel_id, film_slack_channel_id").eq("board_id", boardId).order("name");
  return (data as TeamChannelRow[] | null) ?? [];
}

// A channel's name from Slack, for showing "#photos-videos" instead of an ID.
// The ID itself when Slack won't say.
export async function channelName(id: string): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return id;
  try {
    const body = await slackCall(token, "conversations.info", { channel: id });
    const name = (body.channel as { name?: string } | undefined)?.name;
    return body.ok && name ? name : id;
  } catch {
    return id;
  }
}

// Who has joined Slack, for these emails, looked up again unless already
// known to be in. Returns how many were looked up.
export async function lookupSlackUsers(db: Db, emails: string[]): Promise<number> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || emails.length === 0) return 0;
  const { data: known } = await db.from("olb_onboarding_slack").select("email, joined").in("email", emails);
  const joined = new Set(((known as { email: string; joined: boolean }[] | null) ?? []).filter((k) => k.joined).map((k) => k.email));
  let checked = 0;
  for (const email of emails) {
    if (joined.has(email)) continue;
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { id?: string; deleted?: boolean } }) : {};
    if (!res?.ok || (body.ok === false && body.error !== "users_not_found")) {
      console.warn(`[onboarding] Slack lookup stopped: ${body.error ?? res?.status ?? "network error"}`);
      break;
    }
    const isIn = body.ok === true && !!body.user?.id && !body.user.deleted;
    await db.from("olb_onboarding_slack").upsert({ email, slack_user_id: isIn ? body.user!.id : null, joined: isIn, checked_at: new Date().toISOString() });
    checked++;
  }
  return checked;
}

export interface PersonChannels {
  email: string;
  joined: boolean;
  added: string[];
  missing: string[];
  error: string | null;
}

export interface FamilyChannels {
  familyId: string;
  people: PersonChannels[];
  done: boolean;
}

interface Context {
  everyone: SlackChannel[];
  teamChannels: Map<string, SlackChannel>;
  users: Map<string, string>; // email → Slack user id, joined only
  log: Map<string, { added: boolean; error: string | null }>; // `${user}:${channel}`
}

async function context(db: Db, boardId: string, families: FamilyView[]): Promise<Context> {
  const [settings, teams] = await Promise.all([loadChannelSettings(db, boardId), loadTeamChannels(db, boardId)]);
  const teamChannels = new Map<string, SlackChannel>();
  const wanted = new Set(families.flatMap((f) => f.players.map((p) => p.teamId)).filter((t): t is string => !!t));
  for (const t of teams) {
    const id = teamChannelId(t);
    if (id && wanted.has(t.id)) teamChannels.set(t.id, { id, name: t.name });
  }
  const emails = [...new Set(families.flatMap((f) => f.emails))];
  const { data: slack } = emails.length ? await db.from("olb_onboarding_slack").select("email, slack_user_id, joined").in("email", emails) : { data: [] };
  const users = new Map<string, string>();
  for (const s of (slack as { email: string; slack_user_id: string | null; joined: boolean }[] | null) ?? []) if (s.joined && s.slack_user_id) users.set(s.email, s.slack_user_id);
  const ids = [...new Set(users.values())];
  const { data: rows } = ids.length ? await db.from("olb_onboarding_slack_channels").select("slack_user_id, channel_id, added_at, error").in("slack_user_id", ids) : { data: [] };
  const log = new Map<string, { added: boolean; error: string | null }>();
  for (const r of (rows as { slack_user_id: string; channel_id: string; added_at: string | null; error: string | null }[] | null) ?? []) {
    log.set(`${r.slack_user_id}:${r.channel_id}`, { added: !!r.added_at, error: r.error });
  }
  return { everyone: settings.everyone, teamChannels, users, log };
}

function familyStatus(f: FamilyView, ctx: Context): FamilyChannels {
  const channels = channelsForFamily(ctx.everyone, ctx.teamChannels, f.players.map((p) => p.teamId));
  const people = f.emails.map((email) => {
    const user = ctx.users.get(email);
    if (!user) return { email, joined: false, added: [], missing: channels.map((c) => c.name), error: null };
    const added: string[] = [];
    const missing: string[] = [];
    let error: string | null = null;
    for (const c of channels) {
      const l = ctx.log.get(`${user}:${c.id}`);
      if (l?.added) added.push(c.name);
      else {
        missing.push(c.name);
        error ??= l?.error ?? null;
      }
    }
    return { email, joined: true, added, missing, error };
  });
  // Done when everyone on Slack is in every channel, and someone is on Slack.
  const done = channels.length > 0 && people.some((p) => p.joined) && people.every((p) => !p.joined || p.missing.length === 0);
  return { familyId: f.id, people, done };
}

// Where each family stands, for the Onboarding tab.
export async function familyChannelStatus(db: Db, boardId: string, families: FamilyView[]): Promise<FamilyChannels[]> {
  const ctx = await context(db, boardId, families);
  return families.map((f) => familyStatus(f, ctx));
}

export interface AddResult {
  added: number;
  failed: number;
  // The first thing that went wrong, in plain words.
  problem: string | null;
}

// Adds every joined parent of these families to the channels they're
// missing. Already-added pairs are skipped; failures are recorded and tried
// again next time.
export async function addFamiliesToChannels(db: Db, boardId: string, families: FamilyView[]): Promise<AddResult> {
  const out: AddResult = { added: 0, failed: 0, problem: null };
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ...out, problem: "Slack isn't connected (no bot token)." };
  const ctx = await context(db, boardId, families);
  const joinedChannels = new Set<string>();

  for (const f of families) {
    const channels = channelsForFamily(ctx.everyone, ctx.teamChannels, f.players.map((p) => p.teamId));
    for (const email of f.emails) {
      const user = ctx.users.get(email);
      if (!user) continue;
      for (const c of channels) {
        const key = `${user}:${c.id}`;
        if (ctx.log.get(key)?.added) continue;
        let error: string | undefined;
        try {
          let body = await slackCall(token, "conversations.invite", { channel: c.id, users: user });
          // A public channel the bot isn't in: step in, then try again.
          if (!body.ok && body.error === "not_in_channel" && !joinedChannels.has(c.id)) {
            const join = await slackCall(token, "conversations.join", { channel: c.id });
            if (join.ok) {
              joinedChannels.add(c.id);
              body = await slackCall(token, "conversations.invite", { channel: c.id, users: user });
            }
          }
          error = body.ok || inviteDone(body.error) ? undefined : (body.error ?? "unknown_error");
        } catch (e) {
          error = e instanceof SlackTokenError ? e.message : "network_error";
        }
        const now = new Date().toISOString();
        const words = error ? inviteErrorWords(error, c.name) : null;
        await db.from("olb_onboarding_slack_channels").upsert({ slack_user_id: user, channel_id: c.id, email, added_at: error ? null : now, error: words, tried_at: now });
        ctx.log.set(key, { added: !error, error: words });
        if (error) {
          out.failed++;
          out.problem ??= words;
          if (STOP_ERRORS.has(error)) return out;
        } else out.added++;
      }
    }
  }
  return out;
}
