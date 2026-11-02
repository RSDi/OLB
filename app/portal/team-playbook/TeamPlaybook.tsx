"use client";
// Team Playbook (/portal/team-playbook): pick a play, watch it run on the
// half court with captions and the coach's voice, and check it against the
// coach's video. Coaches and the board also add plays from a video, fix the
// drafts and share them with the team.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayDiagram } from "../../../lib/team-playbook/diagram";
import { frameAt } from "../../../lib/team-playbook/engine";
import {
  checkPlay,
  createBlankPlay,
  deletePlay,
  rereadPlay,
  savePlay,
  setPlayShared,
  startRestill,
  writeNotes,
} from "../../../lib/team-playbook/actions";
import { PROCESSING, type PlayEdit, type PlaybookTeam, type TeamPlay } from "../../../lib/team-playbook/types";
import { Court } from "./Court";
import { Editor } from "./Editor";
import { Uploader } from "./Uploader";
import { ReaderTrial } from "./ReaderTrial";
import { usePlayback } from "./usePlayback";
import { takeStills } from "./stills";
import { createClient } from "../../../lib/supabase/client";
import { PLAYBOOK_BUCKET } from "../../../lib/team-playbook/types";
import styles from "./playbook.module.css";

type Mode = "view" | "upload" | "edit";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function statusLabel(p: TeamPlay): string | null {
  if (p.status === "draft") return "Draft";
  if (p.status === "failed") return "Didn't work";
  if (PROCESSING.includes(p.status)) return "Reading…";
  return null;
}

