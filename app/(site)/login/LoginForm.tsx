"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlackLogo } from "../../components/SlackLogo";
import { createClient } from "../../../lib/supabase/client";
import { friendlyAuthError } from "../../../lib/auth/friendly-error";
import { FormError, Or, StatusNote } from "../_components/AuthForm";
import auth from "../_components/auth.module.css";
import styles from "../_components/site.module.css";
import { cx } from "../_components/util";

// Sign-in paths (A2): email+password, or an emailed one-time code for folks
// who don't do passwords. "Forgot password?" rides the same code flow — verify a
// code, you're signed in, then we take you straight to set a new password.
// Google/Apple OAuth buttons were removed 2026-06-11: neither provider is
// enabled in Supabase, so the buttons only produced errors. Restore them once
// the providers are actually configured. An SMS "text me a code" option can
// slot in next to the email-code button later.

type Mode = "login" | "code";

const primary = cx(styles.button, auth.action);
const outline = cx(styles.button, auth.action, auth.outline);

export function LoginForm({
  status,
  urlError,
}: {
  // ?status= — where sign-up and sign-in send people who aren't approved yet.
  status: string | null;
  // ?error= — set by the auth callback when a sign-in link fails.
  urlError: string | null;
}) {
  const router = useRouter();

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

  async function handleSlack() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "slack_oidc",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser redirects to Slack and back through /auth/callback.
    if (error) setError(friendlyAuthError(error.message));
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
    // folks go through Request access so the approval flow holds.
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

  if (status === "pending" || status === "denied") {
    return (
      <>
        {status === "pending" ? (
          <StatusNote title="Request submitted">
            Your request for access has been received. Someone from the club will review it and follow up
            with you.
          </StatusNote>
        ) : (
          <StatusNote title="Access not granted">
            Your request for access was not approved. If you think that’s a mistake, please{" "}
            <Link href="/contact">contact us</Link>.
          </StatusNote>
        )}
        <div className={auth.more}>
          <button type="button" className={auth.link} onClick={() => (window.location.href = "/login")}>
            Try a different account
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {mode === "code" ? (
        !codeSent ? (
          <>
            <p className={auth.note}>
              {forReset
                ? "No problem — we’ll email you a sign-in code. Type it in and you can set a new password."
                : "We’ll email you a sign-in code. Type it in and you’re signed in — no password needed."}
            </p>
            <form key="send" onSubmit={sendCode} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="code-email" className={styles.fieldTitle}>
                  Email
                </label>
                <input
                  id="code-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={codeEmail}
                  onChange={(e) => setCodeEmail(e.target.value)}
                  className={styles.input}
                />
              </div>
              {error && <FormError>{error}</FormError>}
              <button type="submit" disabled={pending !== null} className={primary}>
                {pending === "code-send" ? "Sending…" : "Email me a code"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className={auth.note}>
              Check your email — we sent a sign-in code to <strong>{codeEmail.trim()}</strong>. It can take a
              minute to arrive. If the email shows a sign-in button instead of a code, tapping the button works
              too.
            </p>
            {/* Keyed apart from the send form, so the code box starts empty
                instead of React reusing the email input (and its text). */}
            <form key="verify" onSubmit={verifyCode} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="code-token" className={styles.fieldTitle}>
                  Code from the email
                </label>
                <input
                  id="code-token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  required
                  placeholder="••••••"
                  autoFocus
                  className={cx(styles.input, auth.code)}
                />
              </div>
              {error && <FormError>{error}</FormError>}
              <button type="submit" disabled={pending !== null} className={primary}>
                {pending === "code-verify" ? "Checking…" : forReset ? "Continue" : "Sign in"}
              </button>
            </form>
            <p className={auth.hint}>
              <button
                type="button"
                onClick={() => sendCode()}
                disabled={!canResend || pending !== null}
                className={auth.link}
              >
                {canResend ? "Send a new code" : "You can request another code in a moment…"}
              </button>
            </p>
          </>
        )
      ) : (
        <>
          {/* Slack — the seamless path for members of the site's workspace */}
          <button type="button" onClick={handleSlack} disabled={pending !== null} className={outline}>
            <SlackLogo /> Continue with Slack
          </button>

          <Or />

          <form onSubmit={handleEmailPassword} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-email" className={styles.fieldTitle}>
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <div className={auth.labelRow}>
                <label htmlFor="login-password" className={styles.fieldTitle}>
                  Password
                </label>
                <button type="button" onClick={() => enterCodeMode(true)} className={auth.link}>
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={styles.input}
              />
            </div>

            {(error || urlError) && <FormError>{error ?? "Something went wrong. Please try again."}</FormError>}

            <button type="submit" disabled={pending !== null} className={primary}>
              {pending === "email" ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <Or />

          {/* Passwordless */}
          <button type="button" onClick={() => enterCodeMode(false)} disabled={pending !== null} className={outline}>
            Email me a sign-in code
          </button>
        </>
      )}

      <div className={auth.more}>
        {mode === "code" && (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={auth.link}
          >
            Back to sign in
          </button>
        )}
        <p>
          New here?{" "}
          <Link href="/register" className={auth.link}>
            Request access
          </Link>
        </p>
      </div>
    </>
  );
}
