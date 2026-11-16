// Slack channels for new families (0175): which channels a family's parents
// go in, and what to say when Slack says no. Pure, safe for client and server.

export interface SlackChannel {
  id: string;
  name: string;
}

// The saved list of channels every family gets, cleaned: known shape only,
// no repeats.
export function cleanChannelList(raw: unknown): SlackChannel[] {
  if (!Array.isArray(raw)) return [];
  const out: SlackChannel[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const id = String((c as { id?: unknown }).id ?? "").trim();
    if (!/^[CG][A-Z0-9]{8,}$/i.test(id) || out.some((o) => o.id === id)) continue;
    const name = String((c as { name?: unknown }).name ?? "").trim().replace(/^#/, "") || id;
    out.push({ id, name });
  }
  return out;
}

// The team's channel: its own, else the one game film posts to.
export function teamChannelId(team: { slack_channel_id: string | null; film_slack_channel_id: string | null }): string | null {
  return team.slack_channel_id?.trim() || team.film_slack_channel_id?.trim() || null;
}

// Every channel for one family: their players' team channels first, then
// the ones every family gets. No repeats.
export function channelsForFamily(
  everyone: SlackChannel[],
  teamChannels: Map<string, SlackChannel>,
  teamIds: (string | null)[]
): SlackChannel[] {
  const out: SlackChannel[] = [];
  const add = (c: SlackChannel | undefined) => {
    if (c && !out.some((o) => o.id === c.id)) out.push(c);
  };
  for (const t of teamIds) if (t) add(teamChannels.get(t));
  for (const c of everyone) add(c);
  return out;
}

// conversations.invite answers that mean the person is already there.
export function inviteDone(error: string | undefined): boolean {
  return error === "already_in_channel";
}

// Errors that stop the whole run: the bot can't invite anyone anywhere.
export const STOP_ERRORS = new Set(["missing_scope", "not_authed", "invalid_auth", "account_inactive", "token_revoked", "token_expired", "ratelimited"]);

// What Slack said, in plain words for the Onboarding tab.
export function inviteErrorWords(error: string, channel: string): string {
  switch (error) {
    case "not_in_channel":
    case "channel_not_found":
      return `The club's Slack app isn't in #${channel}. In Slack, open #${channel} and add the app, then try again.`;
    case "is_archived":
      return `#${channel} is archived.`;
    case "missing_scope":
      return "The club's Slack app needs new permissions. Reinstall it from the Slack app settings, then try again.";
    case "cant_invite_self":
    case "cant_invite":
    case "user_is_restricted":
    case "ura_max_channels":
      return `Slack won't let this person into #${channel} (guest account). Add them in Slack.`;
    case "user_not_found":
    case "user_disabled":
      return "That Slack account is gone or turned off.";
    default:
      return `Slack said "${error}" for #${channel}.`;
  }
}
