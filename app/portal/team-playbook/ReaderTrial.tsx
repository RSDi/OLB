"use client";
// The reader test on a draft: another model watches the coach's whole video
// (with sound) and draws the play, shown next to the current drawing. Nothing
// is saved unless a coach taps "Use this one".

import { useRef, useState } from "react";
import type { PlayDiagram } from "../../../lib/team-playbook/diagram";
import { frameAt } from "../../../lib/team-playbook/engine";
import { trialRead } from "../../../lib/team-playbook/actions";
import type { TeamPlay } from "../../../lib/team-playbook/types";
import { Court } from "./Court";
import { usePlayback } from "./usePlayback";
import styles from "./playbook.module.css";

function MiniPlayer({ title, diagram }: { title: string; diagram: PlayDiagram }) {
  const noVideo = useRef<HTMLVideoElement | null>(null);
  const pb = usePlayback(diagram, noVideo, false, false, 1);
  if (!pb.prepared) return null;
  const frame = frameAt(pb.prepared, pb.T);
  return (
    <div className={styles.trialCol}>
      <h4 className={styles.cardTitle}>{title}</h4>
      <Court frame={frame} label={`${title}, step ${frame.step + 1}`} />
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={pb.playing ? pb.pause : pb.play}>
          {pb.playing ? "Pause" : pb.T >= diagram.steps.length ? "Replay" : "Play"}
        </button>
      </div>
      <ol className={styles.steps}>
        {diagram.steps.map((s, k) => (
          <li key={k}>
            <button
              type="button"
              className={`${styles.step} ${k === frame.step && !frame.ended ? styles.stepOn : ""}`}
              onClick={() => pb.playStep(k)}
            >
              <span className={styles.stepNum}>{k + 1}</span>
              <span>
                <span className={styles.stepTitle}>{s.title}</span>
                <span className={styles.stepNote}>{s.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReaderTrial({
  play,
  saving,
  onUse,
  onClose,
}: {
  play: TeamPlay;
  saving: boolean;
  onUse: (d: PlayDiagram) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "running" } | { kind: "done"; diagram: PlayDiagram; model: string; seconds: number } | { kind: "error"; error: string }
  >({ kind: "idle" });

  const start = async () => {
    setState({ kind: "running" });
    const res = await trialRead(play.id);
    if (res.error !== undefined) setState({ kind: "error", error: res.error });
    else setState({ kind: "done", diagram: res.diagram, model: res.model, seconds: res.seconds });
  };

  return (
    <div className={styles.draftBox}>
      <p>
        <b>Test: a reader that watches the whole video.</b>{" "}Instead of stills, it watches the coach draw each line, with the sound,
        and draws the play. Compare the two, then keep whichever follows the coach better. Nothing changes unless you pick it.
      </p>
      {state.kind === "idle" && (
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={start}>
            Watch the video and draw it
          </button>
          <button type="button" className={styles.btn} onClick={onClose}>
            Close
          </button>
        </div>
      )}
      {state.kind === "running" && <p className={styles.small}>Watching the video… this takes a minute or two. Stay on this page.</p>}
      {state.kind === "error" && (
        <>
          <p className={styles.error}>{state.error}</p>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={start}>
              Try again
            </button>
            <button type="button" className={styles.btn} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
      {state.kind === "done" && play.diagram && (
        <>
          <div className={styles.trialGrid}>
            <MiniPlayer title="Now (from stills)" diagram={play.diagram} />
            <MiniPlayer title="Watching the video" diagram={state.diagram} />
          </div>
          <p className={styles.small}>
            Drawn by {state.model} in {state.seconds} seconds.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnAccent}`}
              disabled={saving}
              onClick={() => onUse({ ...state.diagram, about: state.diagram.about ?? play.diagram?.about })}
            >
              Use the video-watching version
            </button>
            <button type="button" className={styles.btn} disabled={saving} onClick={onClose}>
              Keep the current one
            </button>
          </div>
        </>
      )}
    </div>
  );
}
