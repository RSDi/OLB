"use client";

import { useEffect } from "react";
import { mapLegacySlackArchivePath } from "../../lib/slack-archive/paths";

// next.config redirects never see a URL hash (the browser keeps "#msg-…"
// off the wire), so old /portal/slack-archive links have to hop in the
// client to keep the message highlight.

export function HashRedirect({ to }: { to?: string }) {
  useEffect(() => {
    const dest = to ?? mapLegacySlackArchivePath(window.location.pathname);
    if (!dest) return;
    const url = new URL(dest, window.location.origin);
    url.search = window.location.search;
    window.location.replace(url.pathname + url.search + window.location.hash);
  }, [to]);
  return (
    <p style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
      Taking you to Archives…
    </p>
  );
}
