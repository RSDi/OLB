"use client";
import { useActionState } from "react";
import { sendContactMessage, type ContactFormState } from "../../../lib/contact/actions";
import { AlertIcon } from "./icons";
import styles from "./site.module.css";

const INITIAL: ContactFormState = { status: "idle" };

// The Contact page form, laid out like the original Squarespace form block.
export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactMessage, INITIAL);

  if (state.status === "sent") {
    return <p className={styles.formSuccess}>Thank you!</p>;
  }
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === "error" && (
        <div role="alert" className={styles.formError}>
          <AlertIcon />
          {state.message}
        </div>
      )}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Name</legend>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="contact-fname" className={styles.fieldCaption}>
              First Name <span className={styles.required}>(required)</span>
            </label>
            <input
              id="contact-fname"
              name="fname"
              autoComplete="given-name"
              required
              aria-required="true"
              defaultValue={values?.fname}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="contact-lname" className={styles.fieldCaption}>
              Last Name <span className={styles.required}>(required)</span>
            </label>
            <input
              id="contact-lname"
              name="lname"
              autoComplete="family-name"
              required
              aria-required="true"
              defaultValue={values?.lname}
              className={styles.input}
            />
          </div>
        </div>
      </fieldset>
      <div className={styles.field}>
        <label htmlFor="contact-email" className={styles.fieldTitle}>
          Email <span className={styles.required}>(required)</span>
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          defaultValue={values?.email}
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-message" className={styles.fieldTitle}>
          Message <span className={styles.required}>(required)</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          aria-required="true"
          defaultValue={values?.message}
          className={styles.input}
        />
      </div>
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" className={styles.button} disabled={pending}>
        Send
      </button>
    </form>
  );
}
