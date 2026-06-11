"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Icons } from "../components/icons";
import { createClient } from "../../lib/supabase/client";
import { friendlyAuthError } from "../../lib/auth/friendly-error";

// Sign-in paths (A2): email+password, or an emailed one-time code for folks
// who don't do passwords. "Forgot password?" rides the same code flow — verify a
// code, you're signed in, then we take you straight to set a new password.
// Google/Apple OAuth buttons were removed 2026-06-11: neither provider is
// enabled in Supabase, so the buttons only produced errors. Restore them once
// the providers are actually configured. An SMS "text me a code" option can
// slot in next to the email-code button later.

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

type Mode = "login" | "code";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const urlError = searchParams.get("error");

  const [pending, setPending] = useState<"email" | "code-send" | "code-verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  // Code flow state. forReset = arrived via "Forgot password?" — after the
  // code checks out we go set a new password instead of the dashboard.
  const [forReset, setForReset] = useState(false);
  const [codeEmail, setCodeEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [canResend, setCanResend] = useState(false);

  async function checkMembersAndRedirect(next?: string) {
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

    router.push(next ?? "/portal");
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

  function enterCodeMode(reset: boolean) {
    setMode("code");
    setForReset(reset);
    setCodeSent(false);
    setCanResend(false);
    setError(null);
  }

  async function sendCode(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const email = codeEmail.trim();
    if (!email) return;
    setPending("code-send");
    setError(null);

    const supabase = createClient();
    // shouldCreateUser:false — codes sign in existing accounts only; new
    // folks go through Request access so the committee approval flow holds.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setPending(null);
    if (otpError) {
      setError(friendlyAuthError(otpError.message));
      return;
    }
    setCodeSent(true);
    setCanResend(false);
    setTimeout(() => setCanResend(true), 30_000);
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = (new FormData(e.currentTarget).get("token") as string).replace(/\D/g, "");
    if (token.length < 6) {
      setError("Type the whole code from the email.");
      return;
    }
    setPending("code-verify");
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: codeEmail.trim(),
      token,
      type: "email",
    });
    if (verifyError) {
      setError(friendlyAuthError(verifyError.message));
      setPending(null);
      return;
    }

    await checkMembersAndRedirect(forReset ? "/reset-password" : undefined);
    setPending(null);
  }

  const inputStyle: React.CSSProperties = {
    height: 42, padding: "0 14px",
    border: "1px solid var(--gw-stroke)",
    borderRadius: 8, fontSize: 14,
    color: "var(--gw-ink)", background: "var(--gw-surface)",
    outline: "none", transition: "border-color 120ms",
    width: "100%", boxSizing: "border-box",
  };

  const primaryBtn = (isPending: boolean): React.CSSProperties => ({
    height: 44,
    background: isPending ? "rgba(108,140,89,.6)" : "var(--rsd-accent)",
    color: "var(--rsd-accent-on)", border: "none", borderRadius: 8,
    fontSize: 14, fontWeight: 700,
    cursor: pending !== null ? "not-allowed" : "pointer",
    transition: "background 120ms",
  });

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
        ) : mode === "code" ? (
          <>
            {!codeSent ? (
              <>
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                  {forReset
                    ? "No problem — we'll email you a sign-in code. Type it in and you can set a new password."
                    : "We'll email you a sign-in code. Type it in and you're signed in — no password needed."}
                </div>
                <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Email</span>
                    <input
                      name="email" type="email" autoComplete="email" required
                      placeholder="you@example.com" style={inputStyle}
                      value={codeEmail}
                      onChange={e => setCodeEmail(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
                    />
                  </label>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                  <button type="submit" disabled={pending !== null} style={primaryBtn(pending === "code-send")}>
                    {pending === "code-send" ? "Sending…" : "Email me a code"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                  Check your email — we sent a sign-in code to <strong>{codeEmail.trim()}</strong>.
                  It can take a minute to arrive. If the email shows a sign-in button instead of a
                  code, tapping the button works too.
                </div>
                <form onSubmit={verifyCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Code from the email</span>
                    <input
                      name="token"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={10}
                      required
                      placeholder="••••••"
                      autoFocus
                      style={{
                        ...inputStyle,
                        height: 54,
                        fontSize: 24,
                        letterSpacing: ".4em",
                        textAlign: "center",
                        fontWeight: 700,
                      }}
                      onFocus={e => (e.target.style.borderColor = "var(--rsd-accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--gw-stroke)")}
                    />
                  </label>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                  <button type="submit" disabled={pending !== null} style={primaryBtn(pending === "code-verify")}>
                    {pending === "code-verify" ? "Checking…" : forReset ? "Continue" : "Sign in"}
                  </button>
                </form>
                <button
                  onClick={() => sendCode()}
                  disabled={!canResend || pending !== null}
                  style={{
                    marginTop: 12, fontSize: 13,
                    color: canResend ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                    background: "none", border: "none",
                    cursor: canResend ? "pointer" : "default", fontWeight: 600,
                  }}
                >
                  {canResend ? "Send a new code" : "You can request another code in a moment…"}
                </button>
              </>
            )}
            <button onClick={() => { setMode("login"); setError(null); }}
              style={{ marginTop: 14, fontSize: 13, color: "var(--gw-fg-muted)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Icons.ChevronLeft width={12} height={12}/> Back to sign in
            </button>
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
                  <button type="button" onClick={() => enterCodeMode(true)}
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

              <button type="submit" disabled={pending !== null} style={{ ...primaryBtn(pending === "email"), marginTop: 2 }}>
                {pending === "email" ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--gw-stroke)" }}/>
            </div>

            {/* Passwordless */}
            <button
              onClick={() => enterCodeMode(false)}
              disabled={pending !== null}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                height: 44, borderRadius: 8, border: "1px solid var(--gw-stroke)",
                background: "var(--gw-surface)",
                color: "var(--gw-ink)", fontSize: 13, fontWeight: 600,
                cursor: pending !== null ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              <Icons.Mail width={16} height={16} />
              Email me a sign-in code
            </button>
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
