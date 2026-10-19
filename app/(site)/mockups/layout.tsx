import type { Metadata } from "next";
import styles from "./mockups.module.css";

// Public, no-login click-throughs. Never indexed; nothing here is saved.
export const metadata: Metadata = {
  title: "Mock-ups",
  robots: { index: false, follow: false },
};

export default function MockupsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={styles.withBanner}>{children}</div>
      <div className={styles.banner} role="status">
        Mock-up, not live
      </div>
    </>
  );
}
