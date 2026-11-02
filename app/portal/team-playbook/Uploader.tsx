"use client";
// Add a play from a video: takes a few stills from the video in the browser,
// sends the video straight to Storage (resumable, like Film), then hands the
// play to the server to be read (lib/team-playbook/actions.ts).

import { useRef, useState } from "react";
import * as tus from "tus-js-client";
import { createClient } from "../../../lib/supabase/client";
import { tusSignedHeaders } from "../../../lib/film/tus";
import { TUS_CHUNK_SIZE } from "../../../lib/film/types";
import { finishVideoUpload, startVideoUpload } from "../../../lib/team-playbook/actions";
import { FRAME_COUNT, FRAME_WIDTH, MAX_VIDEO_BYTES, PLAYBOOK_BUCKET, type PlaybookTeam, type TeamPlay } from "../../../lib/team-playbook/types";
import styles from "./playbook.module.css";

interface Still {
  blob: Blob;
  sec: number;
}

// Evenly spaced stills from the video. A video the browser can't decode
// (some phone formats on some computers) gives none; the play is then read
// from the coach's words alone.
async function takeStills(file: File): Promise<{ stills: Still[]; duration: number | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
      setTimeout(() => reject(new Error("timeout")), 15000);
    });
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    if (!duration || !video.videoWidth) return { stills: [], duration };
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { stills: [], duration };
    const stills: Still[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const sec = (duration * (i + 0.5)) / FRAME_COUNT;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.onseeked = done;
        setTimeout(done, 4000);
        video.currentTime = sec;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.78));
      if (blob) stills.push({ blob, sec });
    }
    return { stills, duration };
  } catch {
    return { stills: [], duration: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sendVideo(file: File, s: { endpoint: string; token: string; uploadUrl: string }, onProgress: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint: s.endpoint,
      uploadUrl: s.uploadUrl,
      headers: tusSignedHeaders(s.token),
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (err) => reject(err),
    });
    up.start();
  });
}

type Phase = { kind: "form" } | { kind: "stills" } | { kind: "upload"; f: number } | { kind: "saving" };

export function Uploader({
  teams,
  defaultCoach,
  onDone,
  onCancel,
}: {
  teams: PlaybookTeam[];
  defaultCoach: string;
  onDone: (play: TeamPlay) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [call, setCall] = useState("");
  const [coach, setCoach] = useState(defaultCoach);
  const [link, setLink] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mov|mp4|m4v|webm)$/i.test(f.name)) {
      setError("That isn't a video. Choose an MP4 or MOV.");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      setError("That video is over 2 GB. Trim it to just the play and try again.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const busy = phase.kind !== "form";

  const create = async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase({ kind: "stills" });
      const { stills, duration } = await takeStills(file);
      const start = await startVideoUpload({
        fileName: file.name,
        contentType: file.type || "video/mp4",
        sizeBytes: file.size,
        frameCount: stills.length,
      });
      if (start.error !== undefined) throw new Error(start.error);
      setPhase({ kind: "upload", f: 0 });
      await sendVideo(file, start, (f) => setPhase({ kind: "upload", f }));
      const storage = createClient().storage.from(PLAYBOOK_BUCKET);
      const frames: { path: string; sec: number }[] = [];
      for (let i = 0; i < start.frames.length && i < stills.length; i++) {
        const { error: upErr } = await storage.uploadToSignedUrl(start.frames[i].path, start.frames[i].token, stills[i].blob, {
          contentType: "image/jpeg",
        });
        if (!upErr) frames.push({ path: start.frames[i].path, sec: stills[i].sec });
      }
      setPhase({ kind: "saving" });
      const res = await finishVideoUpload(start.playId, {
        name,
        call_name: call,
        team_ids: teamIds,
        coach_name: coach,
        video_link: link,
        duration_sec: duration,
        frames,
      });
      if (res.error !== undefined) throw new Error(res.error);
      onDone(res.play);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn't finish. Try again.");
      setPhase({ kind: "form" });
    }
  };

  const stage = (on: boolean, done: boolean) => (done ? styles.done : on ? styles.doing : undefined);

  return (
    <div className={styles.form}>
      <h2 className={styles.formTitle}>Add a play from a video</h2>
      <p className={styles.small}>
        Upload a coach&apos;s video of the play: a whiteboard drawing while they talk it through, or a walk-through on the court. The
        portal writes down what the coach says, works out where everyone starts and moves, and draws the play. It stays a draft,
        seen only by coaches and the board, until someone checks it against the video and shares it.
      </p>
      <label
        className={`${styles.drop} ${over ? styles.dropOver : ""}`}
        htmlFor="tp-video"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) pick(e.dataTransfer.files[0]);
        }}
      >
        <span className={styles.dropTitle}>{file ? file.name : "Choose a video or drop it here"}</span>
        <span className={styles.small}>
          {file ? `${(file.size / 1048576).toFixed(1)} MB` : "MP4 or MOV from a phone is fine. Up to 2 GB."}
        </span>
        <input
          ref={inputRef}
          id="tp-video"
          type="file"
          accept="video/*"
          disabled={busy}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      <div className={styles.fields}>
        <label className={styles.field}>
          Play name
          <input id="tp-up-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" disabled={busy} />
        </label>
        <label className={styles.field}>
          Play call
          <input id="tp-up-call" value={call} onChange={(e) => setCall(e.target.value)} placeholder="e.g. Horns" disabled={busy} />
        </label>
        <label className={styles.field}>
          Coach
          <input id="tp-up-coach" value={coach} onChange={(e) => setCoach(e.target.value)} disabled={busy} />
        </label>
        <label className={styles.field}>
          Link to the original (optional)
          <input id="tp-up-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="e.g. the Slack post" disabled={busy} />
        </label>
      </div>
      {teams.length > 0 && (
        <div className={styles.field}>
          Teams (none picked: every team)
          <div className={styles.teamPick}>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.chip}
                aria-pressed={teamIds.includes(t.id)}
                disabled={busy}
                onClick={() => setTeamIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
      {busy ? (
        <ol className={styles.stages}>
          <li className={stage(phase.kind === "stills", phase.kind !== "stills")}>
            <span className={styles.dot}>{phase.kind !== "stills" ? "✓" : ""}</span>
            <span>Taking stills from the video</span>
          </li>
          <li className={stage(phase.kind === "upload", phase.kind === "saving")}>
            <span className={styles.dot}>{phase.kind === "saving" ? "✓" : ""}</span>
            <span>
              Uploading the video{phase.kind === "upload" ? ` (${Math.round(phase.f * 100)}%)` : ""}
              {phase.kind === "upload" && (
                <span className={styles.bar} style={{ display: "block", marginTop: 6 }}>
                  <span className={styles.barFill} style={{ display: "block", width: `${Math.round(phase.f * 100)}%` }} />
                </span>
              )}
            </span>
          </li>
        </ol>
      ) : (
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!file} onClick={create}>
            Create play
          </button>
          <button type="button" className={styles.btn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
