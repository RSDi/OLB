"use client";
// Parent upload page: shared-code gate, then Uppy + TUS. The server creates
// the TUS upload; this page PATCHes file bytes straight to Supabase Storage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { tusSignedHeaders } from "../../../lib/film/tus";
import { churchToday } from "../../../lib/dates/today";
import { formatFilmGameLine } from "../../../lib/film/game-meta";
import { allUploadsFinished, formatBytes, formatFinishTime } from "../../../lib/film/guest-status";
import { MAX_UPLOAD_BYTES, TUS_CHUNK_SIZE } from "../../../lib/film/types";
import styles from "../../film/film.module.css";

interface Props {
  team: string;
  label: string;
  unlocked: boolean;
}

type FileUi = {
  id: string;
  name: string;
  bytes: number;
  total: number;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
  finishedAt?: number;
  gameDate?: string;
  opponent?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
};

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

export function TeamUpload({ team, label, unlocked: initiallyUnlocked }: Props) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [code, setCode] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [uploaderName, setUploaderName] = useState("");
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
  const inputRef = useRef<HTMLInputElement>(null);

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
      // Server already created the TUS upload. The phone only PATCHes.
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
      const uploadId = file.meta?.filmUploadId;
      if (typeof uploadId === "string" && uploadId) {
        void fetch("/film/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });
      }
    };
    const onError = (file: { id: string } | undefined, error: { message?: string }) => {
      if (!file) return;
      patch(file.id, { status: "error", error: error.message ?? "Upload failed." });
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
  }, [uppy]);

  const mintFile = useCallback(
    async (fileId: string): Promise<boolean> => {
      const file = uppy.getFile(fileId);
      if (!file) return false;
      const name = nameRef.current.trim();
      if (!name) {
        setFormError("Put your name in first, so the coaches know who sent it.");
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
      const res = await fetch("/film/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      });
      setFiles((cur) =>
        cur.map((f) =>
          f.id === fileId
            ? {
                ...f,
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
    [uppy]
  );

  const addNativeFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (incoming.length === 0) return;
      const ids: string[] = [];
      for (const file of incoming) {
        try {
          ids.push(uppy.addFile({ name: file.name, type: file.type, data: file }));
        } catch (err) {
          setFormError(err instanceof Error ? err.message : "That file couldn't be added.");
        }
      }
      void (async () => {
        let ready = 0;
        for (const id of ids) {
          if (await mintFile(id)) ready += 1;
        }
        if (ready > 0) await uppy.upload();
      })();
    },
    [mintFile, uppy]
  );

  const retryFile = useCallback(
    async (fileId: string) => {
      const file = uppy.getFile(fileId);
      if (!file) return;
      setFiles((cur) =>
        cur.map((f) => (f.id === fileId ? { ...f, status: "uploading", error: undefined } : f))
      );
      const hasUrl = Boolean(file.tus?.uploadUrl && file.meta.filmToken);
      if (!hasUrl && !(await mintFile(fileId))) return;
      try {
        await uppy.retryUpload(fileId);
      } catch {
        // upload-error handler records the failure
      }
    },
    [mintFile, uppy]
  );

  const allDone = allUploadsFinished(files);

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
          <>
            {allDone ? (
              <p className={styles.noteOk} role="status">
                All videos uploaded — you can close this page.
              </p>
            ) : (
              <p className={styles.note}>
                Keep this page open and keep your phone plugged in until every video finishes. A full
                game can take a while on cellular — Wi-Fi is better.
              </p>
            )}
            <div className={styles.card}>
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
              {formError && <p className={styles.error}>{formError}</p>}
              {files.length > 0 && (
                <div className={styles.files}>
                  {files.map((f) => {
                    const pct = f.total > 0 ? Math.min(100, Math.round((f.bytes / f.total) * 100)) : 0;
                    const size = formatBytes(f.total || f.bytes);
                    const gameLine = formatFilmGameLine({
                      gameDate: f.gameDate,
                      opponent: f.opponent,
                      ourScore: f.ourScore,
                      theirScore: f.theirScore,
                    });
                    if (f.status === "done") {
                      return (
                        <div key={f.id} className={`${styles.fileRow} ${styles.fileRowDone}`} role="status">
                          <div className={styles.uploadedHead}>
                            <span className={styles.check} aria-hidden>
                              ✓
                            </span>
                            <div>
                              <p className={styles.uploadedTitle}>✓ Uploaded</p>
                              <p className={styles.fileName}>{f.name}</p>
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
                          <p className={styles.fileName}>{f.name}</p>
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
                          <span>{f.name}</span>
                          <span>
                            {`${pct}% · ${formatBytes(f.bytes)} / ${formatBytes(f.total)}`}
                          </span>
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
        )}
      </div>
    </div>
  );
}
