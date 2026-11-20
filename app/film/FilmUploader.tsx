"use client";
// The upload form behind both doors: the family page (/t/[team], after the
// team code) and the staff uploader (/portal/film/upload, pick any team).
// Uppy + TUS: the server creates the TUS upload; this PATCHes file bytes
// straight to Storage.
// Phones drop uploads when the screen locks or another app comes forward, so
// the page keeps the screen awake, retries when it comes back, and remembers
// each upload it started (lib/film/resume.ts): picking the same video again
// carries on from where Storage stopped.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { tusSignedHeaders } from "../../lib/film/tus";
import { churchToday } from "../../lib/dates/today";
import { formatFilmGameLine } from "../../lib/film/game-meta";
import { allUploadsFinished, formatBytes, formatFinishTime, isLargeFilmFile } from "../../lib/film/guest-status";
import { MAX_UPLOAD_BYTES, TUS_CHUNK_SIZE } from "../../lib/film/types";
import {
  fileFingerprint,
  findSavedUpload,
  friendlyUploadError,
  parseSavedUploads,
  removeSavedUpload,
  resumeStorageKey,
  upsertSavedUpload,
  type SavedUpload,
} from "../../lib/film/resume";
import styles from "./film.module.css";

type FileUi = {
  id: string;
  name: string;
  bytes: number;
  total: number;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
  finishedAt?: number;
  tag?: string;
  gameDate?: string;
  opponent?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
  /** Game line from the server when this file picked up an earlier upload. */
  gameLine?: string | null;
  resumed?: boolean;
};

/** No progress for this long while the page is showing → restart the request. */
const STALL_MS = 45_000;
/** Automatic retries in a row without progress before leaving it to Retry. */
const MAX_AUTO_RETRIES = 5;

type WakeLockLike = { release: () => Promise<void> };

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSavedRaw(scope: string): string | null {
  try {
    return window.localStorage.getItem(resumeStorageKey(scope));
  } catch {
    return null;
  }
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 3);
}

type TokenRes = {
  uploadId: string;
  bucket: string;
  path: string;
  endpoint: string;
  token: string;
  uploadUrl: string;
  contentType: string;
};

type ResumeRes = {
  uploadId: string;
  bucket: string;
  path: string;
  endpoint: string;
  token: string;
  contentType: string;
  gameLine: string | null;
};

function readSaved(scope: string): SavedUpload[] {
  try {
    return parseSavedUploads(window.localStorage.getItem(resumeStorageKey(scope)));
  } catch {
    return [];
  }
}

function writeSaved(scope: string, list: SavedUpload[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(resumeStorageKey(scope));
    else window.localStorage.setItem(resumeStorageKey(scope), JSON.stringify(list));
  } catch {
    // Private mode or storage full: uploads still work, they just can't resume.
  }
}

