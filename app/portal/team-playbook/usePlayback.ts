"use client";
// Plays a Team Playbook play. Two ways:
//   * With the coach's voice: when Sound is on and every step knows where it
//     is in the coach's video, the video plays and the animation follows it.
//   * Otherwise the animation runs at an even pace, pausing at each step; with
//     Sound on, the device reads each step's caption aloud.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { hasVideoTiming, type PlayDiagram } from "../../../lib/team-playbook/diagram";
import { prepare, timeToT, tToTime } from "../../../lib/team-playbook/engine";

const HOLD_MS = 700;

function stopSpeech(speaking: { current: boolean }) {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
  speaking.current = false;
}

export function usePlayback(
  diagram: PlayDiagram | null,
  videoRef: RefObject<HTMLVideoElement | null>,
  hasVideo: boolean,
  sound: boolean,
  speed: number,
) {
  const prepared = useMemo(() => (diagram ? prepare(diagram) : null), [diagram]);
  const n = diagram?.steps.length ?? 0;
  const [T, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const followVideo = !!(diagram && hasVideo && sound && hasVideoTiming(diagram));

  // A new play starts over, stopped.
  const [shownDiagram, setShownDiagram] = useState(diagram);
  if (shownDiagram !== diagram) {
    setShownDiagram(diagram);
    setT(0);
    setPlaying(false);
  }

  const tRef = useRef(0);
  const target = useRef<number | null>(null);
  const holdUntil = useRef(0);
  const spoken = useRef(-1);
  const speaking = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    tRef.current = T;
  }, [T]);

  // Leaving a play (or the page): stop the voice and the video.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      cancelAnimationFrame(raf.current);
      stopSpeech(speaking);
      spoken.current = -1;
      target.current = null;
      tRef.current = 0;
      video?.pause();
    };
  }, [diagram, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [videoRef, speed, hasVideo]);

  const set = (v: number) => {
    tRef.current = v;
    setT(v);
  };

  const speak = useCallback(
    (k: number) => {
      spoken.current = k;
      if (!sound || !diagram || !("speechSynthesis" in window)) return;
      try {
        stopSpeech(speaking);
        const s = diagram.steps[k];
        const u = new SpeechSynthesisUtterance(`${s.title}. ${s.note}`);
        u.rate = Math.min(1.3, 0.95 * speed + 0.05);
        u.onend = u.onerror = () => (speaking.current = false);
        speaking.current = true;
        window.speechSynthesis.speak(u);
      } catch {
        speaking.current = false;
      }
    },
    [diagram, sound, speed],
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    target.current = null;
    stopSpeech(speaking);
    spoken.current = -1;
    videoRef.current?.pause();
  }, [videoRef]);

  // The playback loop.
  useEffect(() => {
    if (!playing || !diagram) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    const finish = (at: number) => {
      tRef.current = at;
      setT(at);
      setPlaying(false);
      target.current = null;
    };
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const video = videoRef.current;
      if (followVideo && video) {
        const t = timeToT(diagram, video.currentTime);
        tRef.current = t;
        setT(t);
        const stopAt = target.current ?? n;
        const endSec = diagram.steps[stopAt - 1].endSec ?? Infinity;
        if (video.ended || video.currentTime >= endSec || t >= stopAt) {
          video.pause();
          finish(stopAt);
          return;
        }
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const cur = tRef.current;
      const waiting = now < holdUntil.current || (speaking.current && Number.isInteger(cur) && spoken.current === cur - 1);
      if (!waiting) {
        if (Number.isInteger(cur) && cur < n && spoken.current !== cur) speak(cur);
        let next = reduce ? Math.floor(cur) + 1 : cur + dt * 0.6 * speed;
        const stopAt = target.current ?? n;
        if (Math.floor(cur) !== Math.floor(next) || next >= stopAt) {
          next = Math.min(Math.floor(cur) + 1, stopAt);
          holdUntil.current = now + (reduce ? 1200 : HOLD_MS);
        }
        tRef.current = next;
        setT(next);
        if (next >= stopAt) {
          finish(stopAt);
          return;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, diagram, followVideo, videoRef, n, speak, speed]);

  const startFrom = (t: number, until: number | null) => {
    if (!diagram) return;
    cancelAnimationFrame(raf.current);
    target.current = until;
    holdUntil.current = 0;
    spoken.current = -1;
    set(t);
    const video = videoRef.current;
    if (followVideo && video) {
      video.currentTime = tToTime(diagram, t);
      void video.play().catch(() => setPlaying(false));
    }
    setPlaying(true);
  };

  return {
    prepared,
    T,
    playing,
    followVideo,
    play: () => startFrom(tRef.current >= n ? 0 : tRef.current, null),
    pause: stop,
    // Plays one step, from its start.
    playStep: (k: number) => startFrom(k, k + 1),
    next: () => {
      const cur = tRef.current;
      if (cur < n) startFrom(cur, Math.floor(cur) + 1);
    },
    prev: () => {
      stop();
      const cur = tRef.current;
      set(Number.isInteger(cur) ? Math.max(0, cur - 1) : Math.floor(cur));
    },
    seek: (t: number) => {
      stop();
      const v = Math.max(0, Math.min(n, t));
      set(v);
      const video = videoRef.current;
      if (followVideo && video && diagram) video.currentTime = tToTime(diagram, v);
    },
  };
}
