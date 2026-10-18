// GET /api/film/youtube/connect — send a film_manage holder to Google so
// the club YouTube channel can receive auto-uploads. Callback stores the
// refresh token encrypted.

import { NextResponse, type NextRequest } from "next/server";
import { requireFilmManage } from "../../../../../lib/auth/guards";
import { getPreview } from "../../../../../lib/activity/preview";
import {
  YOUTUBE_CONNECT_COOKIE,
  newOAuthState,
  oauthStateCookie,
  safeSettingsReturn,
  youtubeAuthorizeUrl,
  youtubeOAuthConfigured,
} from "../../../../../lib/film/youtube-oauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const next = safeSettingsReturn(req.nextUrl.searchParams.get("next"));
  const fail = (code: string) => {
    const url = new URL(next, origin);
    url.searchParams.set("tab", "film");
    url.searchParams.set("youtube", code);
    return NextResponse.redirect(url);
  };

  const gate = await requireFilmManage();
  if ("error" in gate) return fail("not-allowed");
  if (await getPreview()) return fail("preview");
  if (!youtubeOAuthConfigured()) return fail("not-set-up");

  const state = newOAuthState();
  const res = NextResponse.redirect(youtubeAuthorizeUrl(origin, state));
  res.cookies.set(YOUTUBE_CONNECT_COOKIE, oauthStateCookie(state, next), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
