// Google OAuth for the club YouTube channel. Server-only.
// youtube.upload — resumable videos.insert
// youtube.readonly — channel name + playlists.list + videos.list part=status
// youtube — playlistItems.insert and videos.update (upload/readonly are not enough)
// After adding youtube on the consent screen, Jeff must Disconnect + Connect
// again so Google issues a refresh token with the new scope.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const YOUTUBE_CONNECT_COOKIE = "olb_yt_oauth";
export const YOUTUBE_CONNECT_PATH = "/api/film/youtube/connect";
export const YOUTUBE_CALLBACK_PATH = "/api/film/youtube/callback";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube",
];
export const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function youtubeClientId(env: Record<string, string | undefined> = process.env): string {
  return (env.FILM_YOUTUBE_CLIENT_ID ?? "").trim();
}

export function youtubeClientSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.FILM_YOUTUBE_CLIENT_SECRET ?? "").trim();
}

export function youtubeOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(youtubeClientId(env) && youtubeClientSecret(env) && (env.FILM_YOUTUBE_TOKEN_KEY ?? "").trim());
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function oauthStateCookie(state: string, next: string): string {
  return JSON.stringify({ h: hash(state), next });
}

export function readOAuthStateCookie(raw: string | undefined, state: string | null): { next: string } | null {
  if (!raw || !state) return null;
  let parsed: { h?: unknown; next?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.h !== "string" || typeof parsed.next !== "string") return null;
  const a = Buffer.from(parsed.h);
  const b = Buffer.from(hash(state));
  return a.length === b.length && timingSafeEqual(a, b) ? { next: parsed.next } : null;
}

export function safeSettingsReturn(raw: string | null): string {
  if (raw && raw.startsWith("/portal/settings")) return raw;
  return "/portal/settings?tab=film";
}

export function youtubeAuthorizeUrl(origin: string, state: string, env: Record<string, string | undefined> = process.env): string {
  const url = new URL(YOUTUBE_AUTH_URL);
  url.searchParams.set("client_id", youtubeClientId(env));
  url.searchParams.set("redirect_uri", `${origin}${YOUTUBE_CALLBACK_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeYoutubeCode(
  origin: string,
  code: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: youtubeClientId(env),
    client_secret: youtubeClientSecret(env),
    redirect_uri: `${origin}${YOUTUBE_CALLBACK_PATH}`,
    grant_type: "authorization_code",
  });
  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google didn't return a token.");
  }
  if (!json.refresh_token) {
    throw new Error("Google didn't send a refresh token. Disconnect the app in the Google account and connect again.");
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

// Google answers invalid_grant when the saved login was revoked or expired.
// An OAuth app still in Testing mode loses it 7 days after Connect.
export const YOUTUBE_LOGIN_EXPIRED =
  "The YouTube login expired. Disconnect YouTube and Connect YouTube again in Settings → Film.";

export async function refreshYoutubeAccess(
  refreshToken: string,
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: youtubeClientId(env),
    client_secret: youtubeClientSecret(env),
    grant_type: "refresh_token",
  });
  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new Error(YOUTUBE_LOGIN_EXPIRED);
    throw new Error(json.error_description || json.error || "Couldn't refresh the YouTube token.");
  }
  return json.access_token;
}

export async function youtubeChannelMine(
  accessToken: string
): Promise<{ id: string; title: string } | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as {
    items?: { id?: string; snippet?: { title?: string } }[];
  };
  const item = json.items?.[0];
  if (!item?.id) return null;
  return { id: item.id, title: item.snippet?.title?.trim() || "YouTube" };
}
