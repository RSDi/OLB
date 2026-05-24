"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    height: 42, padding: "0 14px",
    border: "1px solid var(--gw-stroke)",
    borderRadius: 8, fontSize: 14,
    color: "var(--gw-ink)", background: "var(--gw-surface)",
    outline: "none", transition: "border-color 120ms",
    width: "100%", boxSizing: "border-box",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    router.push("/portal");
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "var(--gw-surface-2)", fontFamily: "var(--gw-font)",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, margin: "0 24px",
        background: "var(--gw-surface)",
        border: "1px solid var(--gw-stroke)",
        borderRadius: 16, padding: 40,
        boxShadow: "var(--gw-shadow-3)",
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gw-ink)" }}>Set new password</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4 }}>Millard Community Church</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>New password</span>
            <input
              name="password" type="password" autoComplete="new-password"
              placeholder="At least 8 characters" required style={inputStyle}
              onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Confirm password</span>
            <input
              name="confirm" type="password" autoComplete="new-password"
              placeholder="Repeat password" required style={inputStyle}
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

          <button type="submit" disabled={pending} style={{
            marginTop: 2, height: 44,
            background: pending ? "rgba(108,140,89,.6)" : "var(--rsd-accent)",
            color: "var(--rsd-accent-on)", border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
            transition: "background 120ms",
          }}>
            {pending ? "Saving…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
