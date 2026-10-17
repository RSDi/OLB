// GET /api/film/youtube/callback — Google returns here with a code.
// Exchange it, encrypt the refresh token, save the channel, never send
// the token to the browser.

import { NextResponse, type NextRequest } from "next/server";
import { requireFilmManage } from "../../../../../lib/auth/guards";
import {
  YOUTUBE_CONNECT_COOKIE,
  exchangeYoutubeCode,
  readOAuthStateCookie,
  safeSettingsReturn,
  youtubeChannelMine,
} from "../../../../../lib/film/youtube-oauth";
import { saveYoutubeConnection } from "../../../../../lib/film/youtube-settings";
import { decryptSecret, encryptSecret, youtubeTokenKey } from "../../../../../lib/film/crypto";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const state = req.nextUrl.searchParams.get("state");
  const stored = readOAuthStateCookie(req.cookies.get(YOUTUBE_CONNECT_COOKIE)?.value, state);
  const next = safeSettingsReturn(stored?.next ?? "/portal/settings?tab=film");
  const done = (code: string) => {
    const url = new URL(next, origin);
    url.searchParams.set("tab", "film");
    url.searchParams.set("youtube", code);
    const res = NextResponse.redirect(url);
    res.cookies.set(YOUTUBE_CONNECT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!stored) return done("failed");
  const gate = await requireFilmManage();
  if ("error" in gate) return done("not-allowed");

  const err = req.nextUrl.searchParams.get("error");
  if (err) return done(err === "access_denied" ? "denied" : "failed");

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return done("failed");

  try {
    const tokens = await exchangeYoutubeCode(origin, code);
    // Round-trip encrypt so a bad FILM_YOUTUBE_TOKEN_KEY fails here, not later.
    const key = youtubeTokenKey();
    decryptSecret(encryptSecret(tokens.refreshToken, key), key);
    const channel = await youtubeChannelMine(tokens.accessToken);
    await saveYoutubeConnection({
      refreshToken: tokens.refreshToken,
      channelId: channel?.id ?? null,
      channelTitle: channel?.title ?? "YouTube",
      connectedBy: gate.userId,
    });
    return done("connected");
  } catch {
    return done("failed");
  }
}
