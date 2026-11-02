"use client";
// Stills for the Team Playbook reader, taken in the browser (the server has
// no video tools). Used on upload (Uploader) and by Read the video again.

import { FRAME_COUNT, FRAME_WIDTH } from "../../../lib/team-playbook/types";

export interface Still {
  blob: Blob;
  sec: number;
}

// Evenly spaced stills from a video: a local file (an object URL) on upload,
// or the play's saved video (a signed Storage link, loaded cross-origin so
// the canvas can be read) when it's read again. A video the browser can't
// decode, or won't let the page read, gives none; the play is then read from
// what it already has.
export async function takeStills(src: string, crossOrigin = false): Promise<{ stills: Still[]; duration: number | null }> {
  const video = document.createElement("video");
  if (crossOrigin) video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
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
    video.removeAttribute("src");
    video.load();
  }
}

