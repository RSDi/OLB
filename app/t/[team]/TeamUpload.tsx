"use client";
// Parent upload page: shared-code gate, then the shared uploader
// (app/film/FilmUploader.tsx), which PATCHes bytes straight to Storage.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FilmUploader } from "../../film/FilmUploader";
import styles from "../../film/film.module.css";

interface Props {
  team: string;
  label: string;
  unlocked: boolean;
}

export function TeamUpload({ team, label, unlocked: initiallyUnlocked }: Props) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [code, setCode] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch("/film/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setUnlockError(body.error ?? "That code doesn't match.");
        return;
      }
      setUnlocked(true);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link href="/film" className={styles.brand}>
          <Image src="/email/olb-bolt.png" alt="" width={40} height={40} />
          <div>
            <div className={styles.eyebrow}>Omaha Lightning · Game film</div>
            <h1 className={styles.title}>{label}</h1>
          </div>
        </Link>

        {!unlocked ? (
          <form className={styles.card} onSubmit={unlock}>
            <p className={styles.lede} style={{ margin: 0 }}>
              Enter the shared code for this team. Coaches send it out; it isn&apos;t your portal password.
            </p>
            <label className={styles.field}>
              <span className={styles.label}>Team code</span>
              <input
                className={styles.input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                required
              />
            </label>
            {unlockError && <p className={styles.error}>{unlockError}</p>}
            <button className={styles.button} type="submit" disabled={unlocking || !code.trim()}>
              {unlocking ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <FilmUploader tokenUrl="/film/upload-token" completeUrl="/film/complete" />
        )}
      </div>
    </div>
  );
}
