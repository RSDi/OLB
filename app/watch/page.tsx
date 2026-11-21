import Image from "next/image";
import Link from "next/link";
import { listWatchTeams, type WatchTeamLink } from "../../lib/film/watch-data";
import styles from "./[team]/watch.module.css";

export const dynamic = "force-dynamic";

// /watch — every team's film page, for families who want to find another team.
export default async function WatchIndexPage() {
  let teams: WatchTeamLink[] = [];
  try {
    teams = await listWatchTeams();
  } catch {
    teams = [];
  }
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Image src="/email/olb-bolt.png" alt="" width={40} height={40} className={styles.bolt} />
          <div className={styles.team}>
            <div className={styles.eyebrow}>Omaha Lightning · Game film</div>
            <h1 className={styles.teamName}>Pick a team</h1>
          </div>
        </div>
      </header>
      <main className={styles.inner}>
        {teams.length === 0 ? (
          <div className={styles.empty}>
            <strong>No team film pages yet.</strong>
            <span>Ask your coach for your team&apos;s link.</span>
          </div>
        ) : (
          <div className={styles.teamList}>
            {teams.map((t) => (
              <Link key={t.slug} href={`/watch/${encodeURIComponent(t.slug)}`} className={styles.teamLink}>
                {t.label}
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        )}
        <footer className={styles.footer}>Film is shared with Lightning families. Please don&apos;t repost it.</footer>
      </main>
    </div>
  );
}