async function fetchResume(resumeUrl: string, uploadId: string): Promise<ResumeRes | null> {
  try {
    const res = await fetch(resumeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as ResumeRes | null;
    return body?.token ? body : null;
  } catch {
    return null;
  }
}

// Extra fields for the token request (the staff uploader's team), plus a
// short tag shown on the file row. Return { error } to stop the upload.
export type FilmUploadPrep = { body?: Record<string, unknown>; tag?: string } | { error: string };

interface Props {
  tokenUrl: string;
  completeUrl: string;
  resumeUrl: string;
  // localStorage scope for uploads this browser can pick back up.
  resumeScope: string;
  // Fields shown at the top of the form, above "Your name".
  before?: ReactNode;
  prepare?: () => FilmUploadPrep;
  defaultName?: string;
  doneMessage?: string;
}

export function FilmUploader({
  tokenUrl,
  completeUrl,
  resumeUrl,
  resumeScope: scope,
  before,
  prepare,
  defaultName = "",
  doneMessage = "All videos uploaded — you can close this page.",
}: Props) {
  const [uploaderName, setUploaderName] = useState(defaultName);
  const [gameDate, setGameDate] = useState(() => churchToday());
  const [opponent, setOpponent] = useState("");
  const [ourScore, setOurScore] = useState("");
  const [theirScore, setTheirScore] = useState("");
  const [files, setFiles] = useState<FileUi[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef(uploaderName);
  const gameDateRef = useRef(gameDate);
  const opponentRef = useRef(opponent);
  const ourScoreRef = useRef(ourScore);
  const theirScoreRef = useRef(theirScore);
  const prepareRef = useRef(prepare);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<FileUi[]>([]);
  const lastProgressRef = useRef(new Map<string, number>());
  const retryingRef = useRef(new Set<string>());
  const autoRetriesRef = useRef(new Map<string, number>());

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    nameRef.current = uploaderName;
  }, [uploaderName]);
  useEffect(() => {
    gameDateRef.current = gameDate;
  }, [gameDate]);
  useEffect(() => {
    opponentRef.current = opponent;
  }, [opponent]);
  useEffect(() => {
    ourScoreRef.current = ourScore;
  }, [ourScore]);
  useEffect(() => {
    theirScoreRef.current = theirScore;
  }, [theirScore]);
  useEffect(() => {
    prepareRef.current = prepare;
  }, [prepare]);

  const uppy = useMemo(() => {
    const instance = new Uppy({
      autoProceed: false,
      restrictions: {
        maxFileSize: MAX_UPLOAD_BYTES,
        allowedFileTypes: ["video/*", ".mov", ".mp4", ".m4v", ".hevc", ".webm", ".mkv", ".avi"],
      },
    }).use(Tus, {
      endpoint: "https://invalid.example/tus",
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      // Server already created the TUS upload. The browser only PATCHes.
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      allowedMetaFields: ["bucketName", "objectName", "contentType", "cacheControl"],
      // Set x-signature once. A second copy of the same header is merged with
      // a comma by Safari XHR, and Storage then rejects it as Invalid Compact JWS.
      headers: (file) => tusSignedHeaders(String(file.meta.filmToken ?? "")),
    });
    return instance;
  }, []);

  useEffect(() => {
    const patch = (id: string, next: Partial<FileUi>) => {
      setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, ...next } : f)));
    };

    const onAdded = (file: { id: string; name: string; size: number | null }) => {
      setFiles((cur) => {
        if (cur.some((f) => f.id === file.id)) return cur;
        return [...cur, { id: file.id, name: file.name, bytes: 0, total: file.size ?? 0, status: "waiting" }];
      });
    };
    const onProgress = (
      file: { id: string } | undefined,
      progress: { bytesUploaded: number; bytesTotal: number | null }
    ) => {
      if (!file) return;
      lastProgressRef.current.set(file.id, Date.now());
      autoRetriesRef.current.delete(file.id);
      patch(file.id, {
        bytes: progress.bytesUploaded,
        total: progress.bytesTotal ?? 0,
        status: "uploading",
      });
    };
    const onSuccess = (file: { id: string; size?: number | null; meta?: Record<string, unknown> } | undefined) => {
      if (!file) return;
      patch(file.id, {
        status: "done",
        finishedAt: Date.now(),
        ...(typeof file.size === "number" ? { bytes: file.size, total: file.size } : {}),
      });
      lastProgressRef.current.delete(file.id);
      const uploadId = file.meta?.filmUploadId;
      if (typeof uploadId === "string" && uploadId) {
        writeSaved(scope, removeSavedUpload(readSaved(scope), uploadId));
        void fetch(completeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });
      }
    };
    const onError = (file: { id: string } | undefined, error: { message?: string }) => {
      if (!file) return;
      lastProgressRef.current.delete(file.id);
      patch(file.id, { status: "error", error: friendlyUploadError(error.message) });
    };
    const onRemoved = (file: { id: string }) => {
      setFiles((cur) => cur.filter((f) => f.id !== file.id));
    };

    uppy.on("file-added", onAdded);
    uppy.on("upload-progress", onProgress);
    uppy.on("upload-success", onSuccess);
    uppy.on("upload-error", onError);
    uppy.on("file-removed", onRemoved);
    return () => {
      uppy.off("file-added", onAdded);
      uppy.off("upload-progress", onProgress);
      uppy.off("upload-success", onSuccess);
      uppy.off("upload-error", onError);
      uppy.off("file-removed", onRemoved);
      uppy.cancelAll();
    };
  }, [scope, completeUrl, uppy]);

  /** Point an Uppy file at an upload the server already has. */
  const applyResume = useCallback(
    (fileId: string, body: ResumeRes, uploadUrl: string) => {
      const file = uppy.getFile(fileId);
      if (!file) return;
      uppy.getPlugin("Tus")?.setOptions({ endpoint: body.endpoint });
      uppy.setFileState(fileId, { tus: { uploadUrl } });
      uppy.setFileMeta(fileId, {
        bucketName: body.bucket,
        objectName: body.path,
        contentType: body.contentType || file.type,
        cacheControl: "3600",
        filmToken: body.token,
        filmUploadId: body.uploadId,
      });
    },
    [uppy]
  );

  const mintFile = useCallback(
    async (fileId: string, prep?: FilmUploadPrep): Promise<boolean> => {
      const file = uppy.getFile(fileId);
      if (!file) return false;
      const fingerprint = typeof file.meta.filmFingerprint === "string" ? file.meta.filmFingerprint : "";
      const saved = fingerprint ? findSavedUpload(readSaved(scope), fingerprint) : null;
      if (saved) {
        const resumed = await fetchResume(resumeUrl, saved.uploadId);
        if (resumed) {
          applyResume(fileId, resumed, saved.uploadUrl);
          setFormError(null);
          setFiles((cur) =>
            cur.map((f) => (f.id === fileId ? { ...f, resumed: true, gameLine: resumed.gameLine } : f))
          );
          return true;
        }
        writeSaved(scope, removeSavedUpload(readSaved(scope), saved.uploadId));
      }
      const name = nameRef.current.trim();
      if (!name) {
        setFormError("Put your name in first, so the coaches know who sent it.");
        uppy.removeFile(fileId);
        return false;
      }
      const extra = prep ?? prepareRef.current?.() ?? {};
      if ("error" in extra) {
        setFormError(extra.error);
        uppy.removeFile(fileId);
        return false;
      }
      const snapshot = {
        gameDate: gameDateRef.current.trim() || churchToday(),
        opponent: opponentRef.current.trim() || null,
        ourScore: ourScoreRef.current.trim() || null,
        theirScore: theirScoreRef.current.trim() || null,
      };
      setFormError(null);
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(extra.body ?? {}),
          uploaderName: name,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          gameDate: snapshot.gameDate,
          opponent: snapshot.opponent,
          ourScore: snapshot.ourScore,
          theirScore: snapshot.theirScore,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as TokenRes & { error?: string };
      if (!res.ok || !body.token || !body.uploadUrl) {
        uppy.removeFile(fileId);
        setFormError(body.error ?? "Couldn't start that upload.");
        return false;
      }
      uppy.getPlugin("Tus")?.setOptions({ endpoint: body.endpoint });
      uppy.setFileState(fileId, { tus: { uploadUrl: body.uploadUrl } });
      uppy.setFileMeta(fileId, {
        bucketName: body.bucket,
        objectName: body.path,
        contentType: body.contentType || file.type,
        cacheControl: "3600",
        filmToken: body.token,
        filmUploadId: body.uploadId,
        filmPrep: extra,
      });
      if (fingerprint) {
        writeSaved(
          scope,
          upsertSavedUpload(readSaved(scope), {
            fingerprint,
            uploadId: body.uploadId,
            uploadUrl: body.uploadUrl,
            name: file.name,
            savedAt: Date.now(),
          })
        );
      }
      setFiles((cur) =>
        cur.map((f) =>
          f.id === fileId
            ? {
                ...f,
                tag: extra.tag,
                gameDate: snapshot.gameDate,
                opponent: snapshot.opponent,
                ourScore: snapshot.ourScore ? Number(snapshot.ourScore) : null,
                theirScore: snapshot.theirScore ? Number(snapshot.theirScore) : null,
              }
            : f
        )
      );
      return true;
    },
    [applyResume, resumeUrl, scope, tokenUrl, uppy]
  );

  const addNativeFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (incoming.length === 0) return;
      // One snapshot for the whole batch, so changing the team while the
      // first file mints can't split a drop across two teams.
      const prep = prepareRef.current?.();
      if (prep && "error" in prep) {
        setFormError(prep.error);
        return;
      }
      void (async () => {
        const ids: string[] = [];
        for (const file of incoming) {
          let fingerprint = "";
          try {
            fingerprint = await fileFingerprint(file);
          } catch {
            // No fingerprint: this upload just can't be picked back up later.
          }
          try {
            ids.push(
              uppy.addFile({ name: file.name, type: file.type, data: file, meta: { filmFingerprint: fingerprint } })
            );
          } catch (err) {
            setFormError(err instanceof Error ? err.message : "That file couldn't be added.");
          }
        }
        let ready = 0;
        for (const id of ids) {
          if (await mintFile(id, prep)) ready += 1;
        }
        if (ready > 0) await uppy.upload();
      })();
    },
    [mintFile, uppy]
  );

  const retryFile = useCallback(
    async (fileId: string) => {
      const file = uppy.getFile(fileId);
      if (!file || retryingRef.current.has(fileId)) return;
      retryingRef.current.add(fileId);
      try {
        setFiles((cur) =>
          cur.map((f) => (f.id === fileId ? { ...f, status: "uploading", error: undefined } : f))
        );
        const uploadId = typeof file.meta.filmUploadId === "string" ? file.meta.filmUploadId : "";
        const uploadUrl = file.tus?.uploadUrl;
        // The signed token runs out after a couple of hours; get a fresh one
        // for the same upload so Storage carries on from its offset.
        const fresh = uploadId && uploadUrl ? await fetchResume(resumeUrl, uploadId) : null;
        const prep = file.meta.filmPrep as FilmUploadPrep | undefined;
        if (fresh && uploadUrl) applyResume(fileId, fresh, uploadUrl);
        else if (!(await mintFile(fileId, prep))) return;
        lastProgressRef.current.set(fileId, Date.now());
        await uppy.retryUpload(fileId);
      } catch {
        // upload-error handler records the failure
      } finally {
        retryingRef.current.delete(fileId);
      }
    },
    [applyResume, mintFile, resumeUrl, uppy]
  );

  const active = files.some((f) => f.status === "uploading" || f.status === "waiting");

  // Coming back to the page (or back online): pick up anything that failed
  // while the phone was locked or in another app, and restart a request
  // that went quiet.
  useEffect(() => {
    const revive = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      for (const f of filesRef.current) {
        if (f.status === "error") {
          // Give up retrying on our own after a few tries with no progress;
          // the Retry button still works.
          const tries = autoRetriesRef.current.get(f.id) ?? 0;
          if (tries >= MAX_AUTO_RETRIES) continue;
          autoRetriesRef.current.set(f.id, tries + 1);
          void retryFile(f.id);
        } else if (f.status === "uploading") {
          const last = lastProgressRef.current.get(f.id) ?? now;
          if (now - last > STALL_MS) {
            lastProgressRef.current.set(f.id, now);
            const file = uppy.getFile(f.id);
            if (file && !file.isPaused) {
              uppy.pauseResume(f.id);
              uppy.pauseResume(f.id);
            }
          }
        }
      }
    };
    document.addEventListener("visibilitychange", revive);
    window.addEventListener("online", revive);
    const timer = window.setInterval(revive, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("online", revive);
      window.clearInterval(timer);
    };
  }, [retryFile, uppy]);

  // Keep the screen on while anything is uploading. iPhones stop a web
  // upload when the screen locks; this stops the auto-lock (iOS 16.4+).
  const [screenAwake, setScreenAwake] = useState(false);
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
    }).wakeLock;
    if (!wl) return;
    let lock: WakeLockLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || lock || document.visibilityState !== "visible") return;
      try {
        lock = await wl.request("screen");
        if (cancelled) {
          void lock.release();
          lock = null;
          return;
        }
        setScreenAwake(true);
        (lock as unknown as EventTarget).addEventListener?.("release", () => {
          lock = null;
          setScreenAwake(false);
        });
      } catch {
        setScreenAwake(false);
      }
    };
    void acquire();
    // The browser drops the lock whenever the page is hidden; take it back.
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) void lock.release();
      lock = null;
      setScreenAwake(false);
    };
  }, [active]);

  // Uploads this browser started earlier and didn't finish (page closed,
  // phone locked). Shown as a reminder to pick the same video again.
  const savedRaw = useSyncExternalStore(
    subscribeStorage,
    () => readSavedRaw(scope),
    () => null
  );
  const pendingNames = parseSavedUploads(savedRaw)
    .filter((s) => !files.some((f) => f.name === s.name && f.status !== "error"))
    .map((s) => s.name);

  const allDone = allUploadsFinished(files);
  const largeFileNote = files.some((f) => isLargeFilmFile(f.total || f.bytes));

  return (
    <>
      {allDone ? (
        <p className={styles.noteOk} role="status">
          {doneMessage}
        </p>
      ) : (
        <p className={styles.note}>
          Keep this page open on the screen and your phone plugged in until every video finishes.
          {screenAwake
            ? " The screen stays on while it uploads."
            : " If the phone locks or you switch apps, the upload pauses — come back to this page and it carries on."}{" "}
          Wi-Fi is much faster than cellular.
        </p>
      )}
      {pendingNames.length > 0 && (
        <p className={styles.sizeHint} role="status">
          {pendingNames.length === 1
            ? `${pendingNames[0]} didn't finish last time. `
            : `${pendingNames.length} videos didn't finish last time. `}
          Pick the same video again and it carries on from where it stopped — no need to start over.
        </p>
      )}
      <div className={styles.card}>
        {before}
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input
            className={styles.input}
            value={uploaderName}
            onChange={(e) => setUploaderName(e.target.value)}
            placeholder="So coaches know who sent it"
            required
            autoComplete="name"
            enterKeyHint="next"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Game date</span>
          <input
            className={styles.input}
            type="date"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value || churchToday())}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Opponent</span>
          <input
            className={styles.input}
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Who did we play?"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
          />
        </label>
        <fieldset className={styles.scoreFields}>
          <legend className={styles.label}>Score</legend>
          <p className={styles.hint}>Optional — leave blank if the game isn&apos;t over.</p>
          <div className={styles.scoreRow}>
            <label className={styles.field}>
              <span className={styles.subLabel}>Our score</span>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={3}
                value={theirScore}
                onChange={(e) => setTheirScore(digitsOnly(e.target.value))}
                placeholder="—"
              />
            </label>
          </div>
        </fieldset>
        <div
          className={`${styles.drop} ${dragOver ? styles.dropActive : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addNativeFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <input
            ref={inputRef}
            className={styles.fileInput}
            type="file"
            accept="video/*,.mov,.mp4,.m4v,.hevc"
            multiple
            onChange={(e) => {
              if (e.target.files) addNativeFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 16 }}>Drop a video here</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
            or tap to pick from your camera roll. Phone .mov files are fine. Up to 20 GB each.
          </div>
        </div>
        <p className={styles.tip}>
          Tip: record in 1080p at 30 fps (iPhone: Settings → Camera → Record Video). 4K files are
          3–6× bigger and upload much slower.
        </p>
        {largeFileNote && (
          <p className={styles.sizeHint} role="status">
            This file is over 4 GB. Next time, 1080p at 30 fps uploads much faster.
          </p>
        )}
        {formError && <p className={styles.error}>{formError}</p>}
        {files.length > 0 && (
          <div className={styles.files}>
            {files.map((f) => {
              const pct = f.total > 0 ? Math.min(100, Math.round((f.bytes / f.total) * 100)) : 0;
              const size = formatBytes(f.total || f.bytes);
              const gameLine = f.gameLine ?? formatFilmGameLine({
                gameDate: f.gameDate,
                opponent: f.opponent,
                ourScore: f.ourScore,
                theirScore: f.theirScore,
              });
              const tagged = f.tag ? `${f.tag} · ${f.name}` : f.name;
              if (f.status === "done") {
                return (
                  <div key={f.id} className={`${styles.fileRow} ${styles.fileRowDone}`} role="status">
                    <div className={styles.uploadedHead}>
                      <span className={styles.check} aria-hidden>
                        ✓
                      </span>
                      <div>
                        <p className={styles.uploadedTitle}>✓ Uploaded</p>
                        <p className={styles.fileName}>{tagged}</p>
                        <p className={styles.fileDetail}>
                          {size}
                          {f.finishedAt ? ` · ${formatFinishTime(f.finishedAt)}` : ""}
                        </p>
                        {gameLine && <p className={styles.fileGame}>{gameLine}</p>}
                      </div>
                    </div>
                    <div className={styles.bar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
                      <div className={`${styles.barFill} ${styles.barFillOk}`} style={{ width: "100%" }} />
                    </div>
                  </div>
                );
              }
              if (f.status === "error") {
                return (
                  <div key={f.id} className={`${styles.fileRow} ${styles.fileRowError}`} role="alert">
                    <p className={styles.failedTitle}>Failed</p>
                    <p className={styles.fileName}>{tagged}</p>
                    {f.error && <p className={styles.error}>{f.error}</p>}
                    <div className={styles.bar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <div className={`${styles.barFill} ${styles.barFillError}`} />
                    </div>
                    <button className={styles.retry} type="button" onClick={() => void retryFile(f.id)}>
                      Retry
                    </button>
                  </div>
                );
              }
              return (
                <div key={f.id} className={styles.fileRow}>
                  <div className={styles.fileMeta}>
                    <span>
                      {tagged}
                      {f.resumed ? " · picking up where it stopped" : ""}
                    </span>
                    <span>{`${pct}% · ${formatBytes(f.bytes)} / ${formatBytes(f.total)}`}</span>
                  </div>
                  <div className={styles.bar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <div className={styles.barFill} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
