"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlackLogo } from "../../components/SlackLogo";
import { createClient } from "../../../lib/supabase/client";
import { ALREADY_REGISTERED, friendlyAuthError } from "../../../lib/auth/friendly-error";
import { FormError, Or, StatusNote } from "../_components/AuthForm";
import auth from "../_components/auth.module.css";
import styles from "../_components/site.module.css";
import { cx } from "../_components/util";

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);

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
    // With email confirmation on, Supabase doesn't say the email is taken: it
    // returns a stand-in user with no identities and sends nothing. Say so,
    // rather than "check your email" for a link that never comes.
    if (data.user && data.user.identities?.length === 0) {
      setError(ALREADY_REGISTERED);
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
    // where sign-ins from the site's own workspace (SLACK_TEAM_ID) are approved
    // on the spot.
    if (slackError) setError(friendlyAuthError(slackError.message));
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
