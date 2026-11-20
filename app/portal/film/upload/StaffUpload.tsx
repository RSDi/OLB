"use client";
// Staff uploader: pick any team, then the same uploader families use.

import { useCallback, useState } from "react";
import Link from "next/link";
import { FilmUploader, type FilmUploadPrep } from "../../../film/FilmUploader";
import styles from "../../../film/film.module.css";

interface Props {
  teams: { id: string; label: string; ageGroup: string | null }[];
  defaultName: string;
  loadError: string | null;
}

export function StaffUpload({ teams, defaultName, loadError }: Props) {
  const [teamId, setTeamId] = useState("");

  const prepare = useCallback((): FilmUploadPrep => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return { error: "Pick a team first." };
    return { body: { teamId: team.id }, tag: team.label };
  }, [teamId, teams]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Upload film</h1>
        <p className={styles.lede} style={{ marginTop: 6 }}>
          Pick any team and upload its game video. No team code needed. Videos land in{" "}
          <Link href="/portal/film" style={{ fontWeight: 700 }}>
            Film
          </Link>{" "}
          and go to YouTube on their own, just like a family upload.
        </p>
      </div>
      {loadError ? (
        <p className={styles.error}>{loadError}</p>
      ) : (
        <FilmUploader
          tokenUrl="/api/film/staff-upload"
          completeUrl="/api/film/staff-upload/complete"
          resumeUrl="/api/film/staff-upload/resume"
          resumeScope="staff"
          prepare={prepare}
          defaultName={defaultName}
          doneMessage="All videos uploaded."
          before={
            <label className={styles.field}>
              <span className={styles.label}>Team</span>
              <select
                className={styles.input}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
              >
                <option value="">Pick a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      )}
    </div>
  );
}
