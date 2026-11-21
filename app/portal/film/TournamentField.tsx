"use client";

// Film's Tournament field: a dropdown of the team's HS Schedule tournaments
// and names already used on Film, with "Other…" to type a new one. The form
// picks the scheduled tournament for the game date until someone chooses
// (useTournamentPick); `auto` says the current pick came from there.

import { useMemo, useState } from "react";
import { EVENT_NAME_MAX } from "../../../lib/film/watch";
import {
  matchTournament,
  tournamentChoices,
  tournamentForDate,
  type ScheduledTournament,
} from "../../../lib/film/tournaments";
import styles from "./inbox.module.css";

const OTHER = "__other";

export function TournamentField({
  id,
  value,
  onChange,
  gameDate,
  scheduled,
  used,
  auto,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  gameDate: string;
  scheduled: ScheduledTournament[];
  used: string[];
  /** The value was picked from the schedule by date, not by a person. */
  auto: boolean;
}) {
  const choices = useMemo(() => tournamentChoices(scheduled, used), [scheduled, used]);
  const suggested = tournamentForDate(scheduled, gameDate);
  const [typing, setTyping] = useState(() => !!value.trim() && !matchTournament(choices, value));
  const picked = matchTournament(choices, value);
  const selectValue = typing ? OTHER : picked?.name ?? "";

  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>Tournament</span>
      <p className={styles.hint}>
        Games with the same tournament show together on the team film page. None groups the game by weekend.
      </p>
      <select
        id={id}
        className={styles.input}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange("");
            return;
          }
          setTyping(false);
          onChange(e.target.value);
        }}
      >
        <option value="">None</option>
        {choices.map((c) => (
          <option key={c.name} value={c.name}>
            {c.dates ? `${c.name} · ${c.dates}` : c.name}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {typing && (
        <input
          className={styles.input}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="Heartland Hoops Classic"
          aria-label="Tournament name"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={EVENT_NAME_MAX}
          autoFocus
        />
      )}
      {auto && suggested && value === suggested.name && (
        <p className={styles.hint} data-tour="film-tournament-suggested">
          From the HS Schedule: the game date falls on {suggested.name}.
        </p>
      )}
    </label>
  );
}

/**
 * The form's tournament state. Until someone picks, it follows the game date
 * (and team): the HS Schedule's tournament on that day, or none. A value the
 * game already had is kept.
 */
export function useTournamentPick(initial: string | null | undefined, scheduled: ScheduledTournament[], gameDate: string) {
  const [follows, setFollows] = useState(!initial?.trim());
  const [value, setValue] = useState(() => initial?.trim() || tournamentForDate(scheduled, gameDate)?.name || "");
  return {
    value,
    auto: follows && !!value,
    /** A person picked or typed. */
    pick(next: string) {
      setFollows(false);
      setValue(next);
    },
    /** The game date or team changed. */
    follow(nextDate: string, nextScheduled: ScheduledTournament[] = scheduled) {
      if (follows) setValue(tournamentForDate(nextScheduled, nextDate)?.name ?? "");
    },
  };
}
