"use client";

import { useState, useTransition } from "react";
import { Pill } from "../../../components/ui";
import { triggerCompressionWorkflow, type CompressionRunStatus } from "../../../../lib/slack-archive/compress-actions";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusLabel(run: CompressionRunStatus): string {
  if (run.status !== "completed") return run.status === "in_progress" ? "running" : "queued";
  return run.conclusion ?? "completed";
}

export function CompressTriggerButton({ lastRun }: { lastRun: CompressionRunStatus | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const res = await triggerCompressionWorkflow();
      setMessage(res.error ? `Failed: ${res.error}` : "Triggered — check back in a few minutes.");
    });
  }

  const label = lastRun ? statusLabel(lastRun) : null;
  const labelColor = label === "failure" ? "var(--gw-error)" : "var(--gw-fg-muted)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Pill variant="accent" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Triggering…" : "Compress large files now"}
      </Pill>
      {message ? (
        <span style={{ fontSize: 11.5, color: message.startsWith("Failed") ? "var(--gw-error)" : "var(--gw-fg-muted)" }}>
          {message}
        </span>
      ) : lastRun ? (
        <a
          href={lastRun.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11.5, color: labelColor, textDecoration: "none" }}
        >
          Last run: {label} · {timeAgo(lastRun.createdAt)}
        </a>
      ) : null}
    </div>
  );
}
