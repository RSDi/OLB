"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../components/icons";
import { SlackLogo } from "../components/SlackLogo";
import { createClient } from "../../lib/supabase/client";
import { friendlyAuthError } from "../../lib/auth/friendly-error";

export default function RegisterPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);

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
    const fullName = (fd.get("full_name") as string).trim();
    const email = (fd.get("email") as string).trim();
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;

    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message));
      setPending(false);
      return;
    }

    if (data.session) {
      // Email confirmation is off — session returned immediately. Let the
      // server resolve membership (handles bootstrap admin + pending insert
      // + admin notification in one place).
      const res = await fetch("/api/auth/post-signin", { method: "POST" });
      const result = res.ok
        ? ((await res.json()) as { status: "pending" | "approved" | "denied" })
        : { status: "pending" as const };

      if (result.status === "approved") {
        router.push("/portal");
        router.refresh();
      } else {
        await supabase.auth.signOut();
        router.push(`/login?status=${result.status}`);
      }
    } else {
      // Email confirmation is on — user must click the link first. The auth
      // callback runs the same resolveMembership flow on confirmation.
      setConfirmEmail(true);
      setPending(false);
    }
  }

  async function handleSlack() {
    setError(null);
    const supabase = createClient();
    const { error: slackError } = await supabase.auth.signInWithOAuth({
      provider: "slack_oidc",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser leaves for Slack and returns through /auth/callback,
    // where church-workspace sign-ins are approved on the spot.
    if (slackError) setError(friendlyAuthError(slackError.message));
  }

  if (confirmEmail) {
    return (
      <Shell>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "8px 0" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--rsd-accent-bg)", color: "var(--rsd-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(108,140,89,.2)",
          }}>
            <Icons.CheckCircle width={26} height={26}/>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.65 }}>
              We sent a confirmation link to your email. After confirming, your request will be reviewed by a building committee member before you can sign in.
            </div>
          </div>
          <Link href="/login" style={{ fontSize: 13, color: "var(--rsd-accent)", fontWeight: 600, textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Slack — the seamless path. Church-workspace members are approved on the
          spot, so this skips the committee review the email form below goes through. */}
      <button onClick={handleSlack} disabled={pending} style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        height: 44, borderRadius: 8, border: "1px solid var(--gw-stroke)",
        background: "var(--gw-surface)", color: "var(--gw-ink)",
        fontSize: 14, fontWeight: 700,
        cursor: pending ? "not-allowed" : "pointer", width: "100%",
      }}>
        <SlackLogo /> Continue with Slack
      </button>
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
        Already in the church’s Slack? This gets you in right away.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>or request access</span>
        <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Full name</span>
          <input
            name="full_name" type="text" autoComplete="name" required
            placeholder="Sarah Johnson" style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Email</span>
          <input
            name="email" type="email" autoComplete="email" required
            placeholder="you@example.com" style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Password</span>
          <input
            name="password" type="password" autoComplete="new-password" required
            placeholder="At least 8 characters" style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Confirm password</span>
          <input
            name="confirm" type="password" autoComplete="new-password" required
            placeholder="Repeat password" style={inputStyle}
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
          {pending ? "Creating account…" : "Request access"}
        </button>
      </form>

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "var(--gw-fg-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--rsd-accent)", fontWeight: 600, textDecoration: "none" }}>
          Sign in
        </Link>
      </div>
    </Shell>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600,
  color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase",
};

function Shell({ children }: { children: React.ReactNode }) {
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
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gw-ink)" }}>Request Access</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4 }}>Millard Community Church</div>
        </div>
        {children}
      </div>
    </div>
  );
}
