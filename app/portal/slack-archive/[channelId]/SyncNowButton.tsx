"use client";

import { useState, useTransition } from "react";
import { Pill } from "../../../components/ui";
import { syncChannelNow } from "../../../../lib/slack-archive/channel-actions";

// Syncs just this one channel on demand, instead of waiting for its turn in
// the nightly cron's shared time budget across every registered channel —
// useful right after re-inviting the bot to a channel that's fallen behind,
// or whenever you don't want to wait until the next scheduled run.
export function SyncNowButton({ slackChannelId }: { slackChannelId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const res = await syncChannelNow(slackChannelId);
      if (res.error) {
        setMessage(`Failed: ${res.error}`);
        return;
      }
      const s = res.summary!;
      const parts = [`${s.new_or_updated} message${s.new_or_updated === 1 ? "" : "s"} synced`];
      if (s.files_stored > 0) parts.push(`${s.files_stored} file${s.files_stored === 1 ? "" : "s"} stored`);
      if (!s.done) parts.push("more to catch up — click again");
      setMessage(parts.join(", "));
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Pill variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Pill>
      {message && (
        <span style={{ fontSize: 11.5, color: message.startsWith("Failed") ? "var(--gw-error)" : "var(--gw-fg-muted)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
