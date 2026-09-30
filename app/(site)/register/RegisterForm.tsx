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

// An email that already has an account (the club may have set one up ahead of
// time, e.g. through "Preview as") doesn't dead-end here: we email a code
// instead, and once it checks out we save the password they just chose and
// sign them in. The code proves the email is theirs, as "Forgot password?"
// does, so to them it reads as the usual confirm-your-email step.
export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [finish, setFinish] = useState<{ email: string; password: string } | null>(null);
  const [canResend, setCanResend] = useState(false);

  // Signed in: let the server resolve membership (bootstrap admin, pending
  // insert, admin notification, all in one place), then go where it says.
  async function continueSignedIn() {
    const supabase = createClient();
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
  }

  async function sendFinishCode(email: string): Promise<boolean> {
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (otpError) {
      setError(friendlyAuthError(otpError.message));
      return false;
    }
    setCanResend(false);
    setTimeout(() => setCanResend(true), 30_000);
    return true;
  }

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

    // The email already has an account. Supabase says so outright when email
    // confirmation is off; when it's on, it returns a stand-in user with no
    // identities and sends nothing.
    const taken = signUpError
      ? /already registered|already been registered/i.test(signUpError.message)
      : !!data.user && data.user.identities?.length === 0;
    if (taken) {
      if (await sendFinishCode(email)) setFinish({ email, password });
      setPending(false);
      return;
    }

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message));
      setPending(false);
      return;
    }

    if (data.session) {
      // Email confirmation is off — session returned immediately.
      await continueSignedIn();
    } else {
      // Email confirmation is on — user must click the link first. The auth
      // callback runs the same resolveMembership flow on confirmation.
      setConfirmEmail(true);
      setPending(false);
    }
  }

  async function handleFinish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!finish) return;
    const token = (new FormData(e.currentTarget).get("token") as string).replace(/\D/g, "");
    if (token.length < 6) {
      setError("Type the whole code from the email.");
      return;
    }
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: finish.email, token, type: "email" });
    if (verifyError) {
      setError(friendlyAuthError(verifyError.message));
      setPending(false);
      return;
    }
    // Signed in either way; a password that didn't save can be set later
    // with "Forgot password?".
    const { error: passwordError } = await supabase.auth.updateUser({ password: finish.password });
    if (passwordError) console.error("[register] saving the password failed:", passwordError.message);

    await continueSignedIn();
  }

  async function handleSlack() {
    setError(null);
    const supabase = createClient();
    const { error: slackError } = await supabase.auth.signInWithOAuth({
      provider: "slack_oidc",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser leaves for Slack and returns through /auth/callback,
    // where sign-ins from the site's own workspace (SLACK_TEAM_ID) are approved
    // on the spot.
    if (slackError) setError(friendlyAuthError(slackError.message));
  }

  if (finish) {
    return (
      <>
        <p className={auth.note}>
          One last step — we sent a code to <strong>{finish.email}</strong> to confirm it&apos;s you. Type it in and
          you&apos;re in. It can take a minute to arrive. If the email shows a sign-in button instead of a code,
          tapping the button works too.
        </p>
        <form onSubmit={handleFinish} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="register-token" className={styles.fieldTitle}>
              Code from the email
            </label>
            <input
              id="register-token"
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
          <button type="submit" disabled={pending} className={cx(styles.button, auth.action)}>
            {pending ? "Checking…" : "Continue"}
          </button>
        </form>
        <p className={auth.hint}>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void sendFinishCode(finish.email);
            }}
            disabled={!canResend || pending}
            className={auth.link}
          >
            {canResend ? "Send a new code" : "You can request another code in a moment…"}
          </button>
        </p>
      </>
    );
  }

  if (confirmEmail) {
    return (
      <>
        <StatusNote title="Check your email">
          We sent a confirmation link to your email. After you confirm, someone from the club will review your
          request before you can sign in.
        </StatusNote>
        <div className={auth.more}>
          <Link href="/login" className={auth.link}>
            Back to sign in
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Slack — the seamless path. Members of the site's own workspace are
          approved on the spot, so this skips the review the email form below
          goes through. */}
      <button
        type="button"
        onClick={handleSlack}
        disabled={pending}
        className={cx(styles.button, auth.action, auth.outline)}
      >
        <SlackLogo /> Continue with Slack
      </button>
      <p className={auth.hint}>Already in our Slack workspace? This gets you in right away.</p>

      <Or>or request access</Or>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="register-name" className={styles.fieldTitle}>
            Full name
          </label>
          <input
            id="register-name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-email" className={styles.fieldTitle}>
            Email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-password" className={styles.fieldTitle}>
            Password
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-confirm" className={styles.fieldTitle}>
            Confirm password
          </label>
          <input
            id="register-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={styles.input}
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <button type="submit" disabled={pending} className={cx(styles.button, auth.action)}>
          {pending ? "Creating account…" : "Request access"}
        </button>
      </form>

      <div className={auth.more}>
        <p>
          Already have an account?{" "}
          <Link href="/login" className={auth.link}>
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
