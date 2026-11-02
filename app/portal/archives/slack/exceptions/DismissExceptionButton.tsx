"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissArchiveException } from "../../../../../lib/slack-archive/exception-actions";

export function DismissExceptionButton({ messageId, fileId }: { messageId: string; fileId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await dismissArchiveException(messageId, fileId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      {" · "}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rsd-link"
        style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--rsd-accent)", cursor: pending ? "default" : "pointer" }}
      >
        {pending ? "Dismissing…" : "Dismiss"}
      </button>
      {error && <span style={{ color: "var(--gw-error)", marginLeft: 8 }}>{error}</span>}
    </>
  );
}
