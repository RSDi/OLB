"use client";
import { useState } from "react";
import styles from "../../_components/site.module.css";

// Mock-up only: the form checks the required fields, then says thanks.
// Nothing is sent or saved.
export function CourtSponsorForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className={styles.formSuccess} role="status">
        Thank you! We’ll be in touch about your court sponsorship. (Mock-up: nothing was sent.)
      </p>
    );
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const missing = ["business", "contact", "email"].some(
          (name) => !String(new FormData(form).get(name) ?? "").trim(),
        );
        if (missing) {
          setError("Please fill in your business, your name and your email.");
          return;
        }
        setSent(true);
      }}
    >
      {error && (
        <div role="alert" className={styles.formError}>
          {error}
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="court-business" className={styles.fieldTitle}>
          Business or organization <span className={styles.required}>(required)</span>
        </label>
        <input id="court-business" name="business" autoComplete="organization" required className={styles.input} />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="court-contact" className={styles.fieldTitle}>
            Your name <span className={styles.required}>(required)</span>
          </label>
          <input id="court-contact" name="contact" autoComplete="name" required className={styles.input} />
        </div>
        <div className={styles.field}>
          <label htmlFor="court-phone" className={styles.fieldTitle}>
            Phone
          </label>
          <input id="court-phone" name="phone" type="tel" autoComplete="tel" className={styles.input} />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="court-email" className={styles.fieldTitle}>
          Email <span className={styles.required}>(required)</span>
        </label>
        <input id="court-email" name="email" type="email" autoComplete="email" required className={styles.input} />
      </div>
      <div className={styles.field}>
        <label htmlFor="court-website" className={styles.fieldTitle}>
          Website for your logo link
        </label>
        <input id="court-website" name="website" type="url" placeholder="https://" className={styles.input} />
      </div>
      <div className={styles.field}>
        <label htmlFor="court-message" className={styles.fieldTitle}>
          Anything else?
        </label>
        <textarea id="court-message" name="message" className={styles.input} />
      </div>
      <button type="submit" className={styles.button}>
        Become a Court Sponsor
      </button>
    </form>
  );
}
