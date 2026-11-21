import Image from "next/image";
import styles from "./[team]/watch.module.css";

// /watch — no list of teams: each team's page has its own link with a
// random key, and only that team's families get it.
export default function WatchIndexPage() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Image src="/email/olb-bolt.png" alt="" width={40} height={40} className={styles.bolt} />
          <div className={styles.team}>
            <div className={styles.eyebrow}>Omaha Lightning · Game film</div>
            <h1 className={styles.teamName}>Team film</h1>
          </div>
        </div>
      </header>
      <main className={styles.inner}>
        <div className={styles.empty}>
          <strong>Each team has its own film link.</strong>
          <span>Ask your coach for your team&apos;s link.</span>
        </div>
        <footer className={styles.footer}>Film is shared with Lightning families. Please don&apos;t repost it.</footer>
      </main>
    </div>
  );
}
