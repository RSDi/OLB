// GET /api/slack/connect?next=/portal/… — "Connect Slack" for Slack DMs
// (0118). Sends a grant holder to Slack to let the portal send DMs as them,
// then /api/slack/connect/callback brings them back to `next`. With
// ?popup=1 (the message window opens it in a pop-up) it ends on a page that
// closes itself instead.

import { NextResponse, type NextRequest } from "next/server";
import { requireSlackDm } from "../../../../lib/auth/guards";
import { getPreview } from "../../../../lib/activity/preview";
import { slackDmConfigured } from "../../../../lib/slack-dm/connection";
import { SLACK_DM_USER_SCOPES } from "../../../../lib/slack-dm/slack-user-api";
import { POPUP_RETURN, safeReturnPath } from "../../../../lib/slack-dm/recipients";
import { CALLBACK_PATH, CONNECT_COOKIE, CONNECT_PATH, backTo, newState, popupPage, stateCookie } from "../../../../lib/slack-dm/oauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const popup = req.nextUrl.searchParams.get("popup") === "1";
  const next = popup ? POPUP_RETURN : safeReturnPath(req.nextUrl.searchParams.get("next"));
  const stop = (outcome: string) => (popup ? popupPage(outcome) : NextResponse.redirect(backTo(origin, next, outcome)));
  const gate = await requireSlackDm();
  // Signed out, the portal page sends them to sign in.
  if ("error" in gate) return stop("not-allowed");
  // During "Preview as" the browser is signed in as the member: connecting
  // would give the super-admin a way to send as them.
  if (await getPreview()) return stop("preview");
  if (!slackDmConfigured()) return stop("not-set-up");

  const state = newState();
  const authorize = new URL("https://slack.com/oauth/v2/authorize");
  authorize.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!.trim());
  authorize.searchParams.set("user_scope", SLACK_DM_USER_SCOPES.join(","));
  authorize.searchParams.set("redirect_uri", origin + CALLBACK_PATH);
  authorize.searchParams.set("state", state);
  const team = process.env.SLACK_TEAM_ID?.trim();
  if (team) authorize.searchParams.set("team", team);

  const res = NextResponse.redirect(authorize);
  res.cookies.set(CONNECT_COOKIE, stateCookie(state, next), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: CONNECT_PATH,
  });
  return res;
}
