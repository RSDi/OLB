"use client";
// Mark the in-code release list as seen for this member. The panel calls this
// when it opens; the What's new toast calls it on dismiss. The window event
// clears any mounted toast immediately, then the marker is saved on
// members.releases_seen_version (0138).

import { loadReleasesSeen, saveReleasesSeen } from "./actions";
import { nextSeenVersion, RELEASES_SEEN_EVENT } from "./model";
import { RELEASES } from "./releases";

export async function markReleasesSeen(): Promise<void> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RELEASES_SEEN_EVENT));
  }
  try {
    const current = await loadReleasesSeen();
    const next = nextSeenVersion(RELEASES, current);
    if (next && next !== current) await saveReleasesSeen(next);
  } catch {
    /* offline — the toast just reappears next load */
  }
}
