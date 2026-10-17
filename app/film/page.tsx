import Image from "next/image";
import Link from "next/link";
import { configuredFilmTeams } from "../../lib/film/teams";
import styles from "./film.module.css";

export const dynamic = "force-dynamic";

export default function FilmLandingPage() {
  const teams = configuredFilmTeams();
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <Image src="/email/olb-bolt.png" alt="" width={40} height={40} />
          <div>
            <div className={styles.eyebrow}>Omaha Lightning</div>
            <h1 className={styles.title}>Game film</h1>
          </div>
        </Link>
        <p className={styles.lede}>
          Pick your team, enter the shared code, and upload the game video from your phone. Coaches
          collect the files in the member portal under <strong>Film</strong>.
        </p>
        {teams.length === 0 ? (
          <div className={styles.card}>
            <p className={styles.lede} style={{ margin: 0 }}>
              Team upload pages aren&apos;t set up yet. A club admin needs to add each team&apos;s
              code.
            </p>
          </div>
        ) : (
          <div className={styles.teams}>
            {teams.map((t) => (
              <Link key={t.slug} href={`/t/${t.slug}`} className={styles.teamLink}>
                <span>{t.label}</span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
