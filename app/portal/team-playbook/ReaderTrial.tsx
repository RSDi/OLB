"use client";
// The reader test on a draft: another model watches the coach's whole video
// (with sound) and draws the play, shown next to the current drawing. Nothing
// is saved unless a coach taps "Use this one".

import { useRef, useState } from "react";
import type { PlayDiagram } from "../../../lib/team-playbook/diagram";
import { frameAt } from "../../../lib/team-playbook/engine";
import { startRestill, trialRead } from "../../../lib/team-playbook/actions";
import { createClient } from "../../../lib/supabase/client";
import { PLAYBOOK_BUCKET } from "../../../lib/team-playbook/types";
import { takeStills } from "./stills";

// Matches TRIAL_MAX_STILLS on the server (lib/team-playbook/pipeline.ts).
const TRIAL_STILLS = 90;
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
    | { kind: "idle" }
    | { kind: "running"; text: string }
    | { kind: "done"; diagram: PlayDiagram; model: string; seconds: number; stills: number }
    | { kind: "error"; error: string }
  >({ kind: "idle" });

  const start = async () => {
    if (!play.video_url) return;
    setState({ kind: "running", text: "Taking stills from the video…" });
    // About one still every 1.5 seconds, up to TRIAL_MAX_STILLS.
    const { stills } = await takeStills(play.video_url, true, {
      count: (d) => Math.min(TRIAL_STILLS, Math.max(20, Math.round(d / 1.5))),
      width: 640,
      onProgress: (f) => setState({ kind: "running", text: `Taking stills from the video… ${Math.round(f * 100)}%` }),
    });
    if (!stills.length) return setState({ kind: "error", error: "This browser couldn't take stills from the video. Try Chrome on a computer." });
    const signed = await startRestill(play.id, stills.length, "trial");
    if (signed.error !== undefined) return setState({ kind: "error", error: signed.error });
    const storage = createClient().storage.from(PLAYBOOK_BUCKET);
    const frames: { path: string; sec: number }[] = [];
    let done = 0;
    // A few at a time.
    for (let i = 0; i < signed.frames.length; i += 6) {
      await Promise.all(
        signed.frames.slice(i, i + 6).map(async (f, j) => {
          const st = stills[i + j];
          if (!st) return;
          const { error } = await storage.uploadToSignedUrl(f.path, f.token, st.blob, { contentType: "image/jpeg" });
          if (!error) frames.push({ path: f.path, sec: st.sec });
          done++;
          setState({ kind: "running", text: `Uploading ${done} of ${stills.length} stills…` });
        }),
      );
    }
    frames.sort((a, b) => a.sec - b.sec);
    setState({ kind: "running", text: `Gemini is reading ${frames.length} stills… this takes a minute or two.` });
    const res = await trialRead(play.id, frames);
    if (res.error !== undefined) setState({ kind: "error", error: res.error });
    else setState({ kind: "done", diagram: res.diagram, model: res.model, seconds: res.seconds, stills: res.stills });
  };

  return (
    <div className={styles.draftBox}>
      <p>
        <b>Test: a different reader.</b>{" "}Google&apos;s Gemini follows the video a still every second or two, with the coach&apos;s
        words at each moment, so it sees each line as it&apos;s drawn. Compare the two, then keep whichever follows the coach better.
        Nothing changes unless you pick it.
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
      {state.kind === "running" && <p className={styles.small}>{state.text} Stay on this page.</p>}
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
            <MiniPlayer title="Gemini, following the video" diagram={state.diagram} />
          </div>
          <p className={styles.small}>
            Drawn by {state.model} from {state.stills} stills in {state.seconds} seconds.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnAccent}`}
              disabled={saving}
              onClick={() => onUse({ ...state.diagram, about: state.diagram.about ?? play.diagram?.about })}
            >
              Use Gemini&apos;s version
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
