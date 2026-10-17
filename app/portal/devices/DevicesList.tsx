"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clubTime, describeDevice } from "../../../lib/auth/pairing";

export interface DeviceRow {
  id: string;
  device_ua: string;
  device_city: string | null;
  device_ip: string | null;
  consumed_at: string | null;
  session_expires_at: string | null;
}

export function DevicesList({ devices, highlightId }: { devices: DeviceRow[]; highlightId?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id?: string) {
    setPending(id ?? "all");
    setError(null);
    try {
      const res = await fetch("/api/auth/pair/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      if (!res.ok) {
        setError("Couldn't sign that device out.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't sign that device out.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }} data-tour="signed-in-devices">
      {error && <p className="rsd-error">{error}</p>}
      {devices.length === 0 ? (
        <p className="rsd-muted">No phone-paired devices are signed in.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {devices.map((d) => (
            <li
              key={d.id}
              className="rsd-card"
              style={{
                padding: "16px 18px",
                gap: 8,
                outline: highlightId === d.id ? "2px solid var(--rsd-accent, #fbcb44)" : undefined,
              }}
            >
              <strong>{describeDevice(d.device_ua)}</strong>
              <span className="rsd-muted">
                {[d.device_city, d.device_ip].filter(Boolean).join(" · ") || "Location unknown"}
              </span>
              <span className="rsd-muted">
                Signed in {d.consumed_at ? clubTime(d.consumed_at) : "—"}
                {d.session_expires_at ? ` · until ${clubTime(d.session_expires_at)}` : ""}
              </span>
              <button
                type="button"
                className="rsd-btn rsd-btn-secondary"
                disabled={pending !== null}
                onClick={() => void revoke(d.id)}
              >
                {pending === d.id ? "Signing out…" : "Sign out"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {devices.length > 0 && (
        <button
          type="button"
          className="rsd-btn rsd-btn-secondary"
          disabled={pending !== null}
          onClick={() => void revoke()}
        >
          {pending === "all" ? "Signing out…" : "Sign out all devices"}
        </button>
      )}
    </div>
  );
}
