// GET /api/slack/connect/callback — Slack sends people back here after
// "Connect Slack" (/api/slack/connect). Checks the state against this
// browser's cookie, trades the code for their user token, and keeps it
// (member_slack_connections, 0118) so their Slack DMs come from them.

import { NextResponse, type NextRequest } from "next/server";
import { requireSlackDm } from "../../../../../lib/auth/guards";
import { getPreview } from "../../../../../lib/activity/preview";
import { saveSlackConnection, slackDmConfigured } from "../../../../../lib/slack-dm/connection";
import { SLACK_DM_USER_SCOPES, slackCall } from "../../../../../lib/slack-dm/slack-user-api";
import { POPUP_RETURN, safeReturnPath } from "../../../../../lib/slack-dm/recipients";
import { CALLBACK_PATH, CONNECT_COOKIE, CONNECT_PATH, backTo, popupPage, readStateCookie } from "../../../../../lib/slack-dm/oauth";

export const runtime = "nodejs";

interface OAuthResponse {
  ok?: boolean;
  error?: string;
  team?: { id?: string };
  authed_user?: { id?: string; scope?: string; access_token?: string; token_type?: string };
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const saved = readStateCookie(req.cookies.get(CONNECT_COOKIE)?.value, params.get("state"));
  // No matching cookie: a link from somewhere else, or one that's expired.
  const next = saved ? (saved.next === POPUP_RETURN ? POPUP_RETURN : safeReturnPath(saved.next)) : "/portal/directory";
  const finish = (outcome: string) => {
    const res = next === POPUP_RETURN ? popupPage(outcome) : NextResponse.redirect(backTo(origin, next, outcome));
    res.headers.append("Set-Cookie", `${CONNECT_COOKIE}=; Path=${CONNECT_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`);
    return res;
  };
  if (!saved) return finish("failed");
  // "Cancel" on Slack's page.
  if (params.get("error")) return finish("cancelled");

  const gate = await requireSlackDm();
  if ("error" in gate) return finish("not-allowed");
  if (await getPreview()) return finish("preview");
  const code = params.get("code");
  if (!code || !slackDmConfigured()) return finish("failed");

  let body: OAuthResponse = {};
  try {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!.trim(),
        client_secret: process.env.SLACK_CLIENT_SECRET!.trim(),
        code,
        redirect_uri: origin + CALLBACK_PATH,
      }),
    });
    body = (await res.json()) as OAuthResponse;
  } catch {
    body = { ok: false, error: "network" };
  }
  const user = body.authed_user;
  if (!body.ok || !user?.id || !user.access_token || !body.team?.id) {
    console.warn(`[slack-dm] connecting failed: ${body.error ?? "no user token"}`);
    return finish("failed");
  }
  // Only the club's own workspace.
  const home = process.env.SLACK_TEAM_ID?.trim();
  if (home && body.team.id !== home) return finish("wrong-workspace");
  const scopes = (user.scope ?? "").split(",").map((s) => s.trim());
  if (!SLACK_DM_USER_SCOPES.every((s) => scopes.includes(s))) return finish("failed");

  // Their name in Slack, to show who the DMs come from.
  let name: string | null = null;
  try {
    const info = await slackCall(user.access_token, "users.info", { user: user.id });
    const u = info.user as { real_name?: string; name?: string; profile?: { real_name?: string; display_name?: string } } | undefined;
    name = u?.profile?.real_name || u?.real_name || u?.profile?.display_name || u?.name || null;
  } catch {
    /* the name is only for show */
  }

  const { error } = await saveSlackConnection(gate.userId, {
    slackUserId: user.id,
    slackTeamId: body.team.id,
    slackName: name,
    token: user.access_token,
    scopes: scopes.join(","),
  });
  if (error) {
    console.warn(`[slack-dm] saving the connection failed: ${error}`);
    return finish("failed");
  }
  return finish("connected");
}
