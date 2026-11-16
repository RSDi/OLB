// Turns the upload worker's reasons for skipping a tick into one sentence
// for the film page. Pure, so it's unit tested.

export const YOUTUBE_RECONNECT_HINT = "Someone who manages film can fix it: Settings → Film → Connect again.";

/**
 * `skipped` is the worker's own reason. Returns the message to show, or
 * undefined for a passing hiccup (a network blip) that shouldn't change
 * what the page says.
 */
export function youtubeWorkerProblem(skipped: string): string | undefined {
  const s = skipped.toLowerCase();
  if (s.includes("oauth env")) return "YouTube isn't set up on the server, so videos can't upload.";
  if (s.includes("isn't connected")) return `No YouTube channel is connected, so videos can't upload. ${YOUTUBE_RECONNECT_HINT}`;
  if (
    s.includes("invalid_grant") ||
    s.includes("expired or revoked") ||
    s.includes("invalid_client") ||
    s.includes("unauthorized_client") ||
    s.includes("decrypt") ||
    s.includes("film_youtube_token_key")
  ) {
    return `The YouTube login expired, so videos are waiting to upload. ${YOUTUBE_RECONNECT_HINT}`;
  }
  return undefined;
}
