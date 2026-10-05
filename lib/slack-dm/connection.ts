// Server-only. Each Slack DM sender's own Slack connection (0118): the user
// token "Connect Slack" (/api/slack/connect) brings back, so their DMs come
// from them. The table has no policies, so it's read and written here with
// the service role, always for the signed-in user's own row.

import { createAdminClient } from "../supabase/admin";
import { SLACK_DM_USER_SCOPES, slackCall } from "./slack-user-api";

export interface SlackConnection {
  slackUserId: string;
  slackTeamId: string;
  slackName: string | null;
  token: string;
  scopes: string[];
}

// The env vars "Connect Slack" needs: the Slack app's Client ID and Client
// Secret (Basic Information), the same pair Supabase's Slack sign-in uses.
export function slackDmConfigured(): boolean {
  return !!(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Null when they haven't connected (or 0118 isn't applied yet).
export async function getSlackConnection(userId: string): Promise<SlackConnection | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data, error } = await createAdminClient()
    .from("member_slack_connections")
    .select("slack_user_id, slack_team_id, slack_name, access_token, scopes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { slack_user_id: string; slack_team_id: string; slack_name: string | null; access_token: string; scopes: string };
  return {
    slackUserId: row.slack_user_id,
    slackTeamId: row.slack_team_id,
    slackName: row.slack_name,
    token: row.access_token,
    scopes: row.scopes.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

// Can this connection send? Connected before a scope was added → no.
export function hasDmScopes(c: Pick<SlackConnection, "scopes">): boolean {
  return SLACK_DM_USER_SCOPES.every((s) => c.scopes.includes(s));
}

export async function saveSlackConnection(
  userId: string,
  c: Omit<SlackConnection, "scopes"> & { scopes: string }
): Promise<{ error?: string }> {
  const { error } = await createAdminClient()
    .from("member_slack_connections")
    .upsert(
      {
        user_id: userId,
        slack_user_id: c.slackUserId,
        slack_team_id: c.slackTeamId,
        slack_name: c.slackName,
        access_token: c.token,
        scopes: c.scopes,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  return error ? { error: error.message } : {};
}

// Forgets the connection, and tells Slack to cancel the token too.
export async function removeSlackConnection(userId: string): Promise<{ error?: string }> {
  const existing = await getSlackConnection(userId);
  if (existing) {
    try {
      await slackCall(existing.token, "auth.revoke", {});
    } catch {
      /* already revoked: nothing to cancel */
    }
  }
  const { error } = await createAdminClient().from("member_slack_connections").delete().eq("user_id", userId);
  return error ? { error: error.message } : {};
}
