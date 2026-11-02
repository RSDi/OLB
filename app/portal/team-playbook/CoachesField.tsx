"use client";
// The coaches a play is from: one name per box, "+ Add a coach" for another.

import { useState } from "react";
import { joinCoaches, splitCoaches } from "../../../lib/team-playbook/coaches";
import styles from "./playbook.module.css";

export function CoachesField({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  // Kept as typed, blank boxes included; the play gets the joined names.
  const [names, setNames] = useState<string[]>(() => {
    const list = splitCoaches(value);
    return list.length ? list : [""];
  });
  const set = (next: string[]) => {
    setNames(next);
    onChange(joinCoaches(next));
  };
  return (
    <div className={styles.field}>
      Coaches
      {names.map((n, i) => (
        <div key={i} className={styles.coachRow}>
          <input
            id={`${idPrefix}-${i}`}
            aria-label={`Coach ${i + 1}`}
            value={n}
            disabled={disabled}
            placeholder="Coach's name"
            onChange={(e) => set(names.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {names.length > 1 && (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Remove ${n || "this coach"}`}
              disabled={disabled}
              onClick={() => set(names.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {names.length < 4 && (
        <button type="button" className={styles.linkBtn} disabled={disabled} onClick={() => setNames([...names, ""])}>
          + Add a coach
        </button>
      )}
    </div>
  );
}
