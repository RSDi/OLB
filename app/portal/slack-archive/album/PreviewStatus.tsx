"use client";

import { useState, useTransition } from "react";
import { triggerThumbnailWorkflow } from "../../../../lib/slack-archive/thumbnail-actions";
import type { WorkflowRunStatus } from "../../../../lib/slack-archive/github-workflows";

// Shown under the album's summary only while some photos and videos still
// lack previews — explains why the grid may load slowly, and lets a super
// admin start the preview job instead of waiting for tonight's run.
export function PreviewStatus({ missing, lastRun }: { missing: number; lastRun: WorkflowRunStatus | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const running = lastRun !== null && lastRun.status !== "completed";
  const lastFailed = lastRun?.status === "completed" && lastRun.conclusion === "failure";

  function start() {
    setMessage(null);
    startTransition(async () => {
      const res = await triggerThumbnailWorkflow();
      setMessage(
        res.error
          ? { text: `Couldn’t start: ${res.error}`, error: true }
          : { text: "Started. Previews take a few minutes — reload to see them.", error: false },
      );
    });
  }

  return (
    <div className="rsd-album-notice" role="status">
      <span>
        {missing === 1 ? "1 photo or video doesn’t" : `${missing.toLocaleString("en-US")} photos and videos don’t`} have
        a preview yet, so {missing === 1 ? "it loads" : "they load"} at full size. Previews are made nightly.
      </span>
      {message ? (
        <span className={message.error ? "rsd-album-notice-error" : undefined}>{message.text}</span>
      ) : running ? (
        <a href={lastRun.htmlUrl} target="_blank" rel="noopener noreferrer">
          Making previews now — reload in a few minutes
        </a>
      ) : (
        <>
          <button type="button" onClick={start} disabled={pending}>
            {pending ? "Starting…" : "Make previews now"}
          </button>
          {lastFailed && (
            <a href={lastRun.htmlUrl} target="_blank" rel="noopener noreferrer" className="rsd-album-notice-error">
              Last run failed
            </a>
          )}
        </>
      )}
    </div>
  );
}
