// Canonical URLs for the Archives area. Slack used to live at
// /portal/slack-archive; that still works via a hash-preserving client
// redirect (next.config redirects never see "#msg-…" — the browser keeps
// the hash off the wire). New links should use these helpers.

export const ARCHIVES_ROOT = "/portal/archives";
export const ARCHIVES_SLACK = "/portal/archives/slack";
export const ARCHIVES_ALBUM = "/portal/archives/album";
export const ARCHIVES_EMAIL = "/portal/archives/email";
export const LEGACY_SLACK_ARCHIVE = "/portal/slack-archive";

export function slackChannelHref(channelId: string): string {
  return `${ARCHIVES_SLACK}/${encodeURIComponent(channelId)}`;
}

export function slackSearchHref(): string {
  return `${ARCHIVES_SLACK}/search`;
}

export function slackExceptionsHref(): string {
  return `${ARCHIVES_SLACK}/exceptions`;
}

export function slackMediaHref(storagePath: string, opts: { download?: string } = {}): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  const query = opts.download ? `?download=${encodeURIComponent(opts.download)}` : "";
  return `${ARCHIVES_SLACK}/media/${encoded}${query}`;
}

export function albumHref(query = ""): string {
  return query ? `${ARCHIVES_ALBUM}?${query}` : ARCHIVES_ALBUM;
}

export function emailThreadHref(gmailThreadId: string): string {
  return `${ARCHIVES_EMAIL}/${encodeURIComponent(gmailThreadId)}`;
}

// Map an old /portal/slack-archive… pathname (no query, no hash) onto the
// Archives URL. Album is a sibling tab, not nested under Slack.
export function mapLegacySlackArchivePath(pathname: string): string | null {
  if (pathname === LEGACY_SLACK_ARCHIVE || pathname === `${LEGACY_SLACK_ARCHIVE}/`) {
    return ARCHIVES_SLACK;
  }
  if (!pathname.startsWith(`${LEGACY_SLACK_ARCHIVE}/`)) return null;
  const rest = pathname.slice(LEGACY_SLACK_ARCHIVE.length); // starts with /
  if (rest === "/album" || rest.startsWith("/album/")) {
    return `${ARCHIVES_ALBUM}${rest.slice("/album".length)}`;
  }
  return `${ARCHIVES_SLACK}${rest}`;
}