export function TeamPlaybook({
  initialPlays,
  teams,
  canEdit,
  viewerName,
  initialTeam,
}: {
  initialPlays: TeamPlay[];
  teams: PlaybookTeam[];
  canEdit: boolean;
  viewerName: string;
  initialTeam: string | null;
}) {
  const router = useRouter();
  const [plays, setPlays] = useState(initialPlays);
  const [team, setTeam] = useState<string>(initialTeam && teams.some((t) => t.id === initialTeam) ? initialTeam : "all");
  const [selectedId, setSelectedId] = useState<string | null>(initialPlays[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trails, setTrails] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTime, setVideoTime] = useState(0);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const shown = plays.filter((p) => team === "all" || p.team_ids.length === 0 || p.team_ids.includes(team));
  const play = plays.find((p) => p.id === selectedId) ?? null;
  const diagram: PlayDiagram | null = play?.diagram ?? null;

  const pb = usePlayback(mode === "view" ? diagram : null, videoRef, !!play?.video_url, sound, speed);
  const frame = pb.prepared ? frameAt(pb.prepared, pb.T, trails) : null;

  const replace = (p: TeamPlay) => setPlays((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]));

  // While a play is being read, ask how it's going every few seconds.
  const processing = play && PROCESSING.includes(play.status) && play.status !== "uploading";
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!processing || !play) return;
    const id = play.id;
    pollRef.current = window.setInterval(async () => {
      const res = await checkPlay(id);
      if (res.error === undefined) replace(res.play);
    }, 8000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [processing, play]);

  const select = (id: string) => {
    pb.pause();
    setSelectedId(id);
    setMode("view");
    setError(null);
  };

  const run = async (fn: () => Promise<{ error?: string; play?: TeamPlay } | { error: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error !== undefined) {
      setError(res.error);
      return false;
    }
    if ("play" in res && res.play) replace(res.play);
    return true;
  };

  // Read the video again: fresh stills from the saved video first (more of
  // them than older plays were read from), then the server reads it. If the
  // browser can't take stills, the play is read from the ones it has.
  const [rereading, setRereading] = useState<string | null>(null);
  // The reader test is open on this play.
  const [trialFor, setTrialFor] = useState<string | null>(null);
  const reread = async (p: TeamPlay) => {
    setBusy(true);
    setError(null);
    let frames: { path: string; sec: number }[] | undefined;
    if (p.video_url) {
      setRereading("Taking fresh stills from the video…");
      const { stills } = await takeStills(p.video_url, true);
      if (stills.length) {
        const start = await startRestill(p.id, stills.length);
        if (start.error === undefined) {
          setRereading("Uploading the stills…");
          const storage = createClient().storage.from(PLAYBOOK_BUCKET);
          frames = [];
          for (let i = 0; i < start.frames.length && i < stills.length; i++) {
            const { error: upErr } = await storage.uploadToSignedUrl(start.frames[i].path, start.frames[i].token, stills[i].blob, {
              contentType: "image/jpeg",
            });
            if (!upErr) frames.push({ path: start.frames[i].path, sec: stills[i].sec });
          }
        }
      }
    }
    setRereading(null);
    setBusy(false);
    await run(() => rereadPlay(p.id, frames));
  };

  // Group the list by kind of play; drafts and plays being read come first.
  const groups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, TeamPlay[]>();
    for (const p of shown) {
      const g = p.status === "shared" ? p.category || "Other plays" : "Not shared yet";
      if (!by.has(g)) {
        by.set(g, []);
        order.push(g);
      }
      by.get(g)!.push(p);
    }
    order.sort((a, b) => (a === "Not shared yet" ? -1 : b === "Not shared yet" ? 1 : a.localeCompare(b)));
    return order.map((g) => ({ name: g, plays: by.get(g)! }));
  }, [shown]);

  const step = frame ? diagram!.steps[frame.step] : null;
  const timedLine =
    pb.followVideo && pb.playing && play?.transcript?.length
      ? play.transcript.find((l) => videoTime >= l.start && videoTime <= l.end + 0.4)
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Team Playbook</h1>
          <p className={styles.sub}>
            Our plays, step by step. Press Play to watch one run, tap a step to see just that part, and turn on Sound to hear the coach
            explain it.
          </p>
        </div>
        {teams.length > 0 && (
          <div className={styles.chips} role="group" aria-label="Team">
            <button type="button" className={styles.chip} aria-pressed={team === "all"} onClick={() => setTeam("all")}>
              All teams
            </button>
            {teams.map((t) => (
              <button key={t.id} type="button" className={styles.chip} aria-pressed={team === t.id} onClick={() => setTeam(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.grid}>
        <nav className={styles.list} aria-label="Plays">
          {groups.length === 0 && <p className={styles.small}>No plays for this team yet.</p>}
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className={styles.catTitle}>{g.name}</h3>
              <ul className={styles.catList}>
                {g.plays.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={styles.item}
                      aria-current={p.id === selectedId && mode !== "upload"}
                      onClick={() => select(p.id)}
                    >
                      <span>{p.name || "New play"}</span>
                      <span className={styles.itemMeta}>
                        {statusLabel(p) ?? (p.diagram ? `${p.diagram.steps.length} steps` : "")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {canEdit && (
            <div className={styles.addBtns}>
              <button
                type="button"
                className={styles.addBtn}
                data-tour="playbook-add-video"
                onClick={() => {
                  pb.pause();
                  setMode("upload");
                  setError(null);
                }}
              >
                + Add a play from a video
              </button>
              <button
                type="button"
                className={styles.addBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await createBlankPlay();
                  setBusy(false);
                  if (res.error !== undefined) return setError(res.error);
                  replace(res.play);
                  setSelectedId(res.play.id);
                  setMode("edit");
                }}
              >
                + Draw a play by hand
              </button>
            </div>
          )}
        </nav>

        <section className={styles.stage} aria-label="Play">
          {mode === "upload" && canEdit ? (
            <Uploader
              teams={teams}
              defaultCoach={viewerName}
              onCancel={() => setMode("view")}
              onDone={(p) => {
                replace(p);
                setSelectedId(p.id);
                setMode("view");
                router.refresh();
              }}
            />
          ) : mode === "edit" && play?.diagram && canEdit ? (
            <Editor
              key={play.id}
              play={play}
              teams={teams}
              saving={busy}
              error={error}
              onCancel={() => {
                setMode("view");
                setError(null);
              }}
              onSave={async (edit: PlayEdit) => {
                if (await run(() => savePlay(play.id, edit))) setMode("view");
              }}
              onDelete={async () => {
                setBusy(true);
                const res = await deletePlay(play.id);
                setBusy(false);
                if (res.error !== undefined) return setError(res.error);
                setPlays((list) => list.filter((x) => x.id !== play.id));
                setSelectedId(null);
                setMode("view");
              }}
            />
          ) : !play ? (
            <div className={styles.empty}>
              {plays.length === 0
                ? canEdit
                  ? "No plays yet. Add the first one from a coach's video."
                  : "The coaches haven't shared any plays yet."
                : "Pick a play from the list."}
            </div>
          ) : (
            <>
              <div className={styles.playHead}>
                <h2 className={styles.playName}>{play.name || "New play"}</h2>
                <div className={styles.tags}>
                  {play.status !== "shared" && <span className={`${styles.tag} ${styles.tagDraft}`}>{statusLabel(play)}</span>}
                  {play.call_name && <span className={`${styles.tag} ${styles.tagCall}`}>Call: “{play.call_name}”</span>}
                  {play.category && <span className={styles.tag}>{play.category}</span>}
                  {play.team_ids.map((id) => (teamName.get(id) ? <span key={id} className={styles.tag}>{teamName.get(id)}</span> : null))}
                  {play.video_link && (
                    <a className={styles.vidLink} href={play.video_link} target="_blank" rel="noopener noreferrer">
                      Original post
                    </a>
                  )}
                </div>
              </div>

              {PROCESSING.includes(play.status) && (
                <div className={styles.draftBox}>
                  <p>
                    <b>Reading the play from the video.</b>{" "}This takes a few minutes. You can leave this page; the draft will be here when
                    it&apos;s done.
                  </p>
                  <ol className={styles.stages}>
                    {[
                      ["uploading", "Uploading the video"],
                      ["transcribing", "Writing down what the coach says"],
                      ["reading", "Reading the drawing and drawing the play"],
                    ].map(([s, label], i, all) => {
                      const at = all.findIndex(([x]) => x === play.status);
                      return (
                        <li key={s} className={i < at ? styles.done : i === at ? styles.doing : undefined}>
                          <span className={styles.dot}>{i < at ? "✓" : ""}</span>
                          <span>{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                  {play.status === "uploading" && canEdit && (
                    <div className={styles.row}>
                      <span className={styles.small}>If the upload stopped, delete this and add the video again.</span>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={async () => {
                          const res = await deletePlay(play.id);
                          if (res.error !== undefined) return setError(res.error);
                          setPlays((list) => list.filter((x) => x.id !== play.id));
                          setSelectedId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {play.status === "failed" && (
                <div className={styles.draftBox}>
                  <p>
                    <b>This one didn&apos;t work.</b>{" "}{play.error}
                  </p>
                  {canEdit && (
                    <div className={styles.row}>
                      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => reread(play)}>
                        {rereading ?? "Read it again"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnDanger}`}
                        disabled={busy}
                        onClick={async () => {
                          const res = await deletePlay(play.id);
                          if (res.error !== undefined) return setError(res.error);
                          setPlays((list) => list.filter((x) => x.id !== play.id));
                          setSelectedId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {frame && diagram && (
                <>
                  <div className={styles.courtBox}>
                    <Court frame={frame} label={`${play.name}, step ${frame.step + 1}`} />
                    {captions && step && (timedLine || step.note) && (
                      <div className={styles.caption} aria-live="polite">
                        {timedLine ? (
                          timedLine.text
                        ) : (
                          <>
                            <span className={styles.capNum}>{frame.step + 1}.</span>
                            {step.note}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={styles.controls}>
                    <button type="button" className={styles.btn} aria-label="Previous step" onClick={pb.prev}>
                      <svg viewBox="0 0 16 16">
                        <path d="M3 2h2v12H3zM14 2v12L6 8z" />
                      </svg>
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={pb.playing ? pb.pause : pb.play}>
                      <svg viewBox="0 0 16 16">
                        {pb.playing ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M3 2l11 6-11 6z" />}
                      </svg>
                      {pb.playing ? "Pause" : pb.T >= diagram.steps.length ? "Replay" : "Play"}
                    </button>
                    <button type="button" className={styles.btn} aria-label="Next step" onClick={pb.next}>
                      <svg viewBox="0 0 16 16">
                        <path d="M11 2h2v12h-2zM2 2v12l8-6z" />
                      </svg>
                    </button>
                    <input
                      className={styles.scrub}
                      id="tp-scrub"
                      type="range"
                      min={0}
                      max={1000}
                      value={Math.round((pb.T / diagram.steps.length) * 1000)}
                      aria-label="Timeline"
                      onChange={(e) => pb.seek((Number(e.target.value) / 1000) * diagram.steps.length)}
                    />
                    <label className={styles.opt} htmlFor="tp-speed">
                      Speed
                      <select id="tp-speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                        <option value={0.5}>½×</option>
                        <option value={0.75}>¾×</option>
                        <option value={1}>1×</option>
                        <option value={1.5}>1½×</option>
                      </select>
                    </label>
                    <label className={styles.opt}>
                      <input id="tp-trails" type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} /> Trails
                    </label>
                    <label className={styles.opt}>
                      <input id="tp-captions" type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions
                    </label>
                    <label className={styles.opt}>
                      <input
                        id="tp-sound"
                        type="checkbox"
                        checked={sound}
                        onChange={(e) => {
                          pb.pause();
                          setSound(e.target.checked);
                        }}
                      />{" "}
                      Sound
                    </label>
                  </div>
                  {sound && (
                    <p className={styles.note}>
                      {pb.followVideo
                        ? "Sound plays the coach's own voice from the video, and the play follows along."
                        : "This play isn't matched to a video, so your device reads the captions aloud."}
                    </p>
                  )}
                </>
              )}

              {play.video_url && (
                <video
                  ref={videoRef}
                  onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                  className={styles.video}
                  src={play.video_url}
                  controls
                  playsInline
                  preload="metadata"
                />
              )}

              {canEdit && play.status === "draft" && (
                <div className={styles.draftBox}>
                  <p>
                    <b>Draft.</b>{" "}Only coaches and the board see it. Play it next to the coach&apos;s video above and fix anything that&apos;s
                    off, then share it with the team.
                  </p>
                  {play.error && (
                    <p>
                      <b>Heads up:</b>{" "}{play.error}
                    </p>
                  )}
                  <div className={styles.row}>
                    <button type="button" className={`${styles.btn} ${styles.btnAccent}`} disabled={busy} onClick={() => run(() => setPlayShared(play.id, true))}>
                      Share with the team
                    </button>
                    <button type="button" className={styles.btn} onClick={() => setMode("edit")}>
                      Fix this play
                    </button>
                    {play.video_url && (
                      <button type="button" className={styles.btn} disabled={busy} onClick={() => reread(play)}>
                        {rereading ?? "Read the video again"}
                      </button>
                    )}
                    {play.video_url && play.diagram && !trialFor && (
                      <button type="button" className={styles.btn} disabled={busy} onClick={() => setTrialFor(play.id)}>
                        Compare: a reader that watches the video (test)
                      </button>
                    )}
                  </div>
                </div>
              )}
              {canEdit && play.status === "draft" && trialFor === play.id && (
                <ReaderTrial
                  play={play}
                  saving={busy}
                  onClose={() => setTrialFor(null)}
                  onUse={async (d) => {
                    const ok = await run(() =>
                      savePlay(play.id, {
                        name: play.name,
                        call_name: play.call_name,
                        category: play.category,
                        team_ids: play.team_ids,
                        coach_name: play.coach_name,
                        video_link: play.video_link,
                        diagram: d,
                      }),
                    );
                    if (ok) setTrialFor(null);
                  }}
                />
              )}
              {canEdit && play.status === "shared" && (
                <div className={styles.row}>
                  <button type="button" className={styles.btn} onClick={() => setMode("edit")}>
                    Fix this play
                  </button>
                  <button type="button" className={styles.btn} disabled={busy} onClick={() => run(() => setPlayShared(play.id, false))}>
                    Stop sharing
                  </button>
                </div>
              )}
              {error && mode === "view" && <p className={styles.error}>{error}</p>}
            </>
          )}
        </section>

        <aside className={styles.side}>
          {mode === "view" && play && diagram && (diagram.about || (canEdit && (play.transcript || play.video_url))) ? (
            <div className={styles.card}>
              <h4 className={styles.cardTitle}>Coach&apos;s notes</h4>
              {diagram.about ? (
                <div className={styles.notes}>
                  {diagram.about.why && (
                    <div>
                      <span className={styles.notesLabel}>Why we run it</span>
                      <p>{diagram.about.why}</p>
                    </div>
                  )}
                  {diagram.about.when && (
                    <div>
                      <span className={styles.notesLabel}>When we use it</span>
                      <p>{diagram.about.when}</p>
                    </div>
                  )}
                  {diagram.about.keys.length > 0 && (
                    <div>
                      <span className={styles.notesLabel}>What to remember</span>
                      <ul>
                        {diagram.about.keys.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : play.transcript?.length ? (
                <p className={styles.small}>Why the coaches run this play, when, and what to remember, written from what the coach says in the video.</p>
              ) : (
                <p className={styles.small}>
                  None of the coach&apos;s words came through from this video, so there&apos;s nothing to write notes from. Tap{" "}
                  <b>Read the video again</b> below to try the words again, or add notes in <b>Fix this play</b>.
                </p>
              )}
              {canEdit && play.transcript?.length ? (
                <button
                  type="button"
                  className={styles.btn}
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={() => run(() => writeNotes(play.id))}
                >
                  {busy ? "Writing…" : diagram.about ? "Write them again" : "Write the coach's notes"}
                </button>
              ) : null}
            </div>
          ) : null}
          {mode === "view" && diagram && frame && (
            <div className={styles.card}>
              <h4 className={styles.cardTitle}>Steps</h4>
              <ol className={styles.steps}>
                {diagram.steps.map((s, k) => {
                  const on = k === frame.step && !frame.ended;
                  const done = k < frame.step || frame.ended;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        className={`${styles.step} ${on ? styles.stepOn : ""} ${done ? styles.stepDone : ""}`}
                        onClick={() => pb.playStep(k)}
                      >
                        <span className={styles.stepNum}>{k + 1}</span>
                        <span>
                          <span className={styles.stepTitle}>{s.title}</span>
                          <span className={styles.stepNote}>{s.note}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div className={styles.card}>
            <h4 className={styles.cardTitle}>Key</h4>
            <div className={styles.legend}>
              <svg viewBox="0 0 44 16" aria-hidden="true">
                <line x1="2" y1="8" x2="36" y2="8" stroke="#121214" strokeWidth="2.5" />
                <path d="M34 3l8 5-8 5z" fill="#121214" />
              </svg>
              <span>Cut</span>
              <svg viewBox="0 0 44 16" aria-hidden="true">
                <line x1="2" y1="8" x2="38" y2="8" stroke="#e36414" strokeWidth="2.5" strokeDasharray="5 4" />
                <path d="M34 3l8 5-8 5z" fill="#e36414" />
              </svg>
              <span>Pass</span>
              <svg viewBox="0 0 44 16" aria-hidden="true">
                <path d="M2 8l4-5 4 10 4-10 4 10 4-10 4 10 4-10 4 5" fill="none" stroke="#121214" strokeWidth="2" />
                <path d="M34 3l8 5-8 5z" fill="#121214" />
              </svg>
              <span>Dribble</span>
              <svg viewBox="0 0 44 16" aria-hidden="true">
                <line x1="2" y1="8" x2="38" y2="8" stroke="#121214" strokeWidth="2.5" />
                <line x1="38" y1="1" x2="38" y2="15" stroke="#121214" strokeWidth="3" />
              </svg>
              <span>Screen</span>
            </div>
          </div>
          {mode === "view" && play && (play.coach_name || play.transcript?.length) ? (
            <div className={styles.card}>
              {play.coach_name && <p className={styles.small}>From {play.coach_name}.</p>}
              {play.transcript && play.transcript.length > 0 && (
                <>
                  <h4 className={styles.cardTitle} style={{ marginTop: 10 }}>
                    What the coach says
                  </h4>
                  <div className={styles.transcript}>
                    {play.transcript.map((l, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const v = videoRef.current;
                          if (!v) return;
                          pb.pause();
                          v.currentTime = l.start;
                          void v.play().catch(() => {});
                        }}
                      >
                        <time>{fmt(l.start)}</time>
                        <span>{l.text}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
