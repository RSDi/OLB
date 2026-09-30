"use client";
// "Preview as" on a row of the Activity roster: a confirm step that says
// plainly what a preview is, then the server action. A full page load
// afterwards, so every cookie and server component is read as the member.
// `email` is set for a member who was invited but hasn't signed up: the
// confirm says their login gets set up first.

import { useEffect, useState, useTransition } from "react";
import { Icons } from "../../components/icons";
import { startPreview } from "./actions";

export function PreviewButton({ memberId, name, email }: { memberId: string; name: string; email: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="gw-press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 100,
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg-elev)",
          color: "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Icons.Eye width={14} height={14} />
        Preview as
      </button>
      {open && <PreviewConfirm memberId={memberId} name={name} email={email} onClose={() => setOpen(false)} />}
    </>
  );
}

function PreviewConfirm({
  memberId,
  name,
  email,
  onClose,
}: {
  memberId: string;
  name: string;
  email: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = name.split(/\s+/)[0] || name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await startPreview(memberId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.location.assign("/portal/directory");
    });

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (!pending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(12,12,14,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="rsd-card"
        style={{ width: "100%", maxWidth: 460, boxShadow: "var(--gw-shadow-3)" }}
      >
        <h2 id="preview-confirm-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          Preview as {name}?
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          You&apos;ll see the portal exactly as {first} does — same pages, same permissions. Anything you change
          really happens, as them. The preview is recorded with your name, when it started and when it ended, and
          ends by itself after 2 hours.
        </p>
        {email && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {first} hasn&apos;t signed up yet, so this sets up their portal login first. No email is sent. When they
            sign in with {email}, it&apos;s theirs.
          </p>
        )}
        {error && (
          <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="gw-press"
            style={{
              padding: "10px 18px",
              borderRadius: 100,
              border: "1px solid var(--gw-border)",
              background: "transparent",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="gw-press"
            style={{
              padding: "10px 18px",
              borderRadius: 100,
              border: "1px solid var(--rsd-accent-fill)",
              background: "var(--rsd-accent-fill)",
              color: "var(--rsd-accent-fill-on)",
              fontSize: 13,
              fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? "Starting…" : "Start preview"}
          </button>
        </div>
      </div>
    </div>
  );
}
