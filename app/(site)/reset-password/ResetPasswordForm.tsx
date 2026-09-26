"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { friendlyAuthError } from "../../../lib/auth/friendly-error";
import { FormError } from "../_components/AuthForm";
import auth from "../_components/auth.module.css";
import styles from "../_components/site.module.css";
import { cx } from "../_components/util";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(friendlyAuthError(updateError.message));
      setPending(false);
      return;
    }

    router.push("/portal");
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="reset-password" className={styles.fieldTitle}>
          New password
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="reset-confirm" className={styles.fieldTitle}>
          Confirm password
        </label>
        <input
          id="reset-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={styles.input}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <button type="submit" disabled={pending} className={cx(styles.button, auth.action)}>
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
