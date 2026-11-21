"use client";

// Streamed games on Film (preview): the "Add streamed game" form, and the
// "Line up jump-to points" form on a recording that replaced a stream.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "../../components/ui";
import { addStreamedGame, lineUpStreamMarkers } from "../../../lib/film/stream-actions";
import { OPPONENT_MAX } from "../../../lib/film/game-meta";
import { EVENT_NAME_MAX } from "../../../lib/film/watch";
import { churchToday } from "../../../lib/dates/today";
import styles from "./inbox.module.css";

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 3);
}

export function AddStreamForm({
  teams,
  eventOptions,
  initialTeamId,
  onClose,
}: {
  teams: { id: string; label: string; slug: string }[];
  /** Tournament names already used, by team slug. */
  eventOptions: Record<string, string[]>;
  initialTeamId: string | null;
  onClose: (added: boolean) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [teamId, setTeamId] = useState(initialTeamId ?? teams[0]?.id ?? "");
  const [link, setLink] = useState("");
  const [gameDate, setGameDate] = useState(() => churchToday());
  const [opponent, setOpponent] = useState("");
  const [ourScore, setOurScore] = useState("");
  const [theirScore, setTheirScore] = useState("");
  const [eventName, setEventName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = teams.find((t) => t.id === teamId)?.slug ?? "";
  const events = eventOptions[slug] ?? [];

  async function save() {
    setSaving(true);
    setError(null);
    const res = await addStreamedGame({ teamId, link, gameDate, opponent, ourScore, theirScore, eventName });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose(true);
    startTransition(() => router.refresh());
  }

  return (
    <form
      className={`rsd-card ${styles.form}`}
      style={{ padding: 16 }}
      data-tour="film-add-stream-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15 }}>Add streamed game</div>
      <p className={styles.hint} style={{ margin: 0 }}>
        It shows on the team film page right away, marked Streamed. When someone uploads the recording of this game,
        the recording takes its place.
      </p>
      <label className={styles.field}>
        <span className={styles.label}>YouTube link of the stream</span>
        <input
          className={styles.input}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://youtube.com/live/…"
          autoComplete="off"
          inputMode="url"
          required
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Team</span>
        <select className={styles.input} value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Game date</span>
        <input className={styles.input} type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} required />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Opponent</span>
        <p className={styles.hint}>The recording finds this stream by team, date and opponent.</p>
        <input
          className={styles.input}
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Who did we play?"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={OPPONENT_MAX}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Tournament</span>
        <input
          className={styles.input}
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Heartland Hoops Classic"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={EVENT_NAME_MAX}
          list={events.length ? "film-stream-events" : undefined}
        />
        {events.length > 0 && (
          <datalist id="film-stream-events">
            {events.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
      </label>
      <fieldset className={styles.scoreFields}>
        <legend className={styles.label}>Score</legend>
        <p className={styles.hint}>Optional — leave blank if you don&apos;t have it.</p>
        <div className={styles.scoreRow}>
          <label className={styles.field}>
            <span className={styles.subLabel}>Our score</span>
            <input
              className={styles.input}
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={ourScore}
              onChange={(e) => setOurScore(digitsOnly(e.target.value))}
              placeholder="—"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.subLabel}>Their score</span>
            <input
              className={styles.input}
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={theirScore}
              onChange={(e) => setTheirScore(digitsOnly(e.target.value))}
              placeholder="—"
            />
          </label>
        </div>
      </fieldset>
      {error && <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>{error}</p>}
      <div className={styles.actions}>
        <Pill type="submit" size="sm" variant="accent" disabled={saving || !link.trim() || !teamId}>
          {saving ? "Adding…" : "Add to team page"}
        </Pill>
        <Pill size="sm" onClick={() => onClose(false)} disabled={saving}>
          Cancel
        </Pill>
      </div>
    </form>
  );
}

export function LineUpMarkers({ recordingId, streamMarkerCount }: { recordingId: string; streamMarkerCount: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [streamTip, setStreamTip] = useState("");
  const [recTip, setRecTip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <span data-tour="film-line-up">
        <Pill size="sm" onClick={() => setOpen(true)}>
          Line up jump-to points ({streamMarkerCount})
        </Pill>
      </span>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await lineUpStreamMarkers(recordingId, { streamTipOff: streamTip, recordingTipOff: recTip });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <form
      className={styles.form}
      style={{ flexBasis: "100%" }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className={styles.hint} style={{ margin: 0 }}>
        The stream and the recording start at different moments. Find tip-off in each, and the stream&apos;s{" "}
        {streamMarkerCount} jump-to point{streamMarkerCount === 1 ? "" : "s"} move to the same moments in the recording.
      </p>
      <div className={styles.scoreRow}>
        <label className={styles.field}>
          <span className={styles.subLabel}>Tip-off in the stream</span>
          <input
            className={styles.input}
            value={streamTip}
            onChange={(e) => setStreamTip(e.target.value)}
            placeholder="6:41"
            autoComplete="off"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.subLabel}>Tip-off in the recording</span>
          <input
            className={styles.input}
            value={recTip}
            onChange={(e) => setRecTip(e.target.value)}
            placeholder="0:54"
            autoComplete="off"
            required
          />
        </label>
      </div>
      {error && <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>{error}</p>}
      <div className={styles.actions}>
        <Pill type="submit" size="sm" variant="accent" disabled={saving}>
          {saving ? "Moving…" : "Move jump-to points"}
        </Pill>
        <Pill size="sm" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Pill>
      </div>
    </form>
  );
}
