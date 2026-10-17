"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FormError } from "../../_components/AuthForm";
import auth from "../../_components/auth.module.css";
import styles from "../../_components/site.module.css";
import { cx } from "../../_components/util";
import pair from "./pair-approve.module.css";

export type PairViewState = "choose" | "approved" | "consumed" | "denied" | "expired" | "blocked";

export function PairApproveScreen({
  id,
  name,
  device,
  city,
  ip,
  askedAt,
  codes,
  initialState = "choose",
  blockedReason,
}: {
  id: string;
  name: string;
  device: string;
  city: string | null;
  ip: string | null;
  askedAt: string;
  codes: string[];
  initialState?: PairViewState;
  blockedReason?: string;
}) {
  const [state, setState] = useState<PairViewState>(initialState);
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "deny" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "approved") return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/auth/pair/status?id=${encodeURIComponent(id)}`);
        const data = (await res.json()) as { status?: string };
        if (data.status === "consumed") setState("consumed");
        if (data.status === "expired" || data.status === "revoked") setState("expired");
      } catch {
        /* keep waiting */
      }
    };
    const t = setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [state, id]);

  async function decide(action: "approve" | "deny") {
    if (action === "approve" && !picked) {
      setError("Pick the code that matches the other screen.");
      return;
    }
    setPending(action);
    setError(null);
    try {
      const res = await fetch("/api/auth/pair/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, code: picked }),
      });
      const data = (await res.json()) as { status?: string; error?: string; message?: string };
      if (data.error === "wrong_code") {
        setState("denied");
        setError("That code didn't match. Start over on the other screen.");
        return;
      }
      if (data.error === "rate_limited") {
        setError(data.message ?? "Too many approvals. Try again later.");
        return;
      }
      if (!res.ok) {
        setState("expired");
        return;
      }
      setState(action === "deny" ? "denied" : "approved");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function revoke() {
    setPending("revoke");
    setError(null);
    try {
      const res = await fetch("/api/auth/pair/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setError("Couldn't sign that device out. Try Signed-in devices.");
        return;
      }
      setState("denied");
    } catch {
      setError("Couldn't sign that device out.");
    } finally {
      setPending(null);
    }
  }

  const primary = cx(styles.button, auth.action);
  const outline = cx(styles.button, auth.action, auth.outline);

  if (state === "blocked") {
    return (
      <Note title="Can't approve this">
        {blockedReason ?? "This account isn't allowed to approve a new device."}
      </Note>
    );
  }

  if (state === "expired") {
    return (
      <Note title="This sign-in expired">
        Codes last 3 minutes. Start again on the other screen.
      </Note>
    );
  }

  if (state === "denied") {
    return (
      <Note title="Denied">
        {error ?? "That device was not signed in. If you still need it, start again on the other screen."}
      </Note>
    );
  }

  if (state === "consumed" || state === "approved") {
    return (
      <>
        <Note title={state === "consumed" ? "Device signed in" : "Approved"}>
          {state === "consumed"
            ? "The other screen is signed in. You can sign it out from here if that wasn't you."
            : "The other screen should sign in in a few seconds."}
        </Note>
        {error && <FormError>{error}</FormError>}
        <button type="button" className={outline} disabled={pending !== null} onClick={() => void revoke()}>
          {pending === "revoke" ? "Signing it out…" : "Sign it out"}
        </button>
        <div className={auth.more}>
          <Link href="/portal/devices" className={auth.link}>
            Signed-in devices
          </Link>
        </div>
      </>
    );
  }

  const place = [city, ip].filter(Boolean).join(" · ");

  return (
    <div data-tour="pair-approve">
      <p className={auth.note}>
        Sign in a new device to the member portal as <strong>{name}</strong>?
      </p>
      <dl className={pair.meta}>
        <div>
          <dt>Device</dt>
          <dd>{device}</dd>
        </div>
        {place && (
          <div>
            <dt>Where</dt>
            <dd>{place}</dd>
          </div>
        )}
        <div>
          <dt>Asked</dt>
          <dd>{askedAt}</dd>
        </div>
      </dl>
      <p className={pair.warn}>
        Only approve if you are looking at this screen right now. Omaha Lightning will never send you this
        code.
      </p>
      <p className={pair.pickLabel}>Pick the code on the other screen</p>
      <div className={pair.codes} role="group" aria-label="Codes">
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            className={cx(pair.codeBtn, picked === code && pair.codeOn)}
            onClick={() => {
              setPicked(code);
              setError(null);
            }}
          >
            {code}
          </button>
        ))}
      </div>
      {error && <FormError>{error}</FormError>}
      <div className={pair.actions}>
        <button
          type="button"
          className={primary}
          disabled={pending !== null}
          onClick={() => void decide("approve")}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className={outline}
          disabled={pending !== null}
          onClick={() => void decide("deny")}
        >
          {pending === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
    </div>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.text}>
      <h3 className={auth.statusTitle}>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
