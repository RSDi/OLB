"use client";

// In-page film player. Plays from YouTube (fast, any browser) once the video
// is there; before that, the phone's original in a <video> tag, which only
// some browsers can decode. Both sit behind one small controller so speed,
// skips, frame steps, markers and share links work the same.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pill } from "../../components/ui";
import { addFilmMarker, removeFilmMarker } from "../../../lib/film/admin-actions";
import {
  BIG_SKIP_S,
  FRAME_STEP_S,
  MARKER_LABEL_MAX,
  PLAYER_SPEEDS,
  SMALL_SKIP_S,
  clampTime,
  currentMarkerId,
  filmMomentPath,
  formatTimecode,
  nextSpeed,
  type FilmMarker,
} from "../../../lib/film/player-logic";
import styles from "./player.module.css";

type Source = { kind: "youtube"; videoId: string } | { kind: "file"; url: string };

interface Controller {
  time(): number;
  duration(): number | null;
  paused(): boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void;
  destroy(): void;
}

// ─── YouTube IFrame API ─────────────────────────────────────────────────────

type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
  setPlaybackRate(r: number): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onError?: (e: { data: number }) => void };
    }
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;
function loadYoutubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => {
      ytApi = null;
      reject(new Error("Couldn't load the YouTube player."));
    };
    document.head.appendChild(tag);
  });
  return ytApi;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FilmPlayer({
  uploadId,
  title,
  source,
  startAt,
  markers,
  canManage,
  onClose,
  onMarkersChange,
  momentPath = filmMomentPath,
  fileErrorText,
  onFirstPlay,
}: {
  uploadId: string;
  title: string;
  source: Source;
  startAt: number;
  markers: FilmMarker[];
  canManage: boolean;
  onClose: () => void;
  onMarkersChange: (next: FilmMarker[]) => void;
  /** Where "Copy link to this moment" points. Defaults to the portal Film page. */
  momentPath?: (uploadId: string, atSeconds: number) => string;
  /** Shown when the browser can't decode the original file. */
  fileErrorText?: string;
  /** Called once, the first time the video is actually playing. */
  onFirstPlay?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ctrlRef = useRef<Controller | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(startAt);
  const [duration, setDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [rate, setRate] = useState(1);
  const [marking, setMarking] = useState<{ at: number; label: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Build the controller for this source.
  useEffect(() => {
    let cancelled = false;
    if (source.kind === "youtube") {
      const host = document.createElement("div");
      mountRef.current?.appendChild(host);
      let player: YTPlayer | null = null;
      loadYoutubeApi()
        .then((YT) => {
          if (cancelled) return;
          player = new YT.Player(host, {
            videoId: source.videoId,
            playerVars: { start: Math.floor(startAt), rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1 },
            events: {
              onReady: () => {
                if (cancelled || !player) return;
                const p = player;
                ctrlRef.current = {
                  time: () => p.getCurrentTime() || 0,
                  duration: () => p.getDuration() || null,
                  paused: () => p.getPlayerState() !== 1 && p.getPlayerState() !== 3,
                  play: () => p.playVideo(),
                  pause: () => p.pauseVideo(),
                  seek: (t) => p.seekTo(t, true),
                  setRate: (r) => p.setPlaybackRate(r),
                  destroy: () => p.destroy(),
                };
                if (startAt > 0) p.seekTo(startAt, true);
                setReady(true);
              },
              onError: (e) => {
                if (cancelled) return;
                setLoadError(
                  e.data === 101 || e.data === 150
                    ? "YouTube won't play this video outside YouTube. Turn on embedding for it in YouTube Studio, or use Open on YouTube."
                    : "YouTube couldn't play this video. Try Open on YouTube."
                );
              },
            },
          });
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load the YouTube player.");
        });
      return () => {
        cancelled = true;
        ctrlRef.current = null;
        try {
          player?.destroy();
        } catch {
          // Already gone.
        }
        host.remove();
      };
    }
    const v = videoRef.current;
    if (!v) return;
    ctrlRef.current = {
      time: () => v.currentTime || 0,
      duration: () => (Number.isFinite(v.duration) ? v.duration : null),
      paused: () => v.paused,
      play: () => void v.play().catch(() => undefined),
      pause: () => v.pause(),
      seek: (t) => {
        v.currentTime = t;
      },
      setRate: (r) => {
        v.playbackRate = r;
      },
      destroy: () => undefined,
    };
    const onMeta = () => {
      if (startAt > 0) v.currentTime = startAt;
      setReady(true);
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      cancelled = true;
      v.removeEventListener("loadedmetadata", onMeta);
      ctrlRef.current = null;
    };
  }, [source, startAt]);

  // Tick the clock for the time display, timeline and current marker.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const c = ctrlRef.current;
      if (!c) return;
      setNow(c.time());
      setDuration(c.duration());
      setPaused(c.paused());
    }, 250);
    return () => clearInterval(t);
  }, [ready]);

  const firstPlayRef = useRef(onFirstPlay);
  useEffect(() => {
    firstPlayRef.current = onFirstPlay;
  }, [onFirstPlay]);
  const playedRef = useRef(false);
  useEffect(() => {
    if (paused || !ready || playedRef.current) return;
    playedRef.current = true;
    firstPlayRef.current?.();
  }, [paused, ready]);

  const seekBy = useCallback((delta: number) => {
    const c = ctrlRef.current;
    if (!c) return;
    const t = clampTime(c.time() + delta, c.duration());
    c.seek(t);
    setNow(t);
  }, []);

  const seekTo = useCallback((t: number) => {
    const c = ctrlRef.current;
    if (!c) return;
    const at = clampTime(t, c.duration());
    c.seek(at);
    setNow(at);
  }, []);

  const toggle = useCallback(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (c.paused()) c.play();
    else c.pause();
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    const c = ctrlRef.current;
    if (!c) return;
    c.pause();
    const t = clampTime(c.time() + dir * FRAME_STEP_S, c.duration());
    c.seek(t);
    setNow(t);
  }, []);

  const pickRate = useCallback((r: number) => {
    ctrlRef.current?.setRate(r);
    setRate(r);
  }, []);

  const startMark = useCallback(() => {
    const c = ctrlRef.current;
    if (!c) return;
    c.pause();
    setMarking({ at: c.time(), label: "" });
  }, []);

  async function saveMark() {
    if (!marking) return;
    setBusy(true);
    setNote(null);
    const result = await addFilmMarker(uploadId, { atSeconds: marking.at, label: marking.label });
    setBusy(false);
    if (result.error || !result.marker) {
      setNote(result.error ?? "Couldn't save the marker.");
      return;
    }
    onMarkersChange([...markers, result.marker].sort((a, b) => a.at_seconds - b.at_seconds));
    setMarking(null);
  }

  async function deleteMark(m: FilmMarker) {
    if (!confirm(`Remove the marker "${m.label}"?`)) return;
    setBusy(true);
    setNote(null);
    const result = await removeFilmMarker(m.id);
    setBusy(false);
    if (result.error) {
      setNote(result.error);
      return;
    }
    onMarkersChange(markers.filter((x) => x.id !== m.id));
  }

  async function copyMoment() {
    const t = ctrlRef.current?.time() ?? now;
    const url = `${window.location.origin}${momentPath(uploadId, t)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote(`Link to ${formatTimecode(t)} copied.`);
    } catch {
      setNote(url);
    }
  }

  // Keyboard shortcuts while the player is open (not while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const big = e.shiftKey ? BIG_SKIP_S : SMALL_SKIP_S;
      switch (e.key) {
        case " ":
        case "k":
          toggle();
          break;
        case "ArrowLeft":
          seekBy(-big);
          break;
        case "ArrowRight":
          seekBy(big);
          break;
        case "j":
          seekBy(-BIG_SKIP_S);
          break;
        case "l":
          seekBy(BIG_SKIP_S);
          break;
        case ",":
          step(-1);
          break;
        case ".":
          step(1);
          break;
        case "<":
          pickRate(nextSpeed(rate, -1));
          break;
        case ">":
          pickRate(nextSpeed(rate, 1));
          break;
        case "m":
          if (canManage) startMark();
          else return;
          break;
        case "Escape":
          if (marking) setMarking(null);
          else onClose();
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy, step, pickRate, rate, canManage, startMark, marking, onClose]);

  const activeMarker = currentMarkerId(markers, now);
  const pct = duration ? Math.min(100, (now / duration) * 100) : 0;

  return (
    <div className={`rsd-card ${styles.panel}`} data-tour="film-player">
      <div className={styles.screen}>
        {source.kind === "youtube" ? (
          <div ref={mountRef} className={styles.frame} />
        ) : (
          <video
            ref={videoRef}
            src={source.url}
            controls
            playsInline
            autoPlay
            preload="metadata"
            className={styles.frame}
            onError={() =>
              setLoadError(
                fileErrorText ??
                  "This browser can't play the phone's original file (iPhone HDR video often won't play in Chrome). It will play here once it's on YouTube. Try Safari, or Download original under More."
              )
            }
          />
        )}
      </div>
      {loadError && <p className={styles.error}>{loadError}</p>}

      <div
        className={styles.timeline}
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration ?? 0)}
        aria-valuenow={Math.round(now)}
        aria-valuetext={formatTimecode(now)}
        tabIndex={-1}
        onClick={(e) => {
          if (!duration) return;
          const box = e.currentTarget.getBoundingClientRect();
          seekTo(((e.clientX - box.left) / box.width) * duration);
        }}
        data-tour="film-player-timeline"
      >
        <div className={styles.timelineFill} style={{ width: `${pct}%` }} />
        {duration
          ? markers.map((m) => (
              <span
                key={m.id}
                className={styles.tick}
                style={{ left: `${Math.min(100, (m.at_seconds / duration) * 100)}%` }}
                title={`${formatTimecode(m.at_seconds)} ${m.label}`}
              />
            ))
          : null}
      </div>

      <div className={styles.controls} data-tour="film-player-controls">
        <span className={styles.clock}>
          {formatTimecode(now)}
          {duration ? ` / ${formatTimecode(duration)}` : ""}
        </span>
        <div className={styles.group}>
          <button type="button" className={styles.btn} onClick={() => seekBy(-BIG_SKIP_S)} disabled={!ready} title="Back 15 seconds (Shift+←)">
            −15
          </button>
          <button type="button" className={styles.btn} onClick={() => seekBy(-SMALL_SKIP_S)} disabled={!ready} title="Back 5 seconds (←)">
            −5
          </button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={toggle} disabled={!ready} title="Play or pause (Space)">
            {paused ? "Play" : "Pause"}
          </button>
          <button type="button" className={styles.btn} onClick={() => seekBy(SMALL_SKIP_S)} disabled={!ready} title="Forward 5 seconds (→)">
            +5
          </button>
          <button type="button" className={styles.btn} onClick={() => seekBy(BIG_SKIP_S)} disabled={!ready} title="Forward 15 seconds (Shift+→)">
            +15
          </button>
        </div>
        <div className={styles.group}>
          <button type="button" className={styles.btn} onClick={() => step(-1)} disabled={!ready} title="Back one frame (,)" aria-label="Back one frame">
            ‹ Frame
          </button>
          <button type="button" className={styles.btn} onClick={() => step(1)} disabled={!ready} title="Forward one frame (.)" aria-label="Forward one frame">
            Frame ›
          </button>
        </div>
        <div className={styles.group} role="group" aria-label="Speed" data-tour="film-player-speed">
          {PLAYER_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.btn}
              aria-pressed={rate === s}
              onClick={() => pickRate(s)}
              disabled={!ready}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className={styles.markerBar} data-tour="film-player-markers">
        {canManage && !marking && (
          <Pill size="sm" variant="accent" onClick={startMark} disabled={!ready || busy}>
            + Mark
          </Pill>
        )}
        <Pill size="sm" onClick={() => void copyMoment()} disabled={!ready}>
          Copy link to this moment
        </Pill>
        {source.kind === "youtube" && (
          <Pill
            size="sm"
            onClick={() =>
              window.open(
                `https://www.youtube.com/watch?v=${encodeURIComponent(source.videoId)}&t=${Math.floor(now)}s`,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            Open on YouTube
          </Pill>
        )}
        <Pill size="sm" variant="ghost" onClick={onClose}>
          Close player
        </Pill>
      </div>

      {marking && (
        <form
          className={styles.markForm}
          onSubmit={(e) => {
            e.preventDefault();
            void saveMark();
          }}
        >
          <span className={styles.clock}>{formatTimecode(marking.at)}</span>
          <input
            className={styles.markInput}
            value={marking.label}
            onChange={(e) => setMarking({ ...marking, label: e.target.value })}
            placeholder="Name it: Q2 start, Press break, #12 steal"
            maxLength={MARKER_LABEL_MAX}
            autoFocus
            enterKeyHint="done"
            aria-label="Marker name"
          />
          <Pill size="sm" variant="accent" type="submit" disabled={busy || !marking.label.trim()}>
            Save
          </Pill>
          <Pill size="sm" variant="ghost" onClick={() => setMarking(null)}>
            Cancel
          </Pill>
        </form>
      )}

      {note && <p className={styles.note}>{note}</p>}

      {markers.length > 0 && (
        <ol className={styles.markers} aria-label="Jump to">
          {markers.map((m) => (
            <li key={m.id} className={styles.markerItem} data-active={m.id === activeMarker || undefined}>
              <button type="button" className={styles.markerJump} onClick={() => seekTo(m.at_seconds)}>
                <span className={styles.markerTime}>{formatTimecode(m.at_seconds)}</span>
                {m.label}
              </button>
              {canManage && (
                <button
                  type="button"
                  className={styles.markerRemove}
                  onClick={() => void deleteMark(m)}
                  aria-label={`Remove ${m.label}`}
                  disabled={busy}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className={styles.title}>
        {title}
        <span className={styles.keys}>
          Keys: Space play · ← → 5s · Shift ← → 15s · , . frame · &lt; &gt; speed{canManage ? " · M mark" : ""} · Esc close
        </span>
      </div>
    </div>
  );
}
