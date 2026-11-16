"use client";
// Ask for help → Record screen. The browser asks what to share (a tab, a
// window or the whole screen; a page can't skip that) and, once, for the
// microphone. Sound from a shared tab (Chrome, Edge) is mixed with the
// microphone into one track. Stops on Stop, when the person ends sharing
// from the browser's own bar, or after HELP_RECORDING_MAX_MS.
// Desktop only: see isPhoneOrTablet. Ported from Operations.
import { useEffect, useRef, useState } from "react";
import { baseMime, helpUploadExt, HELP_RECORDING_MAX_MS, isPhoneOrTablet, pickRecordingType } from "../../../lib/help-requests/model";

export function canRecordScreen(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    !isPhoneOrTablet(navigator.userAgent, navigator.maxTouchPoints ?? 0)
  );
}

type State = { phase: "idle" } | { phase: "recording"; ms: number; withMic: boolean };

const why = (e: unknown): string | null => {
  const name = (e as DOMException)?.name;
  // Cancelled in the browser's "choose what to share" picker: not an error.
  if (name === "NotAllowedError" || name === "AbortError") return null;
  if (name === "NotReadableError") return "The screen couldn't be captured. Another app may be using it.";
  // Safari: the click no longer counts once anything was awaited before asking.
  if (name === "InvalidAccessError") return "The browser didn't let the recording start. Press Record screen again.";
  if (name === "NotSupportedError" || name === "TypeError") {
    return "This browser can't record the screen. Use your phone's or computer's own screen recorder, then Attach video.";
  }
  return (e as Error)?.message || "Couldn't start recording.";
};

/** `onDone` gets the finished recording (and whether the microphone was on). */
export function useScreenRecorder(onDone: (file: File, withMic: boolean) => void) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const r = useRef({
    streams: [] as MediaStream[],
    audio: null as AudioContext | null,
    rec: null as MediaRecorder | null,
    chunks: [] as Blob[],
    started: 0,
    tick: 0 as ReturnType<typeof setInterval> | 0,
    discard: false,
  });

  function release() {
    const x = r.current;
    if (x.tick) clearInterval(x.tick);
    x.tick = 0;
    x.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    x.streams = [];
    void x.audio?.close().catch(() => {});
    x.audio = null;
  }

  // Closing the dialog mid-recording stops the capture and the microphone.
  useEffect(() => {
    const x = r.current;
    return () => {
      x.discard = true;
      if (x.rec && x.rec.state !== "inactive") x.rec.stop();
      if (x.tick) clearInterval(x.tick);
      x.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
      void x.audio?.close().catch(() => {});
    };
  }, []);

  function stop() {
    const rec = r.current.rec;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function start() {
    setError(null);
    const x = r.current;
    // Made inside the click: Safari starts a later AudioContext suspended.
    const ctx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    // The screen first, straight from the click: Safari refuses
    // getDisplayMedia once anything has been awaited since the click.
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: true,
        selfBrowserSurface: "include",
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
    } catch (e) {
      void ctx?.close().catch(() => {});
      setError(why(e));
      return;
    }
    // Then the microphone. Refused or none: record without it, and say so.
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      mic = null;
    }
    x.streams = mic ? [screen, mic] : [screen];

    // One audio track: MediaRecorder keeps only the first of several.
    const sources = [screen, mic].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
    let audioTracks: MediaStreamTrack[] = [];
    if (sources.length === 1) {
      audioTracks = sources[0].getAudioTracks();
    } else if (sources.length > 1 && ctx) {
      void ctx.resume().catch(() => {});
      const out = ctx.createMediaStreamDestination();
      sources.forEach(s => ctx.createMediaStreamSource(s).connect(out));
      x.audio = ctx;
      audioTracks = out.stream.getAudioTracks();
    } else if (sources.length > 1 && mic) {
      audioTracks = mic.getAudioTracks();
    }
    if (ctx && x.audio !== ctx) void ctx.close().catch(() => {});

    const type = pickRecordingType(t => MediaRecorder.isTypeSupported?.(t) ?? false);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(
        new MediaStream([...screen.getVideoTracks(), ...audioTracks]),
        type ? { mimeType: type, videoBitsPerSecond: 1_500_000 } : undefined,
      );
    } catch (e) {
      release();
      setError(why(e) ?? "Couldn't start recording.");
      return;
    }
    const withMic = !!mic;
    x.rec = rec;
    x.chunks = [];
    x.discard = false;
    rec.ondataavailable = e => {
      if (e.data.size) x.chunks.push(e.data);
    };
    rec.onstop = () => {
      release();
      x.rec = null;
      if (x.discard) {
        setState({ phase: "idle" });
        return;
      }
      const mime = baseMime(rec.mimeType || type || "video/webm");
      const file = new File(x.chunks, `Screen recording.${helpUploadExt(mime)}`, { type: mime });
      x.chunks = [];
      setState({ phase: "idle" });
      if (file.size) done.current(file, withMic);
      else setError("The recording came out empty. Try again.");
    };
    // The browser's own "Stop sharing" ends the recording too.
    screen.getVideoTracks()[0]?.addEventListener("ended", () => stop());
    rec.start(1000);
    x.started = performance.now();
    setState({ phase: "recording", ms: 0, withMic });
    x.tick = setInterval(() => {
      const ms = performance.now() - x.started;
      if (ms >= HELP_RECORDING_MAX_MS) stop();
      else setState(s => (s.phase === "recording" ? { ...s, ms } : s));
    }, 250);
  }

  function cancel() {
    r.current.discard = true;
    stop();
  }

  return { state, error, start, stop, cancel };
}
