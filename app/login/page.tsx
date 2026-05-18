"use client";
import { useState } from "react";
import Link from "next/link";
import { Icons } from "../components/icons";

const inputStyle: React.CSSProperties = {
  height: 42, padding: "0 14px",
  border: "1px solid var(--gw-stroke)",
  borderRadius: 8, fontSize: 14,
  color: "var(--gw-ink)", background: "var(--gw-surface)",
  outline: "none", transition: "border-color 120ms",
  width: "100%", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600,
  color: "var(--gw-fg-muted)", letterSpacing: "0.04em",
  textTransform: "uppercase", marginBottom: 6, display: "block",
};

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    await new Promise(r => setTimeout(r, 800));
    setPending(false);
    setError("Invalid email or password. (Auth coming soon — connect Supabase to enable.)");
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "var(--gw-surface-2)", fontFamily: "var(--gw-font)",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, margin: "0 24px",
        background: "var(--gw-surface)",
        border: "1px solid var(--gw-stroke)",
        borderRadius: 16, padding: 40,
        boxShadow: "var(--gw-shadow-3)",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gw-ink)", lineHeight: 1.2 }}>
            Member Portal
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4 }}>
            Millard Community Church
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginBottom: 24 }}>
          Sign in to continue
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label>
            <span style={labelStyle}>Email</span>
            <input
              name="email" type="email" autoComplete="email" required
              placeholder="you@millardcommunitychurch.com"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
            />
          </label>

          <label>
            <span style={labelStyle}>Password</span>
            <input
              name="password" type="password" autoComplete="current-password" required
              placeholder="••••••••"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
            />
          </label>

          {error && (
            <div style={{
              fontSize: 13, color: "var(--gw-error)",
              background: "var(--gw-error-bg)",
              border: "1px solid rgba(229,62,62,0.2)",
              borderRadius: 8, padding: "10px 14px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 4, height: 44,
              background: pending ? "rgba(108,140,89,.6)" : "var(--rsd-accent)",
              color: "var(--rsd-accent-on)", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background 120ms",
            }}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--gw-stroke)", textAlign: "center" }}>
          <Link href="/" style={{ fontSize: 13, color: "var(--gw-fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icons.ChevronLeft width={13} height={13}/>
            Back to church site
          </Link>
        </div>
      </div>
    </div>
  );
}
