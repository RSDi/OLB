import auth from "./auth.module.css";
import { AlertIcon } from "./icons";
import styles from "./site.module.css";

// Pieces shared by the sign-in forms (Login, Request access, Set a new
// password), styled like the Contact form.

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className={styles.formError}>
      <AlertIcon />
      {children}
    </div>
  );
}

// "or", on a hairline, between the ways to sign in.
export function Or({ children = "or" }: { children?: React.ReactNode }) {
  return <div className={auth.or}>{children}</div>;
}

// A message shown in place of the form: request received, check your email…
export function StatusNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.text}>
      <h3 className={auth.statusTitle}>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
