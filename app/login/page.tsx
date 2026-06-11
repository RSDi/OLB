"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Icons } from "../components/icons";
import { createClient } from "../../lib/supabase/client";
import { friendlyAuthError } from "../../lib/auth/friendly-error";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const urlError = searchParams.get("error");

  const [pending, setPending] = useState<"email" | "google" | "apple" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);

  async function checkMembersAndRedirect() {
    // Delegate to the server route: it bootstraps the admin from ADMIN_EMAILS
    // (if applicable), inserts a pending row for brand-new users, and returns
    // the resolved member status.
    const res = await fetch("/api/auth/post-signin", { method: "POST" });
    if (!res.ok) {
      const supabase = createClient();
      await supabase.auth.signOut();
      setError("Something went wrong signing in. Please try again.");
      return;
    }
    const { status } = (await res.json()) as {
      status: "pending" | "approved" | "denied";
    };

    if (status === "pending" || status === "denied") {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push(`/login?status=${status}`);
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  async function handleEmailPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending("email");
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Invalid email or password.");
      setPending(null);
      return;
    }

    await checkMembersAndRedirect();
    setPending(null);
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending("reset");
    setError(null);
    const email = (new FormData(e.currentTarget)).get("email") as string;
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setPending(null);
    if (resetError) { setError(friendlyAuthError(resetError.message)); return; }
    setResetSent(true);
  }

  async function signInWith(provider: "google" | "apple") {
    setPending(provider);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(friendlyAuthError(authError.message));
      setPending(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    height: 42, padding: "0 14px",
    border: "1px solid var(--gw-stroke)",
    borderRadius: 8, fontSize: 14,
    color: "var(--gw-ink)", background: "var(--gw-surface)",
    outline: "none", transition: "border-color 120ms",
    width: "100%", boxSizing: "border-box",
  };

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
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gw-ink)", lineHeight: 1.2 }}>
            Member Portal
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4 }}>
            Millard Community Church
          </div>
        </div>

        {status === "pending" ? (
          <StatusCard
            icon={<Icons.Clock width={26} height={26}/>}
            iconBg="var(--rsd-accent-bg)"
            iconColor="var(--rsd-accent)"
            title="Request submitted"
            body="Your request for access has been received. A building committee member will review it and follow up with you."
            action={{ label: "Try a different account", onClick: () => window.location.href = "/login" }}
          />
        ) : status === "denied" ? (
          <StatusCard
            icon={<Icons.Shield width={26} height={26}/>}
            iconBg="var(--gw-error-bg)"
            iconColor="var(--gw-error)"
            title="Access not granted"
            body="Your request for access was not approved. Contact the church directly if you believe this is an error."
            action={{ label: "Try a different account", onClick: () => window.location.href = "/login" }}
          />
        ) : mode === "reset" ? (
          <>
            {resetSent ? (
              <StatusCard
                icon={<Icons.CheckCircle width={26} height={26}/>}
                iconBg="var(--rsd-accent-bg)"
                iconColor="var(--rsd-accent)"
                title="Check your email"
                body="A password reset link has been sent. Click it to set a new password."
                action={{ label: "Back to sign in", onClick: () => { setMode("login"); setResetSent(false); } }}
              />
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                  Enter your email and we'll send a reset link.
                </div>
                <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Email</span>
                    <input
                      name="email" type="email" autoComplete="email" required
                      placeholder="you@example.com" style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
                    />
                  </label>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                  <button type="submit" disabled={pending !== null} style={{
                    height: 44, background: pending === "reset" ? "rgba(108,140,89,.6)" : "var(--rsd-accent)",
                    color: "var(--rsd-accent-on)", border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 700,
                    cursor: pending !== null ? "not-allowed" : "pointer",
                  }}>
                    {pending === "reset" ? "Sending…" : "Send reset link"}
                  </button>
                </form>
                <button onClick={() => { setMode("login"); setError(null); }}
                  style={{ marginTop: 14, fontSize: 13, color: "var(--gw-fg-muted)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icons.ChevronLeft width={12} height={12}/> Back to sign in
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {/* Email / password */}
            <form onSubmit={handleEmailPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Email</span>
                <input
                  name="email" type="email" autoComplete="email" required
                  placeholder="you@example.com" style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Password</span>
                  <button type="button" onClick={() => { setMode("reset"); setError(null); }}
                    style={{ fontSize: 12, color: "var(--rsd-accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    Forgot password?
                  </button>
                </div>
                <input
                  name="password" type="password" autoComplete="current-password" required
                  placeholder="••••••••" style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
                />
              </label>

              {(error || urlError) && <ErrorMsg>{error ?? "Something went wrong. Please try again."}</ErrorMsg>}

              <button type="submit" disabled={pending !== null} style={{
                marginTop: 2, height: 44,
                background: pending === "email" ? "rgba(108,140,89,.6)" : "var(--rsd-accent)",
                color: "var(--rsd-accent-on)", border: "none", borderRadius: 8,
                fontSize: 14, fontWeight: 700,
                cursor: pending !== null ? "not-allowed" : "pointer",
                transition: "background 120ms",
              }}>
                {pending === "email" ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
            </div>

            {/* OAuth */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <OAuthButton onClick={() => signInWith("google")} disabled={pending !== null} loading={pending === "google"} faded={pending !== null && pending !== "google"}>
                <GoogleIcon />
                {pending === "google" ? "Redirecting…" : "Continue with Google"}
              </OAuthButton>
              <OAuthButton onClick={() => signInWith("apple")} disabled={pending !== null} loading={pending === "apple"} faded={pending !== null && pending !== "apple"}>
                <AppleIcon />
                {pending === "apple" ? "Redirecting…" : "Continue with Apple"}
              </OAuthButton>
            </div>
          </>
        )}

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--gw-stroke)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {!status && (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              New here?{" "}
              <Link href="/register" style={{ color: "var(--rsd-accent)", fontWeight: 600, textDecoration: "none" }}>
                Request access
              </Link>
            </div>
          )}
          <Link href="/" style={{ fontSize: 13, color: "var(--gw-fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icons.ChevronLeft width={13} height={13}/>
            Back to church site
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: "var(--gw-error)",
      background: "var(--gw-error-bg)",
      border: "1px solid rgba(229,62,62,0.2)",
      borderRadius: 8, padding: "10px 14px",
    }}>
      {children}
    </div>
  );
}

function StatusCard({ icon, iconBg, iconColor, title, body, action }: {
  icon: React.ReactNode;
  iconBg: string; iconColor: string;
  title: string; body: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: iconBg, color: iconColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${iconColor}33`,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, letterSpacing: "-.01em" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.65 }}>{body}</div>
      </div>
      <button onClick={action.onClick} style={{ fontSize: 13, color: "var(--rsd-accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginTop: 4 }}>
        {action.label}
      </button>
    </div>
  );
}

function OAuthButton({ children, onClick, disabled, loading, faded }: {
  children: React.ReactNode; onClick: () => void;
  disabled: boolean; loading: boolean; faded: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      height: 44, borderRadius: 8, border: "1px solid var(--gw-stroke)",
      background: loading ? "var(--gw-surface-2)" : "var(--gw-surface)",
      color: "var(--gw-ink)", fontSize: 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background 120ms",
      opacity: faded ? 0.45 : 1, width: "100%",
    }}>
      {children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 814 1000" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.3 172.5 46.3 43.1 0 110.8-49 191.6-49 30.8 0 108.2 2.6 168.1 71.9zm-134.5-199.5c32.4-38.2 55.5-91.2 55.5-144.2 0-7.7-.6-15.4-1.9-21.7-52.6 2-115 35-152.2 78.3-29.5 33.8-57.6 86.8-57.6 140.5 0 8.3 1.3 16.6 1.9 19.2 3.2.6 8.3 1.3 13.4 1.3 47.4 0 107.3-32 140.9-73.4z"/>
    </svg>
  );
}
